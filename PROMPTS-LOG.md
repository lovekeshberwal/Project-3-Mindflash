### PROMPTS-LOG.md

A running log of the prompts used to build MindFlash and the AI’s responses. The goal was to keep the app simple, use only vanilla web technologies, and provide clear, actionable instructions.

## Prompt 1 — Minimal Data Model and LocalStorage Persistence

- Date: 2025-08-13
- Objective: Define a minimal schema for decks/cards and a simple persistence layer using localStorage.

### Prompt
Design a minimal data model for a flashcards app with multiple decks. Each card has front, back, and spaced-repetition metadata. Keep the schema simple and robust for localStorage. Also provide tiny helper functions to load/save from localStorage with namespacing and basic validation.

### AI Response
Use a top-level store keyed by a stable namespace, with arrays for decks and cards. Cards reference decks by id to avoid nesting bloat. Include minimal SR metadata for Leitner-like scheduling.

Data model:
```js
// Storage key
const STORE_KEY = 'mindflash:v1';

const defaultStore = {
  meta: { version: 1, lastUpdated: Date.now() },
  decks: [
    // { id: 'd_1', name: 'Spanish Basics', createdAt: 1690000000000 }
  ],
  cards: [
    /* {
      id: 'c_1',
      deckId: 'd_1',
      front: 'hola',
      back: 'hello',
      // SR metadata
      bucket: 1,          // 1–5
      ease: 2.5,          // 1.3–3.0 typical
      interval: 0,        // days
      due: Date.now(),    // ms timestamp
      createdAt: 1690000000000,
      updatedAt: 1690000000000
    } */
  ]
};
```

Persistence helpers:
```js
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(defaultStore);
    const data = JSON.parse(raw);
    // Basic validation
    if (!data || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
      return structuredClone(defaultStore);
    }
    return data;
  } catch {
    return structuredClone(defaultStore);
  }
}

function saveStore(store) {
  const toSave = {
    ...store,
    meta: { ...(store.meta || {}), version: 1, lastUpdated: Date.now() }
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(toSave));
}

function resetStore() {
  localStorage.removeItem(STORE_KEY);
}

function exportStore() {
  return JSON.stringify(loadStore(), null, 2);
}

function importStore(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
    throw new Error('Invalid import format');
  }
  saveStore(parsed);
  return parsed;
}
```

Outcome:
- Clear, compact schema.
- Safe load/save/reset/export/import functions.
- Ready to wire into UI actions.

---

## Prompt 2 — Leitner Scheduling with Small SM-2 Style Ease Tweaks

- Date: 2025-08-13
- Objective: Implement a simple scheduler that uses Leitner buckets (1–5) and adjusts ease and interval lightly based on Again/Hard/Good/Easy.

### Prompt
Implement a function schedule(card, grade) where grade is 'again' | 'hard' | 'good' | 'easy'. Use Leitner buckets 1–5 and small SM-2-like ease adjustments. Keep it simple and deterministic. Output updated {bucket, ease, interval, due}. Assume “today” is start of current day.

### AI Response
Use conservative ease deltas and cap values to avoid runaway intervals. Interval scales roughly as bucket × ease, with small penalties/bonuses per grade.

```js
// Utility: start of today in ms
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return +d;
}

function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }

// Core scheduler
function schedule(card, grade) {
  const now = startOfToday();
  let { bucket = 1, ease = 2.5, interval = 0 } = card;

  // Ease adjustments (small, SM-2 inspired)
  const easeDelta = {
    again: -0.2,
    hard:  -0.05,
    good:   0.0,
    easy:   0.05
  }[grade];

  ease = clamp((ease || 2.5) + easeDelta, 1.3, 3.0);

  // Bucket transitions
  if (grade === 'again') bucket = 1;
  else if (grade === 'hard') bucket = Math.max(1, bucket);
  else if (grade === 'good') bucket = clamp(bucket + 1, 1, 5);
  else if (grade === 'easy') bucket = clamp(bucket + 2, 1, 5);

  // Interval calculation (days)
  const baseByBucket = [0, 1, 2, 4, 7, 14]; // index 0 unused
  const gradeFactor = { again: 0, hard: 0.6, good: 1.0, easy: 1.3 }[grade];

  let nextInterval;
  if (grade === 'again') {
    nextInterval = 0; // due today
  } else if (interval === 0) {
    // First successful recall
    nextInterval = Math.ceil(baseByBucket[bucket] * gradeFactor || 1);
  } else {
    nextInterval = Math.ceil(baseByBucket[bucket] * ease * gradeFactor);
  }

  // Minimums and caps
  if (grade !== 'again') nextInterval = Math.max(1, nextInterval);
  nextInterval = Math.min(nextInterval, 365); // simple cap

  const due = now + nextInterval * 24 * 60 * 60 * 1000;

  return {
    bucket,
    ease: Number(ease.toFixed(2)),
    interval: nextInterval,
    due
  };
}
```

Outcome:
- Simple, predictable scheduling.
- Small, bounded ease changes.
- Works with daily review flow.

---

## Prompt 3 — Keyboard Shortcuts and Card Flow

- Date: 2025-08-13
- Objective: Add keyboard shortcuts for study flow: Space to flip, 1/2/3/4 to grade, N as “next/Good”, T to toggle theme, and Alt+1..4 to switch tabs.

### Prompt
Provide a minimal keyboard handler for a study session. Actions needed: Space to flip answer; 1=again, 2=hard, 3=good, 4=easy; N acts like “good”; T toggles theme; Alt+1 Decks, Alt+2 Study, Alt+3 Analytics, Alt+4 Settings. Include small no-op guards for input fields and basic example callbacks.

### AI Response
Attach a single keydown listener on window, ignore events from editable fields, and map keys to callbacks. Keep it tiny and readable.

```js
// Example placeholders; wire these to your app logic
const ui = {
  flipCard: () => console.log('flip'),
  gradeCard: (g) => console.log('grade:', g),
  gotoTab: (name) => console.log('tab:', name),
  toggleTheme: () => console.log('theme toggle')
};

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function handleKeydown(e) {
  if (isEditableTarget(e.target)) return;

  // Alt+1..4 for tabs
  if (e.altKey) {
    if (e.key === '1') { e.preventDefault(); ui.gotoTab('Decks'); }
    else if (e.key === '2') { e.preventDefault(); ui.gotoTab('Study'); }
    else if (e.key === '3') { e.preventDefault(); ui.gotoTab('Analytics'); }
    else if (e.key === '4') { e.preventDefault(); ui.gotoTab('Settings'); }
    return;
  }

  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      ui.flipCard();
      break;
    case '1':
      e.preventDefault();
      ui.gradeCard('again');
      break;
    case '2':
      e.preventDefault();
      ui.gradeCard('hard');
      break;
    case '3':
      e.preventDefault();
      ui.gradeCard('good');
      break;
    case '4':
      e.preventDefault();
      ui.gradeCard('easy');
      break;
    case 'n':
      e.preventDefault();
      ui.gradeCard('good');
      break;
    case 't':
      e.preventDefault();
      ui.toggleTheme();
      break;
  }
}

window.addEventListener('keydown', handleKeydown);
```

Outcome:
- Single, centralized shortcut handler.
- Prevents interference with text inputs.
- Matches the app’s shortcut spec.