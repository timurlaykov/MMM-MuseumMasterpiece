/* global Module */

Module.register("MMM-MuseumMasterpiece", {
  defaults: {
    // ── Fetch cadence ──────────────────────────────────────────────
    updateInterval: 12 * 60 * 60 * 1000, // Default: 12 hours
    initialLoadDelay: 3000,
    refreshAtMidnight: true,

    // ── API settings ───────────────────────────────────────────────
    providers: ["AIC", "CMA", "HAM"],
    imageSize: 843,
    hamApiKey: "",

    // ── Layout ─────────────────────────────────────────────────────
    textPosition: "right",
    imageMaxWidth: "420px",
    textAlign: "left",
    maxDescriptionLength: 500,

    // ── Show/hide toggles ──────────────────────────────────────────
    showTitle: true,
    showArtist: true,
    showDate: true,
    showMedium: true,
    showDescription: true,
    showDepartment: false,
    showOrigin: false,
    showCredit: false,
    showDimensions: false,
    showStyle: false,
    showAttribution: true,

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

    this.sendFetchRequest();

    this._intervalId = setInterval(() => {
      this.sendFetchRequest();
    }, this._effectiveInterval());

    if (this.config.refreshAtMidnight) {
      this._scheduleMidnightRefresh();
    }
  },

  sendFetchRequest() {
    this.sendSocketNotification("AIC_FETCH", {
      seed: this._getSeed(),
      imageSize: this.config.imageSize,
      hamApiKey: this.config.hamApiKey,
      providers: this.config.providers
    });
  },

  getStyles() {
    return ["MMM-MuseumMasterpiece.css"];
  },

  socketNotificationReceived(notif, payload) {
    if (notif === "AIC_RESULT") {
      this.loaded = true;
      this.error = null;
      this.art = payload;
      this.updateDom(1000);
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

    if (!this.loaded) {
      wrapper.innerHTML = "<div class='mm-loading'>Loading masterpiece…</div>";
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = `<div class='mm-error'>${this.error}</div>`;
      return wrapper;
    }

    const art = this.art;
    if (!art) return wrapper;

    const card = document.createElement("div");
    card.className = `mm-card layout-${this.config.textPosition}`;

    const img = document.createElement("img");
    img.className = "mm-image";
    img.src = art.image;
    if (art.thumbnailLqip) {
      img.style.backgroundImage = `url(${art.thumbnailLqip})`;
      img.style.backgroundSize = "cover";
    }

    const info = document.createElement("div");
    info.className = "mm-info";

    if (this.config.showTitle && art.title) {
      const el = document.createElement("div");
      el.className = "mm-title";
      el.textContent = art.title;
      info.appendChild(el);
    }

    const metaLine = [];
    if (this.config.showArtist && art.artist) metaLine.push(art.artist);
    if (this.config.showDate && art.date) metaLine.push(art.date);
    if (metaLine.length) {
      const el = document.createElement("div");
      el.className = "mm-meta";
      el.textContent = metaLine.join(" — ");
      info.appendChild(el);
    }

    if (this.config.showMedium && art.medium) {
      const el = document.createElement("div");
      el.className = "mm-body";
      el.textContent = art.medium;
      info.appendChild(el);
    }

    if (this.config.showStyle && art.style) {
      const el = document.createElement("div");
      el.className = "mm-body";
      el.textContent = `Style: ${art.style}`;
      info.appendChild(el);
    }

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

    if (this.config.showAttribution) {
      const el = document.createElement("div");
      el.className = "mm-attrib";
      el.textContent = `Source: ${art.provider}`;
      info.appendChild(el);
    }

    if (this.config.textPosition === "left" || this.config.textPosition === "top") {
      card.appendChild(info);
      card.appendChild(img);
    } else {
      card.appendChild(img);
      card.appendChild(info);
    }

    wrapper.appendChild(card);
    return wrapper;
  },

  _getSeed() {
    const d = new Date();
    // Daily seed
    let seed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    
    // If updateInterval is short (less than an hour), make the seed more granular for testing/rotation
    if (this.config.updateInterval < 60 * 60 * 1000) {
      seed += `-${d.getHours()}-${d.getMinutes()}`;
    }
    
    return seed;
  },

  _effectiveInterval() {
    return Math.max(Number(this.config.updateInterval) || 0, 10 * 1000); // Min 10 seconds
  },

  _scheduleMidnightRefresh() {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    this._midnightTimeout = setTimeout(() => {
      this.sendFetchRequest();
      this._scheduleMidnightRefresh();
    }, next - new Date());
  }
});
