# Interactive Quiz

Created a click-click website to study faster while learning.

This project was born from a simple need: when studying, reading static text can become passive. The brain needs active engagement to retain information. So this site turns questions into interactive cards that respond immediately. You click answers, get instant feedback, and the experience feels like a conversation with the material rather than a one-way lecture.

## How it works

Questions are loaded from a structured JSON file (questions.json) extracted from study materials. The site renders them dynamically, allowing navigation between questions, tracking progress, and providing visual feedback on correct and incorrect choices. The design is intentionally minimal so the focus stays on the content, not on decorative elements.

## Purpose

The goal is not to replace formal exams or textbooks. It is to create a quick, low-friction way to review concepts during short breaks, commute time, or between tasks. The faster you can test yourself, the more repetitions you can fit into a day, and repetition is the foundation of memorization.

## Technical notes

Built as a static site using HTML and JavaScript with embedded JSON data. It can be opened locally or served from any static host. No server is required, which means it works offline and can be distributed as a single folder.
