---
name: QuickNotes
description: "Minimalist plain-text note-taking app — instant capture, flat folders, offline-first sync"
colors:
  primary: "#0D9488"
  primary-foreground: "#000000"
  secondary: "#14B8A6"
  secondary-foreground: "#0F172A"
  accent: "#EA580C"
  accent-foreground: "#000000"
  background: "#F0FDFA"
  foreground: "#134E4A"
  card: "#FFFFFF"
  card-foreground: "#134E4A"
  muted: "#E8F1F4"
  muted-foreground: "#475569"
  border: "#99F6E4"
  destructive: "#DC2626"
  destructive-foreground: "#FFFFFF"
  ring: "#0D9488"
  primary-dark: "#14B8A6"
  primary-dark-foreground: "#0F172A"
  secondary-dark: "#0D9488"
  secondary-dark-foreground: "#000000"
  accent-dark: "#F97316"
  accent-dark-foreground: "#000000"
  background-dark: "#0F172A"
  foreground-dark: "#F0FDFA"
  card-dark: "#134E4A"
  card-foreground-dark: "#F0FDFA"
  muted-dark: "#134E4A"
  muted-foreground-dark: "#99F6E4"
  border-dark: "#134E4A"
  destructive-dark: "#EF4444"
  destructive-foreground-dark: "#0F172A"
  ring-dark: "#14B8A6"
  neutral-slate: "#586380"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.01em"
  caption:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "20px"
  space-6: "24px"
  space-7: "28px"
  space-8: "32px"
  space-10: "40px"
  space-12: "48px"
  space-16: "64px"
  space-20: "80px"
  space-24: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "color-mix(in srgb, {colors.primary} 90%, transparent)"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "color-mix(in srgb, {colors.secondary} 90%, transparent)"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-accent-hover:
    backgroundColor: "color-mix(in srgb, {colors.accent} 90%, transparent)"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive-hover:
    backgroundColor: "color-mix(in srgb, {colors.destructive} 90%, transparent)"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px"
  input-base:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  input-focus:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  input-error:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card-base:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-hover:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "16px"
  folder-pill-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  folder-pill-inactive:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  folder-pill-inactive-hover:
    backgroundColor: "color-mix(in srgb, {colors.muted} 80%, transparent)"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  note-item-base:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "12px"
  note-item-selected:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "12px"
  note-item-pinned:
    backgroundColor: "color-mix(in srgb, {colors.primary} 5%, transparent)"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "12px"
  badge-primary:
    backgroundColor: "color-mix(in srgb, {colors.primary} 10%, transparent)"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-accent:
    backgroundColor: "color-mix(in srgb, {colors.accent} 10%, transparent)"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-muted:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  toolbar-btn:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "8px"
  toolbar-btn-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px"
  toolbar-btn-active:
    backgroundColor: "color-mix(in srgb, {colors.primary} 10%, transparent)"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px"
---

# Design System: QuickNotes

## Overview

**Creative North Star: "The Telegraph Office"**

QuickNotes embodies the telegraph office: purposeful, immediate, and unadorned. Every pixel serves the act of capture. The visual language is Flat Design — no gratuitous depth, no decorative gradients, no skeuomorphic nostalgia. Color is functional: teal signals primary actions and identity, orange marks urgency (pin, archive, destructive), and the neutral canvas recedes so content remains the protagonist.

The system prioritizes **perceived speed** over visual flourish. Transitions are 150ms by default — fast enough to feel instant, slow enough to orient. Interactions are keyboard-first; the mouse is optional. Dark mode is not an afterthought; it's a first-class citizen with its own calibrated palette that preserves the teal/orange tension.

**Key Characteristics:**
- Flat Design with tonal layering (no shadow stacks)
- Teal primary (#0D9488) + Orange accent (#EA580C) — high contrast, colorblind-safe
- Plus Jakarta Sans — geometric humanist, optimized for UI legibility
- 4px base spacing unit, 8px radius baseline — consistent, scalable
- 150ms default transition — sub-second perceived latency
- Full dark/light parity with semantic tokens
- WCAG 2.1 AA contrast in both themes

## Colors

The palette is intentionally minimal: one primary, one accent, and a full neutral scale for each theme. No secondary or tertiary accents — the product's personality lives in the primary/accent pair.

### Primary
- **Deep Teal** (#0D9488 / oklch(52% 0.15 180)): Primary actions, active navigation, focus rings, brand identity. Used sparingly — ≤10% of any screen — so its presence commands attention.

### Accent
- **Vivid Orange** (#EA580C / oklch(63% 0.22 40)): Pin indicator, archive action, swipe-to-archive affordance, warnings. The "urgency" color — never decorative.

### Neutral (Light)
- **Teal Paper** (#F0FDFA): Page background — a whisper of primary hue, not sterile white
- **Teal Ink** (#134E4A): Primary text, high-contrast foreground
- **Teal Card** (#FFFFFF): Elevated surfaces, inputs, modals
- **Teal Mist** (#E8F1F4): Muted backgrounds, hover states, disabled surfaces
- **Teal Haze** (#99F6E4): Borders, dividers, focus ring base
- **Slate Dim** (#475569): Placeholder text, secondary labels, timestamps

### Neutral (Dark)
- **Obsidian** (#0F172A): Page background — near-black with blue undertone
- **Teal Snow** (#F0FDFA): Primary text — high contrast on obsidian
- **Teal Slate** (#134E4A): Cards, inputs, modals — elevated but not bright
- **Teal Dim** (#134E4A): Muted backgrounds (same as card for flat layering)
- **Teal Glow** (#99F6E4): Muted text, borders, dividers — luminous on dark
- **Teal Bright** (#99F6E4): Placeholder text (same as border for consistency)

### Named Rules
**The One Voice Rule.** The primary teal appears on ≤10% of any given screen. Its rarity is the signal.

**The Urgency Rule.** Orange is reserved for pin, archive, and destructive actions only. It never appears in decorative contexts.

**The Theme Parity Rule.** Every light token has a dark counterpart with equivalent semantic role. No "dark mode only" colors.

**The Contrast Floor.** All text/background pairs meet 4.5:1 (AA) in both themes. Placeholder text meets 3:1 minimum.

## Typography

**Display Font:** Plus Jakarta Sans (with system-ui fallback)
**Body Font:** Plus Jakarta Sans (with system-ui fallback)
**Label/Mono Font:** Plus Jakarta Sans (monospace not used — plain text notes don't need code styling)

**Character:** Plus Jakarta Sans is a geometric humanist with open apertures and a generous x-height. Its alternates (cv02, cv03, cv04, cv11) improve legibility at small sizes and distinguish confusable glyphs (Il1, 0O). It reads as modern but not cold — appropriate for a tool that holds personal thoughts.

### Hierarchy
- **Display** (700, clamp(2rem, 5vw, 3rem), 1.1, -0.02em): Auth page headline only. Never used in app chrome.
- **Headline** (600, 1.5rem, 1.3, -0.01em): Modal titles, section headers in Settings, empty state headlines.
- **Title** (600, 1.125rem, 1.4): Card titles, folder names in sidebar (expanded), note titles in list.
- **Body** (400, 1rem, 1.6): Note content, paragraph text, descriptions, helper text.
- **Label** (500, 0.875rem, 1.5, 0.01em, uppercase + tracking-wider): Section dividers in note list ("PINNED", "NOTES"), toast/status labels.
- **Caption** (500, 0.75rem, 1.5, 0.01em): Badge text, timestamps in note meta, toolbar button labels when icon-only.

### Named Rules
**The No-Display-In-Chrome Rule.** Display size lives only on the Auth landing page. Inside the app, Headline is the largest size.

**The Measure Rule.** Note content renders at ~65ch max-width via container constraints. Long lines hurt readability; the editor enforces this.

**The Mono Rejection Rule.** No monospace font anywhere. Notes are plain text, not code. If users want code blocks, they export to Obsidian.

## Layout

The app shell is a three-pane layout: Sidebar (collapsible 64px→256px) | Note List (flex-1) | Note Editor (flex-1). On mobile (<768px), the sidebar becomes a drawer and the list/editor stack as tabs.

**Container:** Max-width 880px for content areas (note editor), centered. Sidebar and list use full available width.

**Spacing Rhythm:** 4px base unit. Tight groups use space-2/3 (8-12px). Standard gaps use space-4 (16px). Section separation uses space-6/8 (24-32px). Page margins use space-4/6.

**Grid:** No CSS Grid — Flexbox only. The three-pane shell uses `flex: 1` distribution. Note list items use `flex` for drag-handle | content | actions.

**Density:** Compact by default. Note items: 12px padding. Folder pills: 6px vertical, 12px horizontal. Buttons: 8px vertical, 16px horizontal (md). No "comfortable" density toggle — the product opinion is "compact is faster."

**Responsive Breakpoints:**
- <640px: Mobile — sidebar drawer, stacked list/editor tabs
- 640-1024px: Tablet — sidebar collapsible, list + editor side-by-side
- >1024px: Desktop — full three-pane, sidebar expanded by default

## Elevation & Depth

**Philosophy:** Flat by default. Depth is conveyed through **tonal layering** (background → card → muted) and **border contrast**, not shadows. Shadows appear only as state response (hover on cards, modal elevation).

### Shadow Vocabulary
- **Ambient Low** (`0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): Resting cards, note items. Barely perceptible — grounds the surface.
- **Ambient Raised** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Card hover, note item drag preview. Signals interactivity.
- **Modal Float** (`0 25px 50px -12px rgb(0 0 0 / 0.25)`): Modal content only. The single "deep" shadow in the system — creates focus capture.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only on hover, drag, or modal focus. No persistent shadow stacks.

**The Border-Over-Shadow Rule.** Card boundaries use 1px borders (teal-200 light / teal-900 dark) rather than shadows for separation. Borders are cheaper, sharper, and theme-stable.

**The Overlay Rule.** Modal overlay uses `backdrop-filter: blur(4px)` + `bg-black/50` — not a shadow. The blur signals "world behind is paused."

## Shapes

**Form Language:** Rounded, approachable, consistent. No sharp corners, no pill-only world.

- **Radius Sm (4px):** Button internal elements, toolbar icons, badge pills
- **Radius Md (8px) — Baseline:** Buttons, inputs, textareas, toolbar buttons, modal close button
- **Radius Lg (12px) — Container:** Cards, note items, folder pills (via full), modal content (via xl)
- **Radius Xl (16px):** Modal content (max-w-lg+)
- **Radius Full (9999px):** Folder pills, badges, avatar circles, toggle switches

**Borders:** 1px solid, always semantic token (`border` / `border-dark`). No colored borders except pinned notes (primary/50) and error states (destructive).

**Clipping:** None. No geometric masks, no clipped corners. Rectangles with consistent radii only.

## Components

### Buttons
**Character:** Tactile and confident. 150ms transitions, clear hover/active states, visible focus rings.

- **Shape:** Radius Md (8px). Height varies by size.
- **Primary:** Teal bg, black text. Hover: 90% opacity. Active: full opacity. Focus: 2px ring (ring token) + 2px offset (background).
- **Secondary:** Light teal bg, dark slate text. Same state pattern.
- **Accent:** Orange bg, black text. Same state pattern. Reserved for "urgent" CTAs (rare).
- **Ghost:** Transparent bg. Hover: muted bg. Active: muted bg. Focus: ring.
- **Destructive:** Red bg, white text. Hover: 90% opacity. Focus: ring with destructive color.
- **Icon:** Square (32×32px md), ghost base. Hover: muted bg.
- **Sizes:** Sm (24px h, px-3, text-xs), Md (32px h, px-4, text-sm), Lg (40px h, px-6, text-base).
- **Loading:** Spinner replaces content, button retains dimensions, disabled state applies.

### Inputs / Textareas
**Character:** Refined and restrained. Minimal chrome, strong focus signal.

- **Shape:** Radius Md (8px). 1px border (border token).
- **Background:** Background token (not card) — sits on page, not elevated.
- **Focus:** 2px ring (ring token), no offset (input sits on background, not card).
- **Error:** Border + ring = destructive token. Error text below, role="alert".
- **Placeholder:** Muted foreground token (meets 3:1 contrast).
- **Label:** Label component, font-medium, text-foreground, mb-1.
- **Helper Text:** Text-sm, muted-foreground, mt-1.
- **Textarea:** Same as input, `resize-none`, min-h-[120px] typically.

### Cards / Containers
**Character:** Flat containers with subtle border. Hover reveals intent.

- **Shape:** Radius Lg (12px).
- **Background:** Card token. Border: 1px border token.
- **Shadow:** Ambient Low at rest. Ambient Raised on hover (via `.card-hover`).
- **Padding Variants:** None, Sm (12px), Md (16px), Lg (24px).
- **Sub-components:** CardHeader (mb-4), CardTitle (text-lg font-semibold), CardDescription (text-sm muted mt-1), CardContent, CardFooter (mt-4 pt-4 border-t).

### Navigation (Sidebar)
**Character:** Persistent, collapsible, drag-reorderable.

- **Folder Pill:** Radius Full. Active = Primary bg + primary-foreground text. Inactive = Muted bg + muted-foreground text. Hover inactive = Muted/80.
- **Icons:** Lucide, 16×16px (w-4 h-4), currentColor.
- **Drag Handle:** MoreVertical icon, muted-foreground, hover: foreground, active: grabbing cursor.
- **Collapse Animation:** Width transition (150ms), content opacity crossfade.
- **Divider:** 1px border token between sections (Inbox/Custom/Archive).

### Note Item
**Character:** Dense, scannable, action-rich on hover/swipe.

- **Shape:** Radius Lg (12px). Background: Card. Border: 1px Border.
- **Padding:** 12px (space-3).
- **Selected:** Ring-2 Ring + Ring-offset-2 (background).
- **Pinned:** Border Primary/50, Background Primary/5, Pin icon (Accent color).
- **Content:** Title (font-medium, truncate), Preview (text-sm muted, truncate, 1 line), Meta (timestamp + word count, text-xs muted).
- **Swipe Actions (mobile):** Right-to-left reveals Pin, Archive, Delete (toolbar-btn style, 40px each).
- **Hover Actions (desktop):** Same three actions appear on mouse-enter, fade-in 150ms.
- **Drag Handle:** MoreVertical, top-left, muted-foreground → foreground on hover.

### Modals / Dialogs
**Character:** Focus-capturing, accessible, animated.

- **Overlay:** Fixed inset, bg-black/50, backdrop-blur(4px), z-40, fade-in 150ms.
- **Content:** Fixed center, transform translate(-50%, -50%), Card bg, Radius Xl (16px), Border, Modal Float shadow, padding 24px, z-50, animate-in (fade + translateY).
- **Sizes:** Sm (max-w-md), Md (max-w-lg), Lg (max-w-2xl), Full (max-w-4xl).
- **Header:** Title (Headline), Description (Body muted), Close button (toolbar-btn, top-right).
- **Focus Trap:** Restores previous active element on close. Escape closes (configurable).
- **Portal:** Rendered via `createPortal` to body.

### Chips / Badges
**Character:** Compact status indicators.

- **Shape:** Radius Full. Padding: 2px 8px. Font: Label (500, 0.75rem).
- **Primary:** Primary/10 bg, Primary text. Used for folder tags, sync status.
- **Accent:** Accent/10 bg, Accent text. Used for pinned indicator in list header.
- **Muted:** Muted bg, Muted-foreground text. Used for secondary labels.

### Toolbar
**Character:** Persistent action row. Top of editor, bottom of modals.

- **Background:** Card. Border-bottom: 1px Border.
- **Buttons:** Toolbar-btn (ghost base, 8px padding, Radius Md).
- **Active State:** Toolbar-btn-active (Primary/10 bg, Primary text).
- **Spacing:** Gap-2 (8px) between buttons.

### Empty States
**Character:** Friendly but minimal. Illustration + Headline + Body.

- **Icon:** Lucide, 48×48px (w-12 h-12), Muted-foreground/50.
- **Headline:** Headline size, Foreground.
- **Body:** Body size, Muted-foreground, centered.
- **Padding:** 48px vertical, 16px horizontal.

### Toggle Switches (Settings)
**Character:** Native-feeling, animated.

- **Track:** Radius Full, 44×24px (w-11 h-6). Off: Muted bg. On: Primary bg.
- **Thumb:** 20×20px (w-5 h-5), white, shadow-sm. TranslateX: 0 (off) → 22px (on).
- **Transition:** 150ms ease-out.
- **Label:** Side-by-side with description, clickable via label.

## Do's and Don'ts

### Do:
- **Do** use semantic color tokens exclusively (`var(--color-primary)`, `bg-primary`, etc.). Never hardcode hex values in components.
- **Do** keep transitions at 150ms (fast) for state changes, 200ms (normal) for layout shifts, 300ms (slow) for modal enter/exit.
- **Do** apply the One Voice Rule: primary teal on ≤10% of screen pixels.
- **Do** use the Urgency Rule: orange only for pin, archive, destructive.
- **Do** enforce 4.5:1 contrast for all text in both themes — test with actual content lengths.
- **Do** use Plus Jakarta Sans with font-feature-settings ("cv02", "cv03", "cv04", "cv11") everywhere.
- **Do** prefer tonal layering (background → card → muted) over shadows for depth.
- **Do** use 1px semantic borders for card separation, not shadows.
- **Do** make every interactive element keyboard-accessible with visible focus-visible rings.
- **Do** respect `prefers-reduced-motion` — disable all transitions/animations when set.
- **Do** use the 4px base spacing unit — all spacing values are multiples of 4px.
- **Do** use Radius Md (8px) as the default for buttons, inputs, toolbar items.
- **Do** use Radius Lg (12px) for cards, note items, modals (Sm/Md).
- **Do** use Radius Full for pills, badges, toggles, avatars.
- **Do** expand Tailwind utilities to literal CSS in design tokens — the system is token-native, not utility-dependent.

### Don't:
- **Don't** introduce new colors outside the defined palette. If a new semantic role emerges, add it to the token system first.
- **Don't** use shadows for resting elevation — only for hover, drag, modal.
- **Don't** use gradient text, glassmorphism, or decorative blur. The world is flat.
- **Don't** use colored borders >1px on cards, list items, or alerts. The Zero-Blur Block Shadow is a costume, not a depth system.
- **Don't** use monospace as a costume for "technical" — notes are plain text, not code.
- **Don't** use Unicode glyphs or emoji for icons. Icons are Lucide SVG, 1.5 stroke weight, consistent sizing.
- **Don't** add kickers/eyebrows above headings. The heading carries its own weight.
- **Don't** use section numbers (01/02/03) unless the sequence carries information.
- **Don't** use a modal for a task that needs neither interruption nor protected focus.
- **Don't** create one-off component variants. If a pattern repeats, promote to a shared component or token.
- **Don't** hardcode spacing values — use the spacing scale tokens.
- **Don't** mix light-theme tokens in dark mode or vice versa. The `.dark` class swap handles all semantic tokens.
- **Don't** animate layout properties (width, height, top, left) — only transform, opacity, color, shadow.
- **Don't** exceed 10% primary color coverage on any screen. If you need more emphasis, use weight/size, not color volume.