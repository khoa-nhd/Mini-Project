# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18 + TypeScript + Vite + Tailwind CSS v4 + Firebase (Auth, Firestore, Hosting) + IndexedDB (idb) + MiniSearch + Zustand + TanStack Query + @dnd-kit

## Users

General consumers who want a fast, minimalist note-taking app for capturing fleeting thoughts throughout the day. They value speed, simplicity, and the ability to access their notes from any device.

## Product Purpose

QuickNotes is a minimalist plain-text note-taking app that enables instant capture, organization via flat folders, and seamless cross-device sync. It exists to be faster than Notion, simpler than Obsidian, and more portable than Apple Notes. Success means a user can capture a thought in under a second, organize it with drag-and-drop folders, and have it instantly available on all their devices — even offline.

## Positioning

The meaningfully different mechanism is the combination of:
- **Sub-second capture**: Cmd+N opens a new note instantly, no loading
- **Plain-text only**: No rich text bloat, no formatting distractions — just thoughts
- **Flat folders with manual drag-drop**: Simple organization that matches mental models
- **Archive as soft-delete**: Swipe to archive, notes stay searchable and restorable
- **Full offline support**: Read/write offline, background sync on reconnect
- **PWA installable**: Install on mobile/desktop home screen, works like a native app
- **Keyboard-first**: Cmd+N, Cmd+K, Cmd+S, Cmd+Shift+A, Esc, arrows — complete control without mouse

## Operating Context

- **Daily capture rituals**: Morning ideas, meeting snippets, shower thoughts, article highlights
- **Cross-device workflows**: Capture on phone during commute, expand on desktop at desk
- **Search-driven retrieval**: Client-side full-text search across all notes, works offline
- **Export portability**: ZIP export (JSON + Markdown with frontmatter) for migration to Obsidian/Notion
- **Privacy-first**: User owns their data, Firebase auth with email/password, no third-party tracking

## Capabilities and Constraints

**Confirmed capabilities:**
- Email/password authentication with verification
- Flat folders (create, rename, delete, reorder via drag-drop)
- Notes: create, edit, pin, archive, delete, reorder
- Client-side full-text search (MiniSearch)
- Keyboard shortcuts: Cmd+N (new), Cmd+K (search), Cmd+S (save), Cmd+Shift+A (archive), Esc (close), arrows (navigate)
- Dark/light/system theme, persisted and synced
- Auto-save with 1.5s debounce, "Saving..." → "Saved" indicator
- Swipe left/right on note → Archive button
- Export: ZIP (notes.json + folders/*.md with frontmatter) or JSON only
- Import: JSON/ZIP with merge/replace/skip strategies
- PWA: install prompt after 2 visits/30s, offline read/write, background sync
- Firebase sync with conflict resolution (Last Write Wins)

**Constraints:**
- Plain text only — no rich text, no markdown rendering, no images
- Flat folders only — no nesting, no tags
- Firebase free tier limits (1GB storage, 50K reads/day, 20K writes/day)
- Last Write Wins conflict resolution (may lose concurrent edits)
- No collaboration/sharing features
- No native mobile apps (web-only PWA)

## Brand Commitments

- **Name**: QuickNotes (established)
- **Tagline**: "Dump thoughts. Organize fast. Sync everywhere."
- **Voice**: Direct, confident, minimal — mirrors the product's simplicity
- **Visual identity**: Flat Design, teal primary (#0D9488), orange accent (#EA580C), Plus Jakarta Sans font

## Evidence on Hand

- Working implementation at `quicknotes/` with all confirmed capabilities
- Design system from UI/UX Pro Max skill (Flat Design, teal/orange, Plus Jakarta Sans)
- Firebase config template in `.env.example`
- Firestore rules and indexes defined
- PWA manifest and service worker configured

**Absences that future work must not fabricate:**
- No testimonials, case studies, or user counts
- No benchmark comparisons with competitors
- No pricing tiers or licensing claims
- No team/organization features

## Product Principles

1. **Speed over features** — Every interaction must feel instant; if it's not sub-second, it's a bug
2. **Plain text is portable text** — No lock-in; your notes are yours in the most universal format
3. **Offline is not a fallback** — The app works fully offline; sync is a background enhancement
4. **Keyboard-first, mouse-optional** — Power users never need to reach for the mouse
5. **Soft boundaries** — Archive, don't delete; folders organize, don't constrain; export anytime

## Accessibility & Inclusion

- WCAG 2.1 AA compliance target
- Visible focus states for all interactive elements
- Skip-to-main-content link
- Keyboard navigation for all workflows (drag-drop has button alternatives)
- Reduced motion support (prefers-reduced-motion)
- Color contrast ≥ 4.5:1 in both themes
- Touch targets ≥ 44×44px on mobile
- Screen reader labels for icon-only controls