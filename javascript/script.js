// MindFlash - Vanilla JS Flashcards with Spaced Repetition
// Data model keys in localStorage
const STORE_KEY = 'mindflash:data:v1';
const PREFS_KEY = 'mindflash:prefs:v1';
const REVIEW_LOG_KEY = 'mindflash:reviews:v1';

const DEFAULT_INTERVALS = {
  // Leitner boxes in days; box 5 considered "mastered"
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 21
};

const AppState = {
  data: {
    decks: [] // [{ id, name, description, createdAt, cards: [{ id, front, back, box, lastReviewed, nextDue, createdAt, timesReviewed, ease }] }]
  },
  prefs: {
    theme: 'system'
  },
  session: {
    currentDeckId: null,
    dueQueue: [],
    currentCard: null,
    reviewedCount: 0
  }
};

// Utilities
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const todayLocalDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function saveAll() {
  localStorage.setItem(STORE_KEY, JSON.stringify(AppState.data));
  localStorage.setItem(PREFS_KEY, JSON.stringify(AppState.prefs));
}

function loadAll() {
  const data = localStorage.getItem(STORE_KEY);
  const prefs = localStorage.getItem(PREFS_KEY);
  AppState.data = data ? JSON.parse(data) : { decks: [] };
  AppState.prefs = prefs ? JSON.parse(prefs) : { theme: 'system' };
}

function logReview(dateStr) {
  const raw = localStorage.getItem(REVIEW_LOG_KEY);
  const log = raw ? JSON.parse(raw) : {};
  log[dateStr] = (log[dateStr] || 0) + 1;
  localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(log));
}

function getReviewLog() {
  const raw = localStorage.getItem(REVIEW_LOG_KEY);
  return raw ? JSON.parse(raw) : {};
}

// Theme handling
function applyTheme(value) {
  const root = document.documentElement;
  root.classList.remove('light');
  if (value === 'light') root.classList.add('light');
  if (value === 'system') {
    // Follow prefers-color-scheme automatically (default is dark variables)
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    if (mql.matches) root.classList.add('light');
  }
}

// Data ops
function createDeck(name, description = '') {
  const deck = {
    id: uid(),
    name: name.trim(),
    description: description.trim(),
    createdAt: now(),
    cards: []
  };
  AppState.data.decks.push(deck);
  saveAll();
  return deck;
}

function updateDeck(id, updates) {
  const deck = getDeck(id);
  if (!deck) return;
  Object.assign(deck, updates);
  saveAll();
}

function deleteDeck(id) {
  AppState.data.decks = AppState.data.decks.filter(d => d.id !== id);
  saveAll();
}

function getDeck(id) {
  return AppState.data.decks.find(d => d.id === id);
}

function createCard(deckId, front, back) {
  const deck = getDeck(deckId);
  if (!deck) return;
  const card = {
    id: uid(),
    front: front.trim(),
    back: back.trim(),
    box: 1,
    lastReviewed: null,
    nextDue: todayLocalDate(),
    createdAt: now(),
    timesReviewed: 0,
    ease: 250 // baseline ease factor
  };
  deck.cards.push(card);
  saveAll();
  return card;
}

function updateCard(deckId, cardId, updates) {
  const deck = getDeck(deckId);
  if (!deck) return;
  const card = deck.cards.find(c => c.id === cardId);
  if (!card) return;
  Object.assign(card, updates);
  saveAll();
}

function deleteCard(deckId, cardId) {
  const deck = getDeck(deckId);
  if (!deck) return;
  deck.cards = deck.cards.filter(c => c.id !== cardId);
  saveAll();
}

function filterDecks(searchTerm) {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return AppState.data.decks;
  return AppState.data.decks.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.description.toLowerCase().includes(q)
  );
}

// Spaced Repetition (Leitner-style with ease tweaks)
function isDue(card, date = new Date()) {
  const due = card.nextDue || todayLocalDate();
  const nowStr = date.toISOString().slice(0,10);
  return due <= nowStr;
}

function schedule(card, grade) {
  // grade: again | hard | good | easy
  const boxDelta = { again: -1, hard: 0, good: +1, easy: +2 }[grade] || 0;
  card.box = clamp(card.box + boxDelta, 1, 5);

  // adjust ease (simple SM-2 style tweak, but bounded)
  const easeDelta = { again: -40, hard: -15, good: 0, easy: +15 }[grade] || 0;
  card.ease = clamp(card.ease + easeDelta, 130, 350);

  const intervalDays = DEFAULT_INTERVALS[card.box];
  const next = new Date();
  next.setDate(next.getDate() + intervalDays);

  card.lastReviewed = now();
  card.nextDue = next.toISOString().slice(0,10);
  card.timesReviewed = (card.timesReviewed || 0) + 1;
}

function getDueCards(deck) {
  return deck.cards.filter(c => isDue(c));
}

// Analytics helpers
function getStats(deckId = 'all') {
  const decks = deckId === 'all' ? AppState.data.decks : [getDeck(deckId)].filter(Boolean);
  const allCards = decks.flatMap(d => d.cards);
  const total = allCards.length;
  const dueToday = allCards.filter(c => isDue(c)).length;
  const mastered = allCards.filter(c => c.box === 5).length;

  // streak computed from review log
  const log = getReviewLog();
  let streak = 0;
  let cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0,10);
    if (log[key]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { total, dueToday, mastered, streak };
}

function getBoxDistribution(deck) {
  const boxes = { 1:0, 2:0, 3:0, 4:0, 5:0 };
  deck.cards.forEach(c => boxes[c.box]++);
  return boxes;
}

function getReviewsLastNDays(n = 14) {
  const log = getReviewLog();
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    const key = day.toISOString().slice(0,10);
    out.push({ date: key, count: log[key] || 0 });
  }
  return out;
}

// Rendering
const els = {
  views: {
    decks: document.getElementById('view-decks'),
    study: document.getElementById('view-study'),
    analytics: document.getElementById('view-analytics'),
    settings: document.getElementById('view-settings')
  },
  navBtns: Array.from(document.querySelectorAll('.nav-btn')),
  deckList: document.getElementById('deckList'),
  noDecksMsg: document.getElementById('noDecksMsg'),
  deckSearch: document.getElementById('deckSearch'),
  addDeckBtn: document.getElementById('addDeckBtn'),
  deckModal: document.getElementById('deckModal'),
  deckForm: document.getElementById('deckForm'),
  deckNameInput: document.getElementById('deckNameInput'),
  deckDescInput: document.getElementById('deckDescInput'),

  cardModal: document.getElementById('cardModal'),
  cardForm: document.getElementById('cardForm'),
  cardFrontInput: document.getElementById('cardFrontInput'),
  cardBackInput: document.getElementById('cardBackInput'),

  studyDeckSelector: document.getElementById('studyDeckSelector'),
  startStudyBtn: document.getElementById('startStudyBtn'),
  studyPanel: document.getElementById('studyPanel'),
  studyDeckName: document.getElementById('studyDeckName'),
  dueCount: document.getElementById('dueCount'),
  sessionCount: document.getElementById('sessionCount'),
  cardFront: document.getElementById('cardFront'),
  cardBack: document.getElementById('cardBack'),
  showAnswerBtn: document.getElementById('showAnswerBtn'),
  gradeActions: document.querySelector('.grade-actions'),
  noDueMsg: document.getElementById('noDueMsg'),

  analyticsDeckSelector: document.getElementById('analyticsDeckSelector'),
  statTotal: document.getElementById('statTotal'),
  statDueToday: document.getElementById('statDueToday'),
  statStreak: document.getElementById('statStreak'),
  statMastered: document.getElementById('statMastered'),
  chartReviews: document.getElementById('chartReviews'),
  chartBoxes: document.getElementById('chartBoxes'),

  themeToggle: document.getElementById('themeToggle'),
  themeSelect: document.getElementById('themeSelect'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  resetAllBtn: document.getElementById('resetAllBtn')
};

let editingDeckId = null;
let editingCardId = null;
let deckForCardModal = null;

function renderDecks(searchTerm = '') {
  const decks = filterDecks(searchTerm);
  els.deckList.innerHTML = '';
  els.noDecksMsg.hidden = decks.length > 0;

  decks.forEach(deck => {
    const due = getDueCards(deck).length;
    const div = document.createElement('div');
    div.className = 'deck-card';
    div.setAttribute('role', 'listitem');
    div.innerHTML = `
      <h3>${escapeHTML(deck.name)}</h3>
      <p>${escapeHTML(deck.description || '')}</p>
      <div class="deck-meta">
        <span class="chip">${deck.cards.length} cards</span>
        <span class="chip">Due: ${due}</span>
        <span class="chip">Created: ${new Date(deck.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="deck-actions">
        <button class="btn" data-action="add-card">Add Card</button>
        <button class="btn" data-action="edit-deck">Edit</button>
        <button class="btn danger" data-action="delete-deck">Delete</button>
        <button class="btn primary" data-action="study-deck">Study</button>
      </div>
      <div class="card-actions">
        ${deck.cards.slice(-3).map(c => `<span class="chip">${escapeHTML(truncate(c.front, 24))}</span>`).join(' ')}
      </div>
    `;

    div.querySelector('[data-action="add-card"]').addEventListener('click', () => {
      deckForCardModal = deck.id;
      openCardModal('New Card');
    });
    div.querySelector('[data-action="edit-deck"]').addEventListener('click', () => openDeckModal('Edit Deck', deck));
    div.querySelector('[data-action="delete-deck"]').addEventListener('click', () => {
      if (confirm(`Delete deck "${deck.name}" and all its cards?`)) {
        deleteDeck(deck.id);
        refreshAll();
      }
    });
    div.querySelector('[data-action="study-deck"]').addEventListener('click', () => {
      switchView('study');
      els.studyDeckSelector.value = deck.id;
      startStudy(deck.id);
    });

    els.deckList.appendChild(div);
  });
}

function populateDeckSelectors() {
  const options = ['<option value="all">All Decks</option>']
    .concat(AppState.data.decks.map(d => `<option value="${d.id}">${escapeHTML(d.name)}</option>`))
    .join('');
  els.studyDeckSelector.innerHTML = AppState.data.decks.length ? AppState.data.decks.map(d => `<option value="${d.id}">${escapeHTML(d.name)}</option>`).join('') : '';
  els.analyticsDeckSelector.innerHTML = options;
}

function renderAnalytics() {
  const deckId = els.analyticsDeckSelector.value || 'all';
  const { total, dueToday, mastered, streak } = getStats(deckId);
  els.statTotal.textContent = total;
  els.statDueToday.textContent = dueToday;
  els.statMastered.textContent = mastered;
  els.statStreak.textContent = streak;

  drawReviewsChart();
  drawBoxesChart(deckId);
}

function drawReviewsChart() {
  const ctx = els.chartReviews.getContext('2d');
  const data = getReviewsLastNDays(14);
  const max = Math.max(1, ...data.map(d => d.count));
  ctx.clearRect(0,0,els.chartReviews.width, els.chartReviews.height);

  const w = els.chartReviews.width;
  const h = els.chartReviews.height;
  const padding = 40;
  const plotW = w - padding*2;
  const plotH = h - padding*2;
  const barW = plotW / data.length * 0.6;
  const gap = plotW / data.length * 0.4;

  // axes
  ctx.strokeStyle = getCSS('--border');
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();

  // bars
  data.forEach((d, i) => {
    const x = padding + i * (barW + gap) + gap/2;
    const barH = (d.count / max) * (plotH - 10);
    const y = h - padding - barH;
    ctx.fillStyle = getCSS('--primary');
    ctx.fillRect(x, y, barW, barH);

    // labels (every other day)
    if (i % 2 === 0) {
      ctx.fillStyle = getCSS('--muted');
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(d.date.slice(5), x + barW/2, h - padding + 14);
    }
  });
}

function drawBoxesChart(deckId = 'all') {
  const ctx = els.chartBoxes.getContext('2d');
  ctx.clearRect(0,0,els.chartBoxes.width, els.chartBoxes.height);

  let boxes = {1:0,2:0,3:0,4:0,5:0};
  if (deckId === 'all') {
    AppState.data.decks.forEach(d => {
      const b = getBoxDistribution(d);
      for (let k in b) boxes[k] += b[k];
    });
  } else {
    const deck = getDeck(deckId);
    if (deck) boxes = getBoxDistribution(deck);
  }

  const entries = Object.entries(boxes);
  const total = entries.reduce((s, [,v]) => s+v, 0) || 1;
  const w = els.chartBoxes.width;
  const h = els.chartBoxes.height;
  const padding = 40;
  const plotW = w - padding*2;
  const barW = plotW / entries.length * 0.6;
  const gap = plotW / entries.length * 0.4;

  // axis
  const baseY = h - padding;
  const leftX = padding;

  const colors = {
    1: '#ff8b8b',
    2: '#ffc07a',
    3: '#ffe27a',
    4: '#a6e3a1',
    5: '#84c5ff'
  };

  const max = Math.max(1, ...entries.map(([,v]) => v));
  const plotH = h - padding*2;

  const ctxStroke = getCSS('--border');
  ctx.strokeStyle = ctxStroke;
  ctx.beginPath();
  ctx.moveTo(leftX, padding);
  ctx.lineTo(leftX, baseY);
  ctx.lineTo(w - padding, baseY);
  ctx.stroke();

  entries.forEach(([box, count], i) => {
    const x = padding + i * (barW + gap) + gap/2;
    const barH = (count / max) * (plotH - 10);
    const y = baseY - barH;

    ctx.fillStyle = colors[box];
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = getCSS('--muted');
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Box ${box}`, x + barW/2, baseY + 14);
    ctx.fillText(`${count}`, x + barW/2, y - 6);
  });
}

// Simple helpers
function escapeHTML(str) {
  return (str || '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function getCSS(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#999';
}
// View switching
function switchView(name) {
    for (const key in els.views) {
      els.views[key].classList.toggle('active', key === name);
    }
    els.navBtns.forEach(btn => {
      const isCurrent = btn.dataset.view === name;
      btn.setAttribute('aria-current', isCurrent ? 'page' : 'false');
    });
    if (name === 'analytics') {
      renderAnalytics();
    }
  }
  
  function refreshAll() {
    renderDecks(els.deckSearch.value || '');
    populateDeckSelectors();
    if (els.views.analytics.classList.contains('active')) {
      renderAnalytics();
    }
  }
  
  // Deck modal
  function openDeckModal(title, deck = null) {
    editingDeckId = deck ? deck.id : null;
    els.deckForm.reset();
    document.getElementById('deckModalTitle').textContent = title;
    if (deck) {
      els.deckNameInput.value = deck.name;
      els.deckDescInput.value = deck.description || '';
    }
    els.deckModal.showModal();
  }
  
  els.deckForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.deckNameInput.value.trim();
    const desc = els.deckDescInput.value.trim();
    if (!name) return;
    if (editingDeckId) {
      updateDeck(editingDeckId, { name, description: desc });
    } else {
      createDeck(name, desc);
    }
    els.deckModal.close();
    refreshAll();
  });
  
  // Card modal
  function openCardModal(title, card = null) {
    editingCardId = card ? card.id : null;
    els.cardForm.reset();
    document.getElementById('cardModalTitle').textContent = title;
    if (card) {
      els.cardFrontInput.value = card.front;
      els.cardBackInput.value = card.back;
    }
    els.cardModal.showModal();
  }
  
  els.cardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const front = els.cardFrontInput.value.trim();
    const back = els.cardBackInput.value.trim();
    if (!front || !back) return;
  
    const deckId = deckForCardModal || AppState.session.currentDeckId || (AppState.data.decks[0] && AppState.data.decks[0].id);
    if (!deckId) {
      alert('Please create a deck first.');
      return;
    }
  
    if (editingCardId) {
      updateCard(deckId, editingCardId, { front, back });
    } else {
      createCard(deckId, front, back);
    }
  
    els.cardModal.close();
    deckForCardModal = null;
    refreshAll();
  });
  
  // Study session
  function startStudy(deckId) {
    AppState.session.currentDeckId = deckId;
    const deck = getDeck(deckId);
    if (!deck) return;
  
    const due = getDueCards(deck);
    AppState.session.dueQueue = shuffle(due.slice());
    AppState.session.currentCard = null;
    AppState.session.reviewedCount = 0;
  
    els.studyDeckName.textContent = deck.name;
    els.dueCount.textContent = `Due: ${AppState.session.dueQueue.length}`;
    els.sessionCount.textContent = `Session: 0`;
  
    els.cardFront.textContent = 'Front';
    els.cardBack.textContent = 'Back';
    els.cardBack.hidden = true;
  
    els.showAnswerBtn.hidden = false;
    els.gradeActions.hidden = true;
  
    els.noDueMsg.hidden = AppState.session.dueQueue.length > 0;
    els.studyPanel.hidden = AppState.session.dueQueue.length === 0;
  
    if (AppState.session.dueQueue.length > 0) {
      nextCard();
    }
  }
  
  function nextCard() {
    const q = AppState.session.dueQueue;
    if (!q.length) {
      els.noDueMsg.hidden = false;
      els.studyPanel.hidden = true;
      renderAnalytics();
      return;
    }
    const card = q[0];
    AppState.session.currentCard = card;
  
    els.cardFront.textContent = card.front;
    els.cardBack.textContent = card.back;
    els.cardBack.hidden = true;
  
    els.showAnswerBtn.hidden = false;
    els.gradeActions.hidden = true;
  
    els.cardFront.focus();
  }
  
  function showAnswer() {
    els.cardBack.hidden = false;
    els.showAnswerBtn.hidden = true;
    els.gradeActions.hidden = false;
    els.cardBack.focus();
  }
  
  function gradeCurrent(grade) {
    const deck = getDeck(AppState.session.currentDeckId);
    const card = AppState.session.currentCard;
    if (!deck || !card) return;
  
    schedule(card, grade);
    logReview(todayLocalDate());
    saveAll();
  
    // Remove from the front of queue
    AppState.session.dueQueue.shift();
    AppState.session.reviewedCount += 1;
    els.sessionCount.textContent = `Session: ${AppState.session.reviewedCount}`;
    const stillDue = getDueCards(deck).length;
    els.dueCount.textContent = `Due: ${stillDue}`;
  
    nextCard();
  }
  
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  
  // Export / Import / Reset
  function exportAll() {
    const payload = {
      version: 1,
      exportedAt: now(),
      data: AppState.data,
      prefs: AppState.prefs,
      reviews: getReviewLog()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindflash-backup-${todayLocalDate()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
  
  function importAll(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload || !payload.data || !payload.prefs) {
          alert('Invalid backup file.');
          return;
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(payload.data));
        localStorage.setItem(PREFS_KEY, JSON.stringify(payload.prefs));
        if (payload.reviews) {
          localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(payload.reviews));
        }
        loadAll();
        applyTheme(AppState.prefs.theme);
        refreshAll();
        alert('Import successful!');
      } catch (e) {
        alert('Failed to import: ' + e.message);
      }
    };
    reader.readAsText(file);
  }
  
  function resetAll() {
    if (!confirm('This will erase all decks, cards, and analytics. Continue?')) return;
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(REVIEW_LOG_KEY);
    loadAll();
    applyTheme(AppState.prefs.theme);
    refreshAll();
  }
  
  // Keyboard shortcuts
  function onKeyDown(e) {
    // Alt+1..4 to switch views
    if (e.altKey) {
      if (e.key === '1') { e.preventDefault(); switchView('decks'); }
      if (e.key === '2') { e.preventDefault(); switchView('study'); }
      if (e.key === '3') { e.preventDefault(); switchView('analytics'); renderAnalytics(); }
      if (e.key === '4') { e.preventDefault(); switchView('settings'); }
      return;
    }
  
    // Theme toggle: T
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      toggleTheme();
      return;
    }
  
    // Study shortcuts
    const studyVisible = !els.studyPanel.hidden;
    if (!studyVisible) return;
  
    const gradeVisible = !els.gradeActions.hidden;
  
    if (e.code === 'Space') {
      e.preventDefault();
      if (!gradeVisible) showAnswer();
      return;
    }
  
    if (gradeVisible) {
      if (e.key === '1') { e.preventDefault(); gradeCurrent('again'); }
      if (e.key === '2') { e.preventDefault(); gradeCurrent('hard'); }
      if (e.key === '3') { e.preventDefault(); gradeCurrent('good'); }
      if (e.key === '4') { e.preventDefault(); gradeCurrent('easy'); }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); gradeCurrent('good'); }
    }
  }
  
  // Theme controls
  function toggleTheme() {
    const current = AppState.prefs.theme || 'system';
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    AppState.prefs.theme = next;
    saveAll();
    applyTheme(next);
    // reflect in select if present
    if (els.themeSelect) els.themeSelect.value = next;
  }
  
  // Init UI events
  function initEvents() {
    // Navigation
    els.navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        switchView(view);
      });
    });
  
    // Decks
    els.addDeckBtn.addEventListener('click', () => openDeckModal('New Deck'));
    els.deckSearch.addEventListener('input', (e) => renderDecks(e.target.value));
  
    // Study
    els.startStudyBtn.addEventListener('click', () => {
      const deckId = els.studyDeckSelector.value;
      if (!deckId) {
        alert('Please create a deck first.');
        return;
      }
      startStudy(deckId);
    });
    els.showAnswerBtn.addEventListener('click', showAnswer);
    els.gradeActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-grade]');
      if (!btn) return;
      gradeCurrent(btn.dataset.grade);
    });
  
    // Analytics
    els.analyticsDeckSelector.addEventListener('change', renderAnalytics);
  
    // Theme
    els.themeToggle.addEventListener('click', toggleTheme);
    els.themeSelect.addEventListener('change', (e) => {
      AppState.prefs.theme = e.target.value;
      saveAll();
      applyTheme(AppState.prefs.theme);
    });
  
    // Export / Import / Reset
    els.exportBtn.addEventListener('click', exportAll);
    els.importInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importAll(file);
      e.target.value = '';
    });
    els.resetAllBtn.addEventListener('click', resetAll);
  
    // Keys
    window.addEventListener('keydown', onKeyDown);
  }
  
  // Optional: seed demo data for first run (comment out if not desired)
  function maybeSeed() {
    if ((AppState.data.decks || []).length) return;
    const d1 = createDeck('Web Dev Basics', 'HTML, CSS, JS essentials');
    createCard(d1.id, 'What does HTML stand for?', 'HyperText Markup Language');
    createCard(d1.id, 'What is CSS used for?', 'Styling and layout of web pages');
    createCard(d1.id, 'const vs let?', 'const is block-scoped and cannot be reassigned; let is block-scoped and can be reassigned.');
  
    const d2 = createDeck('Algorithms', 'Big-O and patterns');
    createCard(d2.id, 'Big-O of binary search?', 'O(log n)');
    createCard(d2.id, 'Two-pointer pattern usage?', 'Finding pairs, subarrays in sorted arrays/strings efficiently.');
  
    refreshAll();
  }
  
  // Boot
  function init() {
    loadAll();
    applyTheme(AppState.prefs.theme || 'system');
    initEvents();
    refreshAll();
    maybeSeed();
  }
  
  document.addEventListener('DOMContentLoaded', init);