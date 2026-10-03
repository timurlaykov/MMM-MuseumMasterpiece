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
    this.cacheOrder = []; // Track keys for memory management
    this.maxCacheEntries = 10; // Keep only last 10 entries to prevent memory growth
  },

  async socketNotificationReceived(notif, payload) {
    if (notif === "AIC_FETCH") {
      const { seed, imageSize, hamApiKey, providers, requestId } = payload;
      const excluded = Array.isArray(payload.excludedProviders) ? payload.excludedProviders : [];
      const available = (providers?.length ? providers : ["CMA", "HAM", "MET", "RIJKS", "AIC"])
        .filter(provider => !excluded.includes(provider) && (provider !== "HAM" || hamApiKey));
      const reply = (notification, data) => this.sendSocketNotification(notification, { ...data, requestId });
      
      if (this.cache[seed] && available.includes(this.cache[seed].providerCode)) {
        return reply("AIC_RESULT", this.cache[seed]);
      }

      try {
        let artData = null;
        let attempts = 0;
        let activeSeed = seed;
        const maxAttempts = available.length ? Math.max(5, available.length) : 0;
        const primary = available.filter(provider => provider !== "AIC");
        const start = primary.length ? Math.abs(this._djb2(seed) % primary.length) : 0;
        const order = [...primary.slice(start), ...primary.slice(0, start), ...available.filter(provider => provider === "AIC")];

        while (attempts < maxAttempts) {
          // Visit every available museum before retrying one that failed.
          const provider = order[attempts % order.length];

          console.log(`[MMM-MuseumMasterpiece] Attempt ${attempts + 1} | Seed: ${activeSeed} | Provider: ${provider}`);

          switch (provider) {
            case "CMA": artData = await this._fetchCMA(activeSeed); break;
            case "HAM": artData = await this._fetchHAM(activeSeed, hamApiKey, imageSize); break;
            case "MET": artData = await this._fetchMET(activeSeed); break;
            case "RIJKS": artData = await this._fetchRIJKS(activeSeed, imageSize); break;
            case "AIC":
            default: artData = await this._fetchAIC(activeSeed, imageSize); break;
          }

          if (artData && !artData.image) artData = null;
          if (artData) {
            artData.providerCode = provider;
            if (!artData.description || artData.description.length < 50) {
              const fallback = await this._fetchWikipediaSummary(artData.title, artData.artist);
              if (fallback) {
                artData.description = fallback;
                artData.descriptionSource = "Wikipedia";
              }
            }

            if (artData.description && artData.description.length > 50) {
              break;
            } else {
              artData = null;
            }
          }
          attempts++;
          activeSeed = `${seed}-retry${attempts}`;
        }

        if (artData) {
          this._addToCache(seed, artData);
          console.log(`[MMM-MuseumMasterpiece] Selected ${artData.providerCode}: ${artData.title}`);
          reply("AIC_RESULT", artData);
        } else {
          throw new Error(`Exhausted ${maxAttempts} attempts. Could not find an artwork with a description.`);
        }
      } catch (err) {
        console.error(`[MMM-MuseumMasterpiece] Fetch error:`, err);
        reply("AIC_ERROR", { message: err.message });
      }
    }
  },

  _addToCache(seed, data) {
    // Prevent memory overflow by keeping only the most recent entries
    this.cache[seed] = data;
    this.cacheOrder = this.cacheOrder.filter(key => key !== seed);
    this.cacheOrder.push(seed);
    if (this.cacheOrder.length > this.maxCacheEntries) {
      const oldKey = this.cacheOrder.shift();
      delete this.cache[oldKey];
    }
  },

  // ── Art Institute of Chicago (AIC) ────────────────────────────────
  async _fetchAIC(seed, imageSize) {
    try {
      const poolUrl = "https://api.artic.edu/api/v1/artworks/search?q=painting&is_public_domain=true&limit=100&fields=id";
      const poolData = await this._fetchJson(poolUrl);
      if (!poolData.data?.length) return null;
      
      const choice = this._pick(poolData.data, seed);
      const detailUrl = `https://api.artic.edu/api/v1/artworks/${choice.id}?fields=id,title,artist_display,date_display,medium_display,description,short_description,thumbnail,image_id,style_title,place_of_origin,credit_line,dimensions,department_title`;
      
      const detail = await this._fetchJson(detailUrl);
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
    } catch (e) { return null; }
  },

  // ── Cleveland Museum of Art (CMA) ─────────────────────────────────
  async _fetchCMA(seed) {
    try {
      const url = "https://openaccess-api.clevelandart.org/api/artworks/?q=painting&has_image=1&limit=100";
      const data = await this._fetchJson(url);
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
    } catch (e) { return null; }
  },

  // ── Harvard Art Museums (HAM) ─────────────────────────────────────
  async _fetchHAM(seed, apiKey, imageSize) {
    try {
      if (!apiKey) throw new Error("Harvard API key required");
      const q = encodeURIComponent("classification:Paintings AND imagepermissionlevel:0 AND verificationlevel:>=3 AND (description:* OR contextualtextcount:>0)");
      const searchUrl = `https://api.harvardartmuseums.org/object?apikey=${apiKey}&q=${q}&hasimage=1&size=100&sort=rank&sortorder=desc`;
      const searchData = await this._fetchJson(searchUrl);
      if (!searchData.records?.length) return null;
      
      const choice = this._pick(searchData.records, seed);
      const detailUrl = `https://api.harvardartmuseums.org/object/${choice.objectid}?apikey=${apiKey}`;
      const d = await this._fetchJson(detailUrl);

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
    } catch (e) { return null; }
  },

  // ── Metropolitan Museum of Art (MET) ──────────────────────────────
  async _fetchMET(seed) {
    try {
      const searchUrl = "https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=painting&offset=0&limit=500";
      const searchData = await this._fetchJson(searchUrl);
      if (!searchData.objectIDs?.length) return null;
      
      const choiceId = this._pick(searchData.objectIDs.slice(0, 500), seed);
      const detailUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${choiceId}`;
      const d = await this._fetchJson(detailUrl);

      return {
        provider: "The Metropolitan Museum of Art",
        title: d.title,
        artist: d.artistDisplayName || "Unknown Artist",
        date: d.objectDate,
        medium: d.medium,
        description: "",
        image: d.primaryImageSmall || d.primaryImage,
        style: d.culture,
        origin: d.country || d.culture,
        creditLine: d.creditLine,
        dimensions: d.dimensions,
        department: d.department
      };
    } catch (e) { return null; }
  },

  // ── Rijksmuseum (RIJKS) ───────────────────────────────────────────
  async _fetchRIJKS(seed, imageSize = 843) {
    try {
      const data = await this._fetchJson("https://data.rijksmuseum.nl/search/collection?type=painting&imageAvailable=true");
      if (!data.orderedItems?.length) return null;
      const obj = await this._resolveRijks(this._pick(data.orderedItems, seed));
      // Linked Art separates artwork, visual representation, and digital image.
      let image;
      for (const ref of (obj.shows || []).slice(0, 3)) {
        const visual = await this._resolveRijks(ref);
        for (const digitalRef of (visual.digitally_shown_by || []).slice(0, 3)) {
          const digital = await this._resolveRijks(digitalRef);
          image = digital.access_point?.map(point => point.id).find(url => url?.startsWith("https://iiif.micr.io/"));
          if (image) break;
        }
        if (image) break;
      }
      if (!image) return null;
      const width = Math.max(1, Math.min(2000, Number(imageSize) || 843));
      image = image.replace(/\/full\/max\//, `/full/${width},/`);
      const descriptions = [];
      const visit = (node, english = false) => {
        const isEnglish = node.language?.length ? node.language.some(lang => lang.id?.endsWith("/300388277")) : english;
        if (isEnglish && node.content && node.classified_as?.some(type => type.id?.endsWith("/300048722"))) descriptions.push(node.content);
        (node.part || []).forEach(part => visit(part, isEnglish));
      };
      (obj.subject_of || []).forEach(node => visit(node));
      return {
        provider: "Rijksmuseum",
        title: this._rijksText((obj.identified_by || []).filter(item => item.type === "Name")),
        artist: this._rijksText(obj.produced_by?.referred_to_by) || "Unknown Artist",
        date: this._rijksText(obj.produced_by?.timespan?.identified_by),
        description: this._stripHtml(descriptions.join(" ")),
        image,
        origin: "Netherlands",
        creditLine: "Rijksmuseum",
        sourceUrl: obj.id
      };
    } catch (e) { return null; }
  },

  _rijksText(items = []) {
    return (items.find(item => item.language?.some(lang => lang.id?.endsWith("/300388277"))) || items.find(item => item.content))?.content || "";
  },

  async _resolveRijks(ref) {
    // Only dereference the museum's canonical identifiers.
    if (!/^https:\/\/id\.rijksmuseum\.nl\/\d+$/.test(ref?.id || "")) throw new Error("Invalid Rijksmuseum identifier");
    return this._fetchJson(`${ref.id}?_profile=la-framed`);
  },

  // ── Wikipedia/Wikidata Fallback ───────────────────────────────────
  async _fetchWikipediaSummary(title, artist) {
    try {
      const query = encodeURIComponent(`${title} ${artist}`);
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`;
      const searchData = await this._fetchJson(searchUrl);
      if (!searchData.query?.search?.length) return null;
      
      const pageTitle = encodeURIComponent(searchData.query.search[0].title);
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
      const summaryData = await this._fetchJson(summaryUrl);
      return summaryData.extract || null;
    } catch (e) { return null; }
  },

  // Bound both the response headers and body read; never log URLs with API keys.
  async _fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs || 10000);
    try {
      const response = await fetchFn(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`[MMM-MuseumMasterpiece] Request failed (${new URL(url).hostname}): ${controller.signal.aborted ? "timeout" : "HTTP or network error"}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
