# MMM-MuseumMasterpiece

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MagicMirror²](https://img.shields.io/badge/MagicMirror²-Module-blue.svg)](https://magicmirror.builders/)

A premium MagicMirror² module that transforms your mirror into a digital art gallery, displaying a **daily masterpiece** with its **full curator-written story**. 

Unlike other art modules that only show basic metadata, this module focuses on the **narrative**—providing the historical context, artist's technique, and "visual descriptions" that make art truly engaging.

## ✨ Features

- 🌍 **Global Rotation** — Supports masterpieces from the **Art Institute of Chicago**, **Cleveland Museum of Art**, **Harvard Art Museums**, **The Metropolitan Museum of Art (NY)**, and the **Rijksmuseum (Amsterdam)**.
- 📖 **Curator's Stories** — Full art-historical descriptions, not just labels.
- 🧠 **AI/Wikipedia Research** — If a museum provides sparse data, the module automatically queries **Wikipedia** to fetch a high-quality summary of the artwork.
- 🖼️ **High-Res IIIF Images** — Museum-grade resolution using the IIIF protocol (supports Harvard's max resolution).
- 🔄 **Strict Narrative Policy** — Automatically "re-rolls" the selection if an artwork lacks a high-quality description, ensuring your mirror is never silent.
- 🧈 **Smooth Transitions** — Background pre-loading ensures the next artwork cross-fades instantly once the image is fully downloaded.
- 🕛 **Deterministic Daily Refresh** — Automatically switches at midnight. All mirrors globally show the same masterpiece for a shared cultural experience.
- 📱 **Adaptive Layouts** — Side-by-side (Picture/Text) or Vertical (Plaque) layouts.

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

## ⚙️ Configuration

Add the following to your `config/config.js` file:

```javascript
{
  module: "MMM-MuseumMasterpiece",
  position: "lower_third", // Works best in lower_third or bottom_bar for wide layouts
  config: {
    // --- Providers ---
    providers: ["AIC", "CMA", "HAM", "MET", "RIJKS"], 
    hamApiKey: "YOUR_HARVARD_API_KEY",    // Free at harvardartmuseums.org
    rijksApiKey: "YOUR_RIJKS_API_KEY",    // Free at rijksmuseum.nl
    
    // --- Layout ---
    textPosition: "right",              // "left" | "right" | "top" | "bottom"
    imageMaxWidth: "500px",             // Width of the artwork
    maxDescriptionLength: 1000,         // Limit text length (0 = unlimited)
    
    // --- Style ---
    titleFontSize: "36px",
    bodyFontSize: "24px",
    descFontSize: "22px",
    
    // --- Timing ---
    refreshAtMidnight: true,            // Switch art at 00:00:00
    updateInterval: 12 * 60 * 60 * 1000 // Backup refresh every 12 hours
  }
},
```

### 🏛️ Museum Providers

| Code | Museum | Requires API Key? | Story Quality |
| :--- | :--- | :--- | :--- |
| **AIC** | Art Institute of Chicago | No | ⭐⭐⭐⭐⭐ (Historical) |
| **CMA** | Cleveland Museum of Art | No | ⭐⭐⭐⭐ (Descriptive) |
| **RIJKS** | Rijksmuseum (Amsterdam) | **Yes** (Free) | ⭐⭐⭐⭐⭐ (Masterclass) |
| **HAM** | Harvard Art Museums | **Yes** (Free) | ⭐⭐⭐⭐ (Curated) |
| **MET** | Metropolitan Museum (NY) | No | ⭐⭐⭐ (Enhanced by Wikipedia) |

*Note: For all museums, the module automatically uses **Wikipedia** as a secondary researcher if the primary museum record is missing a description.*

## 🎨 Styling Variables

You can fine-tune the look by adjusting these in the `config`:

- `titleFontSize`: Artwork title size.
- `bodyFontSize`: Artist, Date, and Medium info size.
- `descFontSize`: The curator's story font size.
- `titleColor`, `bodyColor`, `descColor`: Custom CSS colors/hex codes.

## 🔧 Troubleshooting

### My display is blank
Check the MagicMirror server logs (`pm2 logs` or `npm start`). 
- **Missing API Key**: Ensure you've added your keys for **HAM** and **RIJKS**.
- **No Story found**: If the module can't find a story for 5 artworks in a row, it will throw an error. Check your internet connection.

### The text is too long or cut off
1. Use `maxDescriptionLength` (e.g., 500) to trim long Wikipedia entries.
2. Reduce `imageMaxWidth` to give the text more horizontal room.
3. Use `position: "lower_third"` for the best panoramic experience.

## 📄 License
MIT — See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments
- Data provided by AIC, CMA, HAM, The MET, and Rijksmuseum.
- Wikipedia REST API for the artwork story fallback.
- IIIF Consortium for image delivery standards.
