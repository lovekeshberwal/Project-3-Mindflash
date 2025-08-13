### MindFlash — Smart Flashcards (Vanilla JS)

MindFlash is a minimalist flashcards web app that runs entirely in your browser. Create decks, study with a spaced-repetition system (Leitner with ease tweaks), and view lightweight analytics — no frameworks, no libraries, no backend required. Data is stored safely in your browser via localStorage. You can also export/import your data as JSON.

#### Features

- 100% Vanilla JavaScript, Standard CSS, and Semantic HTML; no frameworks or libraries
- Create decks and cards, edit, delete, and search decks
- Study with graded responses: Again, Hard, Good, Easy
- Leitner-system scheduling with small SM-2 style ease adjustments
- LocalStorage persistence plus JSON export/import
- Analytics: total cards, due today, mastered, daily streak; two charts drawn with Canvas API
- Dark/light/system themes with toggle and settings
- Keyboard shortcuts for power users

#### Getting started

1) Download or clone this repository.
2) Open index.html in your browser. That’s it.

If your browser blocks local file access for modules on some setups, you can serve locally:
- Using VS Code Live Server, or
- Node http-server (optional):
  - npm install -g http-server
  - http-server . -p 8080
  - Visit http://localhost:8080

No backend is required. If you add a backend later, keep package.json and .gitignore as needed.

#### Usage tips

- Create your first deck from the Decks tab.
- Add a few cards.
- Go to Study, pick a deck, and Start Session.
- Press Space to show the answer, then 1/2/3/4 to grade (Again/Hard/Good/Easy).
- Export your data anytime; import later to restore.

#### Keyboard shortcuts

- Alt+1 Decks, Alt+2 Study, Alt+3 Analytics, Alt+4 Settings
- Space to flip card
- 1 Again, 2 Hard, 3 Good, 4 Easy, N Next (acts like Good)
- T to toggle theme

#### How it meets the assignment requirements

- Vanilla JS, Standard CSS, Semantic HTML only; no libraries or front-end frameworks used
- No external APIs or tokens; data stored in browser LocalStorage
- Optional JSON import/export to share state
- README.md included; PROMPTS-LOG.md provided for “Vibe Coding” documentation
- .gitignore provided; no node_modules committed
- Clear prompt-driven build process

#### Project structure

- index.html
- styles.css
- app.js
- README.md
- PROMPTS-LOG.md
- .gitignore

#### License

MIT (or adapt as required for your course submission).