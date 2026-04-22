# MMM-MuseumMasterpiece

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MagicMirror²](https://img.shields.io/badge/MagicMirror²-Module-blue.svg)](https://magicmirror.builders/)

A premium MagicMirror² module that transforms your mirror into a digital art gallery, displaying a **daily masterpiece** with its **full curator-written story**. 

Unlike other art modules that only show basic metadata, this module focuses on the **narrative**—providing the historical context, artist's technique, and "visual descriptions" that make art truly engaging.

## ✨ Features

- 🌍 **Global Rotation** — Supports masterpieces from the **Art Institute of Chicago**, **Cleveland Museum of Art**, and **Harvard Art Museums**.
- 📖 **Curator's Stories** — Full art-historical descriptions, not just labels.
- 🔄 **Configurable Rotation** — Choose which museums to include and their order in your config.
- 🕛 **Deterministic Daily Refresh** — Automatically switches to a new artwork at midnight. All mirrors on your network will show the same masterpiece.
- 🖼️ **High-Res IIIF Images** — Museum-grade resolution using the IIIF protocol.
- 📱 **Adaptive Layouts** — Side-by-side (Picture/Text) or Vertical (Plaque) layouts.
- 🎛️ **Fully Styleable** — Customize font sizes, colors, and image widths directly from `config.js`.

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
    providers: ["AIC", "CMA", "HAM"],   // AIC = Chicago, CMA = Cleveland, HAM = Harvard
    hamApiKey: "YOUR_HARVARD_API_KEY",  // Get one free at harvardartmuseums.org
    
    // --- Layout ---
    textPosition: "right",              // "left" | "right" | "top" | "bottom"
    imageMaxWidth: "500px",             // Size of the artwork
    maxDescriptionLength: 0,            // 0 = unlimited (show the whole story)
    
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
| **HAM** | Harvard Art Museums | **Yes** | ⭐⭐⭐ (Contextual) |

*Note: For Harvard Art Museums, if the primary description is empty, the module will automatically fall back to the `contextual_text` field.*

## 🎨 Styling Variables

You can fine-tune the look by adjusting these in the `config`:

- `titleFontSize`: Artwork title size.
- `bodyFontSize`: Artist, Date, and Medium info size.
- `descFontSize`: The curator's story font size.
- `titleColor`, `bodyColor`, `descColor`: Custom CSS colors/hex codes.

## 🔧 Troubleshooting

### My display is blank
Check the MagicMirror server logs. If you are using **HAM** (Harvard) without an API key, the module will throw an error in the console.

### The text is cut off
If your mirror's region is too small, the text may be clipped. 
1. Use `position: "lower_third"` for full-width spanning.
2. Set `textPosition: "right"` to use a side-by-side layout.
3. Reduce `imageMaxWidth` to give the text more horizontal room.

## 📄 License
MIT — See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments
- Data provided by the Art Institute of Chicago, Cleveland Museum of Art, and Harvard Art Museums.
- IIIF Consortium for the image delivery standard.
- MMM-DailyMetArt for architectural inspiration.
