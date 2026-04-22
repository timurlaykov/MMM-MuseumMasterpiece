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
      const { seed, imageSize, hamApiKey, providers } = payload;
      
      // 1. Check cache first
      if (this.cache[seed]) {
        return this.sendSocketNotification("AIC_RESULT", this.cache[seed]);
      }

      try {
        // 2. Determine Provider of the Day (Round-Robin) from the user's list
        const activeProviders = (providers && providers.length > 0) ? providers : ["AIC", "CMA", "HAM"];
        const dayHash = this._djb2(seed);
        const providerIndex = Math.abs(dayHash % activeProviders.length);
        const provider = activeProviders[providerIndex];

        console.log(`[MMM-MuseumMasterpiece] Seed: ${seed} | Hash: ${dayHash} | Provider: ${provider}`);

        let artData = null;

        // 3. Fetch from the chosen provider
        switch (provider) {
          case "CMA":
            artData = await this._fetchCMA(seed);
            break;
          case "HAM":
            artData = await this._fetchHAM(seed, hamApiKey, imageSize);
            break;
          case "AIC":
          default:
            artData = await this._fetchAIC(seed, imageSize);
            break;
        }

        if (artData) {
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

  // ── Art Institute of Chicago (AIC) Provider ───────────────────────
  async _fetchAIC(seed, imageSize) {
    const poolUrl = "https://api.artic.edu/api/v1/artworks/search?q=painting&is_public_domain=true&limit=100&fields=id";
    const poolRes = await fetchFn(poolUrl);
    const poolData = await poolRes.json();
    
    if (!poolData.data || poolData.data.length === 0) return null;
    
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

  // ── Cleveland Museum of Art (CMA) Provider ────────────────────────
  async _fetchCMA(seed) {
    const url = "https://openaccess-api.clevelandart.org/api/artworks/?q=painting&has_image=1&limit=100";
    const res = await fetchFn(url);
    const data = await res.json();
    
    if (!data.data || data.data.length === 0) return null;
    
    const d = this._pick(data.data, seed);

    return {
      provider: "Cleveland Museum of Art",
      title: d.title,
      artist: d.creators?.[0]?.description || "Unknown Artist",
      date: d.creation_date,
      medium: d.technique || d.type,
      description: this._stripHtml(d.description || d.wall_description || ""),
      image: d.images?.web?.url || d.images?.print?.url,
      thumbnailLqip: null,
      style: d.culture?.[0] || null,
      origin: d.culture?.[0] || null,
      creditLine: d.creditline,
      dimensions: d.dimensions,
      department: d.department
    };
  },

  // ── Harvard Art Museums (HAM) Provider ────────────────────────────
  async _fetchHAM(seed, apiKey, imageSize) {
    if (!apiKey) {
      throw new Error("Harvard Art Museums requires an API key in config. See README.");
    }

    // Optimization: Filter for Paintings, unrestricted images (level 0), and good metadata (verification >= 3)
    const q = encodeURIComponent("classification:Paintings AND imagepermissionlevel:0 AND verificationlevel:>=3");
    const url = `https://api.harvardartmuseums.org/object?apikey=${apiKey}&q=${q}&hasimage=1&size=100&sort=rank&sortorder=desc`;
    
    const res = await fetchFn(url);
    const data = await res.json();
    
    if (!data.records || data.records.length === 0) return null;
    
    // Pick based on daily seed
    const d = this._pick(data.records, seed);

    // HAM Description Logic: Try description -> commentary -> labeltext -> contextualtext
    let desc = d.description || d.commentary || d.labeltext || "";
    
    // Fallback to contextualtext if still empty
    if (!desc && d.contextualtext && d.contextualtext.length > 0) {
      // Find the longest text block in the contextual array (usually the Published Catalogue Text)
      const sortedTexts = [...d.contextualtext].sort((a, b) => (b.text || "").length - (a.text || "").length);
      desc = sortedTexts[0].text;
    }

    // High-Res Image Logic: Correct IIIF usage based on documentation
    let imageUrl = d.primaryimageurl;
    // Check if the canonical image has a IIIF base URI
    const iiifBase = d.images?.[0]?.iiifbaseuri || d.iiifbaseuri;
    
    if (iiifBase) {
      // Construct the high-res URL. 
      // Documentation says base + /full/size/0/default.jpg
      imageUrl = `${iiifBase}/full/${imageSize},/0/default.jpg`;
    } else if (imageUrl && !imageUrl.includes("/full/")) {
      // Some Harvard primaryimageurls are NRS redirects that support IIIF parameters
      imageUrl = `${imageUrl}/full/${imageSize},/0/default.jpg`;
    }

    // Extract Artist Display Name
    const artistObj = d.people?.find(p => p.role === "Artist") || d.people?.[0];
    const artist = artistObj ? artistObj.displayname : "Unknown Artist";

    return {
      provider: "Harvard Art Museums",
      title: d.title,
      artist: artist,
      date: d.dated,
      medium: d.medium,
      description: this._stripHtml(desc),
      image: imageUrl,
      thumbnailLqip: null,
      style: d.period || d.culture,
      origin: d.culture,
      creditLine: d.creditline,
      dimensions: d.dimensions,
      department: d.department
    };
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
      .replace(/<[^>]*>?/gm, " ") // Remove tags
      .replace(/&nbsp;/g, " ")    // Entities
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\r\n/g, " ")      // Clean newlines
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")       // Collapse whitespace
      .trim();
  }
});
