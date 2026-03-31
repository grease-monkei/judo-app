# Claude Code Handoff: White Rock Judo Club Attendance System

This document summarizes the state of the White Rock Judo Club PWA to provide full context for continued development.

## 🚀 Project Overview
A custom, mobile-first Attendance PWA designed for a self-serve kiosk at the club's front desk.
- **Tech Stack**: Vanilla HTML5, CSS3, ES6+ JavaScript.
- **Backend**: Firebase Firestore (Real-time sync, offline-first).
- **Deployment**: Netlify (`whiterockjudo.netlify.app`).
- **PWA Status**: Full manifest and Service Worker (v20) implemented.

## 🏗️ Architecture
- **`sw.js`**: Service worker for offline caching.
- **`js/db.js`**: Universal database layer wrapping Firestore.
- **`js/app.js`**: Main entry point and router. Includes **Splash Screen** and **PIN Security**.
- **`js/screens/`**: Each app view is a self-contained module.
- **`styles/main.css`**: Central design system.

## 💎 Recently Completed Features
1. **Bulk Manual Sign-In (v20)**:
   - **Dedicated Tab**: Added a "Manual" tab for senseis to backdate attendance.
   - **PIN-Protected**: This new tab is secured by the club's PIN.
   - **Bulk Selection Workflow**: Senseis select a date and class, then search and "stack" multiple students into a pending list before saving everything in one batch.
2. **Performance & Splash Screen (v19)**:
   - **Parallel Bootstrapping**: App initialization now runs concurrently using `Promise.all`.
   - **Instant Splash Screen**: A CSS-driven splash screen appears immediately upon page load.
3. **Duplicate & Overlap Protection (signin.js)**:
   - **Safety Logic**: The app prevents a member from signing into the same class twice or overlapping classes.

## 📂 File Map
- `/index.html`: Entry point (Includes Splash Screen & 5-tab Bottom Nav).
- `/js/app.js`: Parallel initialization & router with PIN security.
- `/js/screens/manual.js`: **NEW** Bulk sign-in logic for administrators.
- `/js/screens/signin.js`: Main student-facing kiosk logic.
- `/WHITE_LABEL_ROADMAP.md`: Roadmap for future customization/multi-club support.
