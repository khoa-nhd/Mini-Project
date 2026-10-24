<div align="center">

[![Live](https://img.shields.io/badge/Live-Demo-teal?style=for-the-badge&logo=flash)](https://quicknote-7c89b.web.app)

# 📝 QuickNotes

> Capture ideas during the day before they disappear.

```text
  ┌──────────────────────────────────────┐
  │  Dump thoughts. Organize fast.       │
  │  Sync everywhere.                    │
  └──────────────────────────────────────┘
```

---

## 🌐 Live Website

**[https://quicknote-7c89b.web.app](https://quicknote-7c89b.web.app)**

---

## Why This Exists

Ideas often arrive in brief windows — while walking, between conversations, or mid-task. Waiting to open a full productivity suite kills the moment. QuickNotes is built to reduce that delay to near zero.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Big + Button** | Create a new note instantly — always visible |
| **Keyboard Shortcuts** | `Ctrl+N` (new), `Ctrl+K` (search), `Ctrl+S` (save) |
| **Folders** | Inbox, Archive, custom folders with drag-and-drop |
| **Search** | Full-text indexing via MiniSearch |
| **Auto-Save** | Configurable delay; no manual save required |
| **Offline-First** | IndexedDB persistence; works without internet |
| **Firebase Sync** | Auth + Firestore sync when online |
| **PWA** | Installable, service worker cached, mobile-ready |
| **Themes** | Dark / light with system preference detection |
| **Export / Import** | ZIP export for backup and migration |

---

## 🛠 Tech Stack

| Layer | Choice |
|-------|--------|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| State | Zustand (persisted) |
| Database / Auth | Firebase Firestore & Auth |
| Search | MiniSearch |
| PWA | vite-plugin-pwa + Workbox |
| Icons | Lucide React |

---

## 🚀 Quick Start

```bash
cd quicknotes
npm install
npm run dev        # localhost:3000
npm run build      # production build
npm run deploy     # build + Firebase Hosting
```

Requires a `.env` file with Firebase config values:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

---

## 🏗 Architecture Highlights

- **Offline persistence**: Firestore `enableIndexedDbPersistence` plus local Zustand persistence
- **Real-time sync**: Starts when authenticated; stops on unmount
- **SPA routing**: `firebase.json` rewrites all paths to `index.html`
- **Security**: Firestore rules enforce `isOwner` on every document

---

> *Not every idea needs a long document. Sometimes it just needs a quick button, a clean input, and a place to land.*

</div>
