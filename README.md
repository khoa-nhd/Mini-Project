<div align="center">

# ⌘ Mini-Project

> A curated collection of playful experiments, quick tools, and idea-capture apps.

[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Firebase](https://img.shields.io/badge/Firebase-13-FFC107?logo=firebase&logoColor=white)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```text
  ╔════════════════════════════════════════╗
  ║  Small ideas. Fast builds. No bloat.  ║
  ╚════════════════════════════════════════╝
```

| Project | Purpose | Live Link |
|---------|---------|-----------|
| **QuickNotes** | Capture ideas during the day instantly | [quicknote-7c89b.web.app](https://quicknote-7c89b.web.app) |
| **Interactive Quiz** | Click-click learning for faster study | — |

---

## 🗂 What's Inside

Each folder is a standalone experiment. No monorepo complexity — just open and run.

### 1. QuickNotes (`quicknotes/`)

A PWA note-taking app built for speed. Dump thoughts, organize into folders, search instantly, and sync everywhere via Firebase Firestore.

**Highlights:**
- ⚡ Floating **+** button — create notes immediately
- ⌨️ Keyboard shortcuts (`Ctrl+N`, `Ctrl+K`, `Ctrl+S`)
- 🌙 Dark / light theme
- 📱 Offline-first via IndexedDB + Service Worker
- 🔍 Full-text search with MiniSearch

### 2. Interactive Quiz (`interactivequiz/`)

A lightweight quiz site made while studying. Questions are loaded from JSON, answers respond instantly, and the experience is designed to make repetition feel interactive rather than passive.

---

## 🔧 Stack at a Glance

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS |
| Build | Vite |
| State | Zustand (persisted) |
| Backend | Firebase Auth + Firestore |
| Hosting | Firebase Hosting |
| PWA | vite-plugin-pwa + Workbox |

---

## 🚀 How to Explore

```bash
cd quicknotes
npm install
npm run dev         # localhost:3000
npm run deploy      # build + Firebase deploy

cd ../interactivequiz
open index.html
```

---

> *"Not every project needs to be large. Some just need to be fast, clear, and fun."*

</div>
