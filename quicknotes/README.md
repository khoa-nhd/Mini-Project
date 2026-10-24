https://quicknote-7c89b.web.app

# QuickNotes

I have ideas during the day that need to be written down quickly.

QuickNotes is a fast, minimal note-taking application designed for one purpose: capture thoughts before they disappear. The interface is built around speed — a big plus button to create notes instantly, keyboard shortcuts for power users, and a clean sidebar to organize notes into folders without friction. It is not a complex productivity suite with calendars and reminders; it is a place to dump thoughts and organize them later.

## Why it exists

Ideas often come in brief moments — while walking, between conversations, or in the middle of work. If you wait to open a full application, the idea can fade. QuickNotes tries to reduce that delay to near zero by supporting keyboard shortcuts (Ctrl+N for new note, Ctrl+K for search, Ctrl+S for save), offline persistence through IndexedDB, and a progressive web app experience that feels native on both desktop and mobile.

## What it does

- Create notes instantly with a large floating button or keyboard shortcut
- Organize notes into folders (Inbox, Archive, custom folders)
- Search through all notes quickly using a lightweight full-text index
- Auto-save with configurable delay
- Sync to Firebase Firestore when authenticated, with offline-first behavior so notes survive connectivity loss
- Export and import data via ZIP
- Dark and light theme support with system preference detection
- PWA install prompt and service worker caching for offline use

## Technology stack

The application is built with modern web technologies:

- React 19 with TypeScript for the UI layer
- Vite for fast development and production builds
- Tailwind CSS for styling with a custom design token system
- Zustand for global state management with persistence
- Firebase SDK for authentication, Firestore database, and hosting
- Workbox via vite-plugin-pwa for service worker generation
- Lucide React for consistent iconography

## Deployment

The site is hosted on Firebase Hosting at https://quicknote-7c89b.web.app. The build artifacts live in the `dist/` folder and include the Service Worker, manifest, and all static assets. Firestore rules enforce that users can only access their own notes, folders, and settings.

## How to use locally

Clone the repository, navigate to the `quicknotes/` directory, install dependencies with `npm install`, create a `.env` file with your Firebase project credentials, and run `npm run dev` to start the local server. To deploy, run `npm run deploy` which builds and publishes to Firebase.

## Notes on the future

The project is intentionally small. It does not attempt to replace dedicated note apps with rich formatting, collaboration, or enterprise features. Its value is in speed and simplicity — a quick place for quick thoughts.
