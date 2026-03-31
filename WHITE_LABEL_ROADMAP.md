# White-Labeling Roadmap: From Single Club to Template

This document outlines the architectural changes needed to turn the White Rock Judo Club app into a customizable "template" for any sports club.

## 🏁 Phase  centralize Identity
Currently, strings like "White Rock Judo Club" and the red/white/gold color scheme are partially hardcoded.
- **Move Strings to DB**: Create a `clubProfile` entry in the `settings` collection in Firestore. 
  - `clubName`: "White Rock Judo Club"
  - `clubShortName`: "WR Judo"
  - `logoUrl`: "path/to/logo.png"
- **Dynamic Header**: Update `app.js` and `signin.js` to pull these values from `DB.Settings` during the `render()` phase.

## 🎨 Phase 2: Dynamic Branding (The Color Engine)
The app uses a specific color palette defined in `main.css`.
- **CSS Variable Injection**: Allow the `SettingsScreen` to save primary and secondary hex codes. 
- **JS Injection**: When the app starts, use JavaScript to overwrite the CSS variables:
  ```javascript
  document.documentElement.style.setProperty('--accent-red', savedBrandColor);
  ```

## 🛠️ Phase 3: The "First-Run" Wizard
To make it easy for a new club, you need a setup screen for the first time they open the app.
- **Setup View**: If the `clubProfile` settings are empty, the app defaults to a "Welcome" screen.
- **Configuration**: The user enters their Club Name, uploads a Logo, and picks their colors. Once saved, the app unlocks the rest of the features.

## 🚀 Deployment Strategy
There are two ways to handle multiple clubs:
1. **Independent Deploys (Recommended for starting)**: 
   - Each club gets its own Firebase project (for data privacy) and its own Netlify URL (e.g., `downtownjudo.netlify.app`). 
   - You only have to change one `firebase-config.js` file for each club.
2. **Multi-Tenant (More complex)**: 
   - All clubs use one single app and one database. 
   - Every piece of data (members, attendance, etc.) would need a `clubId` field to keep them separated.

---

> [!TIP]
> **Summary for Claude Code:** To white-label this app, focus on abstracting the UI strings in `index.html` and `signin.js` into the `DB.Settings` layer and using the existing CSS variables to drive the branding.
