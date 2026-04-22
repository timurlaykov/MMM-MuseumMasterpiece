/* global Module */

Module.register("MMM-MuseumMasterpiece", {
  defaults: {
    // ── Fetch cadence ──────────────────────────────────────────────
    updateInterval: 12 * 60 * 60 * 1000,   // 12 hours between refreshes
    initialLoadDelay: 3000,                 // 3s delay before first fetch
    refreshAtMidnight: true,                // auto-refresh when the date flips

    // ── API / Image settings ───────────────────────────────────────
    imageSize: 843,                         // IIIF image width in pixels (max ~3000)

    // ── Layout ─────────────────────────────────────────────────────
    textPosition: "right",                  // "left" | "right" | "top" | "bottom"
    imageMaxWidth: "420px",                 // CSS max-width for the image
    textAlign: "left",                      // "left" | "center" | "right"
    maxDescriptionLength: 500,              // Max characters for description (0 = unlimited)

    // ── Show/hide toggles ──────────────────────────────────────────
    showTitle: true,
    showArtist: true,
    showDate: true,
    showMedium: true,
    showDescription: true,                  // The curator's story — the main feature!
    showDepartment: false,
    showOrigin: false,
    showCredit: false,
    showDimensions: false,
    showStyle: false,
    showAttribution: true,                  // "Art Institute of Chicago" credit line

    // ── Text styling ───────────────────────────────────────────────
    titleFontSize: "20px",
    titleColor: "#fff",
    bodyFontSize: "14px",
    bodyColor: "#ddd",
    descFontSize: "13px",
    descColor: "rgba(255,255,255,0.85)",
    attribFontSize: "11px",
    attribColor: "rgba(255,255,255,0.5)"
  },

  start() {
    this.loaded = false;
    this.error = null;
    this.art = null;

    const fetchNow = () => this.sendSocketNotification("AIC_FETCH", {
      seed: this._todaySeed(),
      imageSize: this.config.imageSize
    });

    // Initial load after a short delay
    setTimeout(fetchNow, this.config.initialLoadDelay);

    // Periodic refresh
    this._intervalId = setInterval(fetchNow, this._effectiveInterval());

    // Midnight refresh
    if (this.config.refreshAtMidnight) {
      this._scheduleMidnightRefresh();
    }
  },

  stop() {
    if (this._intervalId) clearInterval(this._intervalId);
    if (this._midnightTimeout) clearTimeout(this._midnightTimeout);
  },

  getStyles() {
    return ["MMM-MuseumMasterpiece.css"];
  },

  socketNotificationReceived(notif, payload) {
    if (notif === "AIC_RESULT") {
      this.loaded = true;
      this.error = null;
      this.art = payload;
      this.updateDom(1000); // 1s fade animation
    } else if (notif === "AIC_ERROR") {
      this.loaded = true;
      this.error = payload?.message || "Unknown error";
      this.art = null;
      this.updateDom();
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mm-root";

    // Inject CSS custom properties for theming
    wrapper.style.setProperty("--mm-image-max-width", this.config.imageMaxWidth);
    wrapper.style.setProperty("--mm-text-align", this.config.textAlign);
    wrapper.style.setProperty("--mm-title-size", this.config.titleFontSize);
    wrapper.style.setProperty("--mm-title-color", this.config.titleColor);
    wrapper.style.setProperty("--mm-body-size", this.config.bodyFontSize);
    wrapper.style.setProperty("--mm-body-color", this.config.bodyColor);
    wrapper.style.setProperty("--mm-desc-size", this.config.descFontSize);
    wrapper.style.setProperty("--mm-desc-color", this.config.descColor);
    wrapper.style.setProperty("--mm-attrib-size", this.config.attribFontSize);
    wrapper.style.setProperty("--mm-attrib-color", this.config.attribColor);

    // Loading state
    if (!this.loaded) {
      wrapper.innerHTML = "<div class='mm-loading'>Loading masterpiece…</div>";
      return wrapper;
    }

    // Error state
    if (this.error) {
      wrapper.innerHTML = `<div class='mm-error'>${this.error}</div>`;
      return wrapper;
    }

    // Empty state
    if (!this.art) {
      wrapper.innerHTML = "<div class='mm-empty'>No artwork available.</div>";
      return wrapper;
    }

    const art = this.art;

    // ── Build the card ──────────────────────────────────────────
    const card = document.createElement("div");
    card.className = `mm-card layout-${this.config.textPosition}`;

    // Image element with LQIP placeholder
    const img = document.createElement("img");
    img.className = "mm-image";
    img.src = art.image;
    img.alt = art.title || "Artwork";
    img.loading = "lazy";
    if (art.thumbnailLqip) {
      img.style.backgroundImage = `url(${art.thumbnailLqip})`;
      img.style.backgroundSize = "cover";
    }

    // Info panel
    const info = document.createElement("div");
    info.className = "mm-info";

    // Title
    if (this.config.showTitle && art.title) {
      const el = document.createElement("div");
      el.className = "mm-title";
      el.textContent = art.title;
      info.appendChild(el);
    }

    // Artist — Date
    const metaLine = [];
    if (this.config.showArtist && art.artist) metaLine.push(art.artist);
    if (this.config.showDate && art.date) metaLine.push(art.date);
    if (metaLine.length) {
      const el = document.createElement("div");
      el.className = "mm-meta";
      el.textContent = metaLine.join(" — ");
      info.appendChild(el);
    }

    // Medium
    if (this.config.showMedium && art.medium) {
      const el = document.createElement("div");
      el.className = "mm-body";
      el.textContent = art.medium;
      info.appendChild(el);
    }

    // Style
    if (this.config.showStyle && art.style) {
      const el = document.createElement("div");
      el.className = "mm-body";
      el.textContent = `Style: ${art.style}`;
      info.appendChild(el);
    }

    // Origin
    if (this.config.showOrigin && art.origin) {
      const el = document.createElement("div");
      el.className = "mm-body";
      el.textContent = `Origin: ${art.origin}`;
      info.appendChild(el);
    }

    // ★ THE CURATOR'S DESCRIPTION — the main differentiator!
    if (this.config.showDescription && art.description) {
      const el = document.createElement("div");
      el.className = "mm-description";
      let desc = art.description;
      if (this.config.maxDescriptionLength > 0 && desc.length > this.config.maxDescriptionLength) {
        desc = desc.substring(0, this.config.maxDescriptionLength).replace(/\s+\S*$/, "") + "…";
      }
      el.textContent = desc;
      info.appendChild(el);
    }

    // Department
    if (this.config.showDepartment && art.department) {
      const el = document.createElement("div");
      el.className = "mm-body mm-faded";
      el.textContent = art.department;
      info.appendChild(el);
    }

    // Credit
    if (this.config.showCredit && art.creditLine) {
      const el = document.createElement("div");
      el.className = "mm-body mm-faded";
      el.textContent = art.creditLine;
      info.appendChild(el);
    }

    // Dimensions
    if (this.config.showDimensions && art.dimensions) {
      const el = document.createElement("div");
      el.className = "mm-body mm-faded";
      el.textContent = art.dimensions;
      info.appendChild(el);
    }

    // Attribution
    if (this.config.showAttribution) {
      const el = document.createElement("div");
      el.className = "mm-attrib";
      el.textContent = "Image & data: Art Institute of Chicago";
      info.appendChild(el);
    }

    // ── Assemble card based on text position ────────────────────
    switch (this.config.textPosition) {
      case "left":
        card.appendChild(info);
        card.appendChild(img);
        break;
      case "top":
        card.appendChild(info);
        card.appendChild(img);
        break;
      case "bottom":
        card.appendChild(img);
        card.appendChild(info);
        break;
      case "right":
      default:
        card.appendChild(img);
        card.appendChild(info);
        break;
    }

    wrapper.appendChild(card);
    return wrapper;
  },

  // ── Private helpers ─────────────────────────────────────────────

  /** Returns a date string like "2026-04-21" used as the daily seed */
  _todaySeed() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  /** Compute effective interval respecting a hard minimum of 10 minutes */
  _effectiveInterval() {
    const requested = Math.max(1, Number(this.config.updateInterval) || 0);
    const HARD_MIN_MS = 10 * 60 * 1000;
    return Math.max(requested, HARD_MIN_MS);
  },

  /** Schedule a one-shot timer at local midnight, then reschedule */
  _scheduleMidnightRefresh() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const ms = next - now;

    this._midnightTimeout = setTimeout(() => {
      this.sendSocketNotification("AIC_FETCH", {
        seed: this._todaySeed(),
        imageSize: this.config.imageSize
      });
      this._scheduleMidnightRefresh();
    }, ms);
  }
});
