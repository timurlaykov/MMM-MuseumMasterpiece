const NodeHelper = require("node_helper");

// Prefer global fetch if available (Node 18+), else fall back to node-fetch v2.
let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require("node-fetch"); } catch (_) {}
}
const fetch = (...args) => fetchFn(...args);

const AIC_BASE = "https://api.artic.edu/api/v1";
const IIIF_BASE = "https://www.artic.edu/iiif/2";

// Fields we request from the API — keeps responses lean
const ARTWORK_FIELDS = [
  "id", "title", "artist_display", "date_display",
  "medium_display", "description", "short_description",
  "thumbnail", "image_id", "classification_title",
  "department_title", "place_of_origin", "credit_line",
  "dimensions", "artwork_type_title", "style_title"
].join(",");

module.exports = NodeHelper.create({
  start() {
    this.cache = {};
    this.artworkIds = null;  // cached list of public-domain painting IDs
    this.artworkIdsFetchedAt = 0;
  },

  socketNotificationReceived(notif, payload) {
    if (notif === "AIC_FETCH") {
      this.fetchArt(payload).catch(err => {
        console.error("[MMM-MuseumMasterpiece] Error:", err.message || err);
        this.sendSocketNotification("AIC_ERROR", { message: err?.message || String(err) });
      });
    }
  },

  /**
   * Main fetch logic:
   * 1. Search for public-domain paintings with images (cached for 24h).
   * 2. Deterministically pick one based on the date seed.
   * 3. Fetch full artwork details including the curator description.
   * 4. Construct the IIIF image URL at the configured resolution.
   * 5. Send the result back to the frontend module.
   */
  async fetchArt({ seed, imageSize }) {
    // Return from daily cache if we already fetched this seed
    if (seed && this.cache[seed]) {
      this.sendSocketNotification("AIC_RESULT", this.cache[seed]);
      return;
    }

    // Step 1: Get a pool of public-domain painting IDs (cached 24h)
    const ids = await this._getArtworkPool();
    if (!ids.length) throw new Error("No public-domain artworks found.");

    // Step 2: Pick one deterministically from the pool
    const id = this._pick(ids, seed);

    // Step 3: Fetch full details for the selected artwork
    const url = `${AIC_BASE}/artworks/${id}?fields=${ARTWORK_FIELDS}`;
    const response = await this._json(url);
    const obj = response.data;

    if (!obj || !obj.image_id) {
      throw new Error("Selected artwork has no image.");
    }

    // Step 4: Construct IIIF image URL
    // Format: {iiif_base}/{image_id}/full/{size}/0/default.jpg
    const size = imageSize || 843;
    const imageUrl = `${IIIF_BASE}/${obj.image_id}/full/${size},/0/default.jpg`;

    // Step 5: Clean up the description HTML to plain text
    const description = this._stripHtml(obj.description || obj.short_description || "");

    const payload = {
      image: imageUrl,
      title: obj.title || "Untitled",
      artist: obj.artist_display || "Unknown Artist",
      date: obj.date_display || "",
      medium: obj.medium_display || "",
      department: obj.department_title || "",
      classification: obj.classification_title || "",
      origin: obj.place_of_origin || "",
      creditLine: obj.credit_line || "",
      dimensions: obj.dimensions || "",
      style: obj.style_title || "",
      description: description,
      artworkUrl: `https://www.artic.edu/artworks/${obj.id}`,
      thumbnailLqip: obj.thumbnail?.lqip || null
    };

    // Cache by date seed
    if (seed) this.cache[seed] = payload;
    this.sendSocketNotification("AIC_RESULT", payload);
  },

  /**
   * Fetches a pool of public-domain artwork IDs from the search endpoint.
   * Uses Elasticsearch query syntax to filter for:
   *   - Public domain artworks only
   *   - Artworks that have images
   * Results are cached for 24 hours to avoid hammering the API.
   */
  async _getArtworkPool() {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (this.artworkIds && (Date.now() - this.artworkIdsFetchedAt < ONE_DAY)) {
      return this.artworkIds;
    }

    // Use the search endpoint with Elasticsearch body
    // We request a large batch of IDs (100 pages × 100 items = up to 10,000)
    // but only need the IDs, so it's very lightweight
    const searchUrl = `${AIC_BASE}/artworks/search?q=painting&is_public_domain=true&limit=100&fields=id,image_id&page=1`;
    const result = await this._json(searchUrl);

    // Filter to artworks that actually have an image_id
    const ids = (result.data || [])
      .filter(item => item.image_id)
      .map(item => item.id);

    this.artworkIds = ids;
    this.artworkIdsFetchedAt = Date.now();
    return ids;
  },

  /**
   * Fetch JSON from a URL with timeout protection.
   */
  async _json(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
      return r.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Deterministic pick: same seed (date string) always returns the same artwork.
   * Uses a simple DJB2 hash to convert the seed string to an index.
   */
  _pick(list, seed) {
    if (!seed) return list[Math.floor(Math.random() * list.length)];
    let h = 5381;
    for (const c of seed) { h = ((h << 5) + h) + c.charCodeAt(0); h |= 0; }
    return list[Math.abs(h) % list.length];
  },

  /**
   * Strip HTML tags from a string and clean up whitespace.
   * The AIC API returns descriptions with <p>, <em>, <a> tags etc.
   */
  _stripHtml(html) {
    if (!html) return "";
    return html
      .replace(/<[^>]*>/g, "")       // Remove HTML tags
      .replace(/\\n/g, " ")           // Replace escaped newlines
      .replace(/\s+/g, " ")           // Collapse whitespace
      .replace(/\\u[\dA-Fa-f]{4}/g, match => {
        return String.fromCharCode(parseInt(match.replace("\\u", ""), 16));
      })
      .trim();
  }
});
