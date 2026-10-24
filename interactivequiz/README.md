<div align="center">

# 🎯 Interactive Quiz

> A click-click study tool made for faster learning.

![Study](https://img.shields.io/badge/Study-Interactive-blue?logo=book-open)
![Static](https://img.shields.io/badge/Static-HTML%2FJS-ff5733)

```text
  ╔══════════════════════════════╗
  ║  Learning through interaction ║
  ╚══════════════════════════════╝
```

---

## What It Is

A lightweight quiz site created during study sessions. Instead of reading static text passively, you answer questions interactively with immediate feedback. The goal is to turn review time into active recall.

## Key Ideas

- **Rapid load** — no server needed; open `index.html` locally
- **JSON-driven** — questions live in `questions.json`, easy to extend
- **Instant feedback** — answers respond without reload
- **Distraction-free** — minimal design, no decorative noise

## Structure

```
interactivequiz/
├── index.html          # Main site
├── questions.json      # Question bank
├── generate_site.py    # Builder script
└── extract.py          # Data extraction
```

---

## How To Use

```bash
# Just open
open interactivequiz/index.html
```

Or serve statically:

```bash
python -m http.server 8000
# Visit http://localhost:8000/interactivequiz/
```

---

## Why It Exists

When studying, passive reading can become automatic — eyes move, but retention stays low. This site forces a decision at every step: choose an answer, see result, move on. That loop of action + feedback is what makes repetition stick.

---

> *Built quickly, meant for quick use.*

</div>
