/* global Module */

Module.register("MMM-MuseumMasterpiece", {
  defaults: {
    // ── Fetch cadence ──────────────────────────────────────────────
    updateInterval: 3 * 60 * 60 * 1000,
    initialLoadDelay: 3000,
    refreshAtMidnight: true,

    // ── API settings ───────────────────────────────────────────────
    providers: ["AIC", "CMA", "HAM", "MET", "RIJKS"], 
    imageSize: 843,
    hamApiKey: "",
    rijksApiKey: "",

    // ── Layout ─────────────────────────────────────────────────────
    textPosition: "right",
    imageMaxWidth: "420px",
    textAlign: "left",
    maxDescriptionLength: 1000,

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

  // ── Offline Fallback Data (Mona Lisa) ──────────────────────────
  fallbackArt: {
    provider: "Musée du Louvre (Offline Fallback)",
    title: "Mona Lisa (La Gioconda)",
    artist: "Leonardo da Vinci",
    date: "c. 1503–1506",
    medium: "Oil on poplar panel",
    description: "This iconic portrait depicts Lisa Gherardini, the wife of Florentine merchant Francesco del Giocondo. It is celebrated for its revolutionary use of sfumato—the subtle, smoky blending of colors and tones that creates soft transitions between light and shadow. The subject’s enigmatic expression and the complex, atmospheric landscape background established the Mona Lisa as a masterpiece of Renaissance portraiture, noted for its psychological depth and technical mastery of human anatomy and natural light.",
    image: "modules/MMM-MuseumMasterpiece/assets/mona_lisa.jpg",
    style: "High Renaissance",
    origin: "France",
    creditLine: "Musée du Louvre, Paris",
    dimensions: "77 cm × 53 cm (30 in × 21 in)",
    department: "Paintings",
    isOffline: true
  },

  start() {
    this.loaded = false;
    this.error = null;
    this.art = null;
    this.isFetching = false;

    this.sendFetchRequest();

    this._intervalId = setInterval(() => {
      this.sendFetchRequest();
    }, this._effectiveInterval());

    if (this.config.refreshAtMidnight) {
      this._scheduleMidnightRefresh();
    }
  },

  sendFetchRequest() {
    this.isFetching = true;
    this.sendSocketNotification("AIC_FETCH", {
      seed: this._getSeed(),
      imageSize: this.config.imageSize,
      hamApiKey: this.config.hamApiKey,
      rijksApiKey: this.config.rijksApiKey,
      providers: this.config.providers
    });
  },

  getStyles() {
    return ["MMM-MuseumMasterpiece.css"];
  },

  socketNotificationReceived(notif, payload) {
    if (notif === "AIC_RESULT") {
      const img = new Image();
      img.src = payload.image;
      img.onload = () => {
        this.loaded = true;
        this.error = null;
        this.art = payload;
        this.isFetching = false;
        this.updateDom(1000);
      };
      img.onerror = () => {
        console.error("MMM-MuseumMasterpiece: Failed to pre-load image:", payload.image);
        this.isFetching = false;
        // If we fail to load the remote image, keep whatever we have
      };
    } else if (notif === "AIC_ERROR") {
      this.isFetching = false;
      
      // ── Offline Strategy ──────────────────────────────────────────
      if (!this.art) {
        // CASE: First run and no internet. Show Mona Lisa fallback.
        console.warn("MMM-MuseumMasterpiece: Initial fetch failed. Showing offline fallback.");
        this.art = this.fallbackArt;
        this.loaded = true;
        this.error = null;
        this.updateDom(1000);
      } else {
        // CASE: Already had an image. DO NOTHING (Keep current image).
        console.warn("MMM-MuseumMasterpiece: Update failed. Keeping current masterpiece on screen.");
        // We don't updateDom, we don't show an error. We just stay persistent.
      }
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

    if (!this.loaded && !this.art) {
      wrapper.innerHTML = "<div class='mm-loading'>Loading masterpiece…</div>";
      return wrapper;
    }

    const art = this.art;
    if (!art) return wrapper;

    const card = document.createElement("div");
    card.className = `mm-card layout-${this.config.textPosition}`;

    const img = document.createElement("img");
    img.className = "mm-image";
    img.src = art.image;

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
      let source = `Source: ${art.provider}`;
      if (art.isOffline) source = "⚠️ Mode: Offline (Displaying local masterpiece)";
      else if (art.descriptionSource) source += ` (Story from ${art.descriptionSource})`;
      el.textContent = source;
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
    let seed = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (this.config.updateInterval < 60 * 60 * 1000) {
      seed += `-${d.getHours()}-${d.getMinutes()}`;
    }
    return seed;
  },

  _effectiveInterval() {
    return Math.max(Number(this.config.updateInterval) || 0, 10 * 1000);
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
