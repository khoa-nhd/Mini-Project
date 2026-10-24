# Mini-Project

This repository contains a collection of small-scale experimental projects built for fun, exploration, and rapid learning. Each folder represents a standalone idea implemented quickly using modern web technologies, with the goal of solving a small real-world problem or testing a concept without over-engineering.

## What's inside

- **interactivequiz/** — A click-based interactive quiz site created to make studying faster and more engaging. It reads questions from JSON, renders them dynamically, and provides immediate feedback. The idea is simple: instead of reading static text, you interact with the material to reinforce memory through repetition and quick decision-making.
- **quicknotes/** — A fast note-taking PWA (Progressive Web App) built with React, TypeScript, Vite, Tailwind CSS, and Firebase. It is designed for capturing ideas quickly during the day — notes sync to Firestore, work offline via IndexedDB, and include search, folders, and keyboard shortcuts. The site is deployed live at https://quicknote-7c89b.web.app.

## Why these exist

They are not production systems with large teams. They are personal experiments: one created to study faster, another to never lose a thought that appears in passing. Both prioritize speed of use over feature completeness.

## Technologies used across projects

- React + TypeScript + Vite
- Tailwind CSS for styling
- Firebase (Firestore, Auth, Hosting) for backend and deployment
- PWA service workers for offline support
- Lucide icons, Zustand state management, and modern browser APIs

## How to run

Each subfolder is mostly self-contained. For quicknotes, install dependencies with `npm install`, run `npm run dev` for local development, and use `npm run deploy` to publish to Firebase Hosting.
