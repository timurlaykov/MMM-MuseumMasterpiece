# MMM-MuseumMasterpiece

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MagicMirror²](https://img.shields.io/badge/MagicMirror²-Module-blue.svg)](https://magicmirror.builders/)

A MagicMirror² module that transforms your mirror into a digital art gallery, displaying a **daily masterpiece** with a **full curator's description** from the [Art Institute of Chicago](https://www.artic.edu/) — one of the world's premier art museums.

Unlike other art modules that only show the artist's name, this module displays the **complete story** behind each painting: its historical context, the artist's technique, and why it matters. Perfect for learning something new about art every single day.

## ✨ Features

- 🎨 **Daily Masterpiece** — A new public-domain painting every day
- 📖 **Curator's Description** — Full art-historical story, not just metadata
- 🖼️ **High-Quality IIIF Images** — Museum-grade resolution via the IIIF protocol
- ⚡ **LQIP Placeholders** — Low-quality image previews while the full image loads
- 📱 **Flexible Layouts** — Text left/right/top/bottom of the image
- 🔄 **Smart Caching** — One API call per day, deterministic daily selection
- 🕛 **Midnight Refresh** — Automatically shows a new artwork each morning
- 🎛️ **Fully Configurable** — Toggle every metadata field, customize all styling

## 🚀 Installation

1. Navigate to your MagicMirror modules directory:
   ```bash
   cd ~/MagicMirror/modules
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/timurlaykov/MMM-MuseumMasterpiece.git
   ```

3. Install dependencies:
   ```bash
   cd MMM-MuseumMasterpiece
   npm install
   ```

4. Add the module to your `config/config.js` file:
   
   Open your configuration file:
   ```bash
   nano ~/MagicMirror/config/config.js
   ```

   Add the following object to the `modules: [...]` array:

   ```javascript
   {
     module: "MMM-MuseumMasterpiece",
     position: "bottom_left", // Choose any valid position
     config: {
       showDescription: true,      // Set to true to show the curator's story
       textPosition: "bottom",     // Position text relative to image (left, right, top, bottom)
       imageMaxWidth: "400px",     // Adjust based on your screen size
       refreshAtMidnight: true     // Confirmed: Automatically updates to a new artwork at 00:00:00
     }
   },

## ⚙️ Configuration

### Basic Config
```javascript
{
  module: "MMM-MuseumMasterpiece",
  position: "bottom_left",
  config: {
    updateInterval: 12 * 60 * 60 * 1000,   // Refresh every 12 hours
    initialLoadDelay: 3000,                  // Wait 3s before first fetch
    refreshAtMidnight: true,                 // New art at midnight
    imageSize: 843                           // IIIF image width in pixels
  }
}
```

### Display Toggles
```javascript
config: {
  showTitle: true,           // Artwork title
  showArtist: true,          // Artist name
  showDate: true,            // Creation date
  showMedium: true,          // Oil on canvas, etc.
  showDescription: true,     // ★ The curator's full story
  showStyle: false,          // Art style (Impressionism, etc.)
  showOrigin: false,         // Country of origin
  showDepartment: false,     // Museum department
  showCredit: false,         // Donor credit line
  showDimensions: false,     // Physical dimensions
  showAttribution: true      // "Art Institute of Chicago" credit
}
```

### Layout Options
```javascript
config: {
  textPosition: "right",       // "left" | "right" | "top" | "bottom"
  imageMaxWidth: "420px",      // CSS max-width for the artwork image
  textAlign: "left",           // "left" | "center" | "right"
  maxDescriptionLength: 500    // Truncate description (0 = unlimited)
}
```

### Styling
```javascript
config: {
  titleFontSize: "20px",
  titleColor: "#fff",
  bodyFontSize: "14px",
  bodyColor: "#ddd",
  descFontSize: "13px",
  descColor: "rgba(255,255,255,0.85)",
  attribFontSize: "11px",
  attribColor: "rgba(255,255,255,0.5)"
}
```

## 🏗️ Architecture

This module follows the standard MagicMirror² module pattern:

```
MMM-MuseumMasterpiece/
├── MMM-MuseumMasterpiece.js   # Frontend: DOM rendering & lifecycle
├── MMM-MuseumMasterpiece.css  # Styling with CSS custom properties
├── node_helper.js             # Backend: API calls, caching, HTML stripping
├── package.json               # Dependencies (node-fetch v2 fallback)
└── README.md                  # This file
```

### Data Flow
```
┌─────────────────┐     AIC_FETCH      ┌──────────────┐
│  Frontend (.js) │ ──────────────────► │ node_helper  │
│                 │                     │              │
│  getDom()       │     AIC_RESULT      │  fetchArt()  │
│  renders card   │ ◄────────────────── │  _stripHtml()│
│  with image +   │                     │  IIIF URL    │
│  description    │     AIC_ERROR       │  caching     │
│                 │ ◄────────────────── │              │
└─────────────────┘                     └──────┬───────┘
                                               │
                                               ▼
                                    Art Institute of Chicago API
                                    https://api.artic.edu/api/v1
```

### API Details

**Data Source:** [Art Institute of Chicago Public API](https://api.artic.edu/docs)
- No API key required
- No rate limit headers (but we self-limit to 1-2 calls/day)
- Returns CC0-licensed metadata + CC-BY descriptions

**Image Delivery:** [IIIF Image API](https://iiif.io/)
- Base URL: `https://www.artic.edu/iiif/2/{image_id}/full/{width},/0/default.jpg`
- Supports arbitrary resolutions up to the original scan size
- Museum-grade quality

**Key API Endpoints Used:**
| Endpoint | Purpose |
|---|---|
| `GET /artworks/search?q=painting&is_public_domain=true` | Pool of candidate artworks |
| `GET /artworks/{id}?fields=...` | Full artwork detail with description |

**Key Fields Retrieved:**
| Field | Type | Description |
|---|---|---|
| `title` | string | Name of the artwork |
| `artist_display` | string | Artist name with dates and nationality |
| `date_display` | string | Human-readable creation date |
| `description` | HTML string | Full curator's description (the star!) |
| `short_description` | string | Shorter fallback description |
| `image_id` | UUID | Used to construct the IIIF image URL |
| `medium_display` | string | "Oil on canvas", etc. |
| `style_title` | string | "Impressionism", "Pointillism", etc. |
| `place_of_origin` | string | Country/region |

## 🔧 Development

### Prerequisites
- Node.js v18+ (uses native `fetch`; falls back to `node-fetch` v2 for older versions)
- MagicMirror² v2.0.0+
- Internet connection

### Local Testing
```bash
# From MagicMirror root
npm run server
# Open http://localhost:8080 in a browser
```

### Debug Mode
Check the MagicMirror server console for log output prefixed with `[MMM-MuseumMasterpiece]`.

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **[Art Institute of Chicago](https://www.artic.edu/)** for their extraordinary public API
- **[IIIF Consortium](https://iiif.io/)** for the image delivery standard
- **[MagicMirror² Community](https://magicmirror.builders/)** for the framework
- **[MMM-DailyMetArt](https://github.com/flightlesstux/MMM-DailyMetArt)** for architectural inspiration
