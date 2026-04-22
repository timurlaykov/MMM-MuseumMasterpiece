const NodeHelper = require("node_helper");

// ── Fetch fallback (Native fetch in Node 18+, fallback to node-fetch v2) ─────
let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require("node-fetch"); } catch (_) {}
}

module.exports = NodeHelper.create({
  start() {
    console.log(`[MMM-MuseumMasterpiece] Backend helper started.`);
    this.cache = {}; // Cache results by date seed: { "2026-04-21": { artData } }
  },

  async socketNotificationReceived(notif, payload) {
    if (notif === "AIC_FETCH") {
      const { seed, imageSize, hamApiKey, rijksApiKey, providers } = payload;
      
      if (this.cache[seed]) {
        return this.sendSocketNotification("AIC_RESULT", this.cache[seed]);
      }

      try {
        const activeProviders = (providers && providers.length > 0) ? providers : ["AIC", "CMA", "HAM", "MET", "RIJKS"];
        const dayHash = this._djb2(seed);
        const providerIndex = Math.abs(dayHash % activeProviders.length);
        const provider = activeProviders[providerIndex];

        console.log(`[MMM-MuseumMasterpiece] Seed: ${seed} | Provider: ${provider}`);

        let artData = null;

        switch (provider) {
          case "CMA":
            artData = await this._fetchCMA(seed);
            break;
          case "HAM":
            artData = await this._fetchHAM(seed, hamApiKey, imageSize);
            break;
          case "MET":
            artData = await this._fetchMET(seed);
            break;
          case "RIJKS":
            artData = await this._fetchRIJKS(seed, rijksApiKey);
            break;
          case "AIC":
          default:
            artData = await this._fetchAIC(seed, imageSize);
            break;
        }

        if (artData) {
          // ── Fallback Description (Wikidata/Wikipedia) ─────────────
          if (!artData.description || artData.description.length < 50) {
            console.log(`[MMM-MuseumMasterpiece] Empty description for ${artData.title}. Fetching from Wikidata/Wikipedia...`);
            const fallback = await this._fetchWikipediaSummary(artData.title, artData.artist);
            if (fallback) {
              artData.description = fallback;
              artData.descriptionSource = "Wikipedia";
            }
          }

          this.cache[seed] = artData;
          this.sendSocketNotification("AIC_RESULT", artData);
        } else {
          throw new Error(`Failed to fetch from ${provider}`);
        }
      } catch (err) {
        console.error(`[MMM-MuseumMasterpiece] Fetch error:`, err);
        this.sendSocketNotification("AIC_ERROR", { message: err.message });
      }
    }
  },

  // ── Art Institute of Chicago (AIC) ────────────────────────────────
  async _fetchAIC(seed, imageSize) {
    const poolUrl = "https://api.artic.edu/api/v1/artworks/search?q=painting&is_public_domain=true&limit=100&fields=id";
    const poolRes = await fetchFn(poolUrl);
    const poolData = await poolRes.json();
    if (!poolData.data?.length) return null;
    
    const choice = this._pick(poolData.data, seed);
    const detailUrl = `https://api.artic.edu/api/v1/artworks/${choice.id}?fields=id,title,artist_display,date_display,medium_display,description,short_description,thumbnail,image_id,style_title,place_of_origin,credit_line,dimensions,department_title`;
    
    const detailRes = await fetchFn(detailUrl);
    const detail = await detailRes.json();
    const d = detail.data;

    return {
      provider: "Art Institute of Chicago",
      title: d.title,
      artist: d.artist_display,
      date: d.date_display,
      medium: d.medium_display,
      description: this._stripHtml(d.description || d.short_description || ""),
      image: `https://www.artic.edu/iiif/2/${d.image_id}/full/${imageSize},/0/default.jpg`,
      thumbnailLqip: d.thumbnail?.lqip || null,
      style: d.style_title,
      origin: d.place_of_origin,
      creditLine: d.credit_line,
      dimensions: d.dimensions,
      department: d.department_title
    };
  },

  // ── Cleveland Museum of Art (CMA) ─────────────────────────────────
  async _fetchCMA(seed) {
    const url = "https://openaccess-api.clevelandart.org/api/artworks/?q=painting&has_image=1&limit=100";
    const res = await fetchFn(url);
    const data = await res.json();
    if (!data.data?.length) return null;
    
    const d = this._pick(data.data, seed);

    return {
      provider: "Cleveland Museum of Art",
      title: d.title,
      artist: d.creators?.[0]?.description || "Unknown Artist",
      date: d.creation_date,
      medium: d.technique || d.type,
      description: this._stripHtml(d.description || d.wall_description || ""),
      image: d.images?.web?.url || d.images?.print?.url,
      style: d.culture?.[0] || null,
      origin: d.culture?.[0] || null,
      creditLine: d.creditline,
      dimensions: d.dimensions,
      department: d.department
    };
  },

  // ── Harvard Art Museums (HAM) ─────────────────────────────────────
  async _fetchHAM(seed, apiKey, imageSize) {
    if (!apiKey) throw new Error("Harvard API key required");
    const q = encodeURIComponent("classification:Paintings AND imagepermissionlevel:0 AND verificationlevel:>=3 AND (description:* OR contextualtextcount:>0)");
    const searchUrl = `https://api.harvardartmuseums.org/object?apikey=${apiKey}&q=${q}&hasimage=1&size=100&sort=rank&sortorder=desc`;
    const searchRes = await fetchFn(searchUrl);
    const searchData = await searchRes.json();
    if (!searchData.records?.length) return null;
    
    const choice = this._pick(searchData.records, seed);
    const detailUrl = `https://api.harvardartmuseums.org/object/${choice.objectid}?apikey=${apiKey}`;
    const detailRes = await fetchFn(detailUrl);
    const d = await detailRes.json();

    let desc = d.description || d.commentary || d.labeltext || "";
    if (!desc && d.contextualtext?.length) {
      const sortedTexts = [...d.contextualtext].sort((a, b) => (b.text || "").length - (a.text || "").length);
      desc = sortedTexts[0].text;
    }

    let imageUrl = d.primaryimageurl;
    const iiifBase = d.images?.[0]?.iiifbaseuri || d.iiifbaseuri;
    if (iiifBase) imageUrl = `${iiifBase}/full/${imageSize},/0/default.jpg`;

    return {
      provider: "Harvard Art Museums",
      title: d.title,
      artist: (d.people?.find(p => p.role === "Artist") || d.people?.[0])?.displayname || "Unknown Artist",
      date: d.dated,
      medium: d.medium,
      description: this._stripHtml(desc),
      image: imageUrl,
      style: d.period || d.culture,
      origin: d.culture,
      creditLine: d.creditline,
      dimensions: d.dimensions,
      department: d.department
    };
  },

  // ── Metropolitan Museum of Art (MET) ──────────────────────────────
  async _fetchMET(seed) {
    const searchUrl = "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting";
    const searchRes = await fetchFn(searchUrl);
    const searchData = await searchRes.json();
    if (!searchData.objectIDs?.length) return null;
    
    const choiceId = this._pick(searchData.objectIDs.slice(0, 500), seed); // Sample first 500
    const detailUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${choiceId}`;
    const detailRes = await fetchFn(detailUrl);
    const d = await detailRes.json();

    return {
      provider: "The Metropolitan Museum of Art",
      title: d.title,
      artist: d.artistDisplayName || "Unknown Artist",
      date: d.objectDate,
      medium: d.medium,
      description: "", // MET API often has empty descriptions, Wikipedia fallback will handle it
      image: d.primaryImage || d.primaryImageSmall,
      style: d.culture,
      origin: d.country || d.culture,
      creditLine: d.creditLine,
      dimensions: d.dimensions,
      department: d.department
    };
  },

  // ── Rijksmuseum (RIJKS) ───────────────────────────────────────────
  async _fetchRIJKS(seed, apiKey) {
    const key = apiKey || "0fS5v4TH"; // My dev key or placeholder
    const url = `https://www.rijksmuseum.nl/api/en/collection?key=${key}&format=json&type=painting&imgonly=True&ps=100`;
    const res = await fetchFn(url);
    const data = await res.json();
    if (!data.artObjects?.length) return null;
    
    const d = this._pick(data.artObjects, seed);
    
    // Get detail for better description
    const detailUrl = `https://www.rijksmuseum.nl/api/en/collection/${d.objectNumber}?key=${key}&format=json`;
    const detailRes = await fetchFn(detailUrl);
    const detail = await detailRes.json();
    const obj = detail.artObject;

    return {
      provider: "Rijksmuseum",
      title: obj.title,
      artist: obj.principalMaker,
      date: obj.dating?.presentingDate,
      medium: obj.physicalMedium,
      description: this._stripHtml(obj.description || obj.plaqueDescriptionEnglish || ""),
      image: obj.webImage?.url,
      style: obj.materials?.join(", "),
      origin: "Netherlands",
      creditLine: "Rijksmuseum Open Access",
      dimensions: obj.subTitle,
      department: obj.classification?.objectName?.[0]
    };
  },

  // ── Wikipedia/Wikidata Fallback ───────────────────────────────────
  async _fetchWikipediaSummary(title, artist) {
    try {
      // 1. Search for the artwork on Wikipedia
      const query = encodeURIComponent(`${title} ${artist}`);
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`;
      const searchRes = await fetchFn(searchUrl);
      const searchData = await searchRes.json();
      
      if (!searchData.query?.search?.length) return null;
      
      // 2. Get the top result's summary
      const pageTitle = encodeURIComponent(searchData.query.search[0].title);
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
      const summaryRes = await fetchFn(summaryUrl);
      const summaryData = await summaryRes.json();
      
      if (summaryData.extract) {
        return summaryData.extract;
      }
    } catch (e) {
      console.error("[MMM-MuseumMasterpiece] Wikipedia fallback failed:", e);
    }
    return null;
  },

  // ── Helpers ───────────────────────────────────────────────────────
  _pick(list, seed) {
    const hash = this._djb2(seed);
    return list[Math.abs(hash % list.length)];
  },

  _djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
    }
    return hash;
  },

  _stripHtml(html) {
    if (!html) return "";
    return html
      .replace(/<[^>]*>?/gm, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }
});
