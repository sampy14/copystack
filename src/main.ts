import {
  DIFFICULTIES,
  applyMove,
  cardScore,
  dealArrangement,
  dealTarget,
  isWin,
  type Block,
  type Board,
  type Column,
  type DifficultyConfig,
  type DifficultyId,
} from './game';
import { loadAllBest, loadBest, loadSettings, saveBest, saveSettings } from './storage';
import { initOnline, renderAccount, renderLeaderboard, reportScore, wireOnlineUi } from './online';

type Phase = 'ready' | 'playing' | 'won';

interface State {
  cfg: DifficultyConfig;
  board: Board; // playable columns + buffer (last)
  target: Column[];
  phase: Phase;
  selected: number | null;
  moves: number;
  startTime: number; // performance.now() at Start press
  elapsed: number; // seconds, frozen on win
  cardsWon: number;
  totalScore: number;
  bestCardTime: number | null; // session best
}

const settings = loadSettings();
let state = newSession(DIFFICULTIES[settings.difficulty]);
let timerHandle: number | null = null;

// ---------- DOM refs ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $('board');
const cardFlipper = $('card-flipper');
const cardFront = $('card-front');
const startBtn = $<HTMLButtonElement>('start-btn');
const difficultySelect = $<HTMLSelectElement>('difficulty');
const newGameBtn = $('new-game');
const bestBtn = $('best-btn');
const winOverlay = $('win-overlay');
const winDetails = $('win-details');
const winNextBtn = $('win-next');
const bestOverlay = $('best-overlay');
const bestTable = $('best-table');
const bestCloseBtn = $('best-close');

function newSession(cfg: DifficultyConfig): State {
  const playable = dealArrangement(cfg);
  return {
    cfg,
    board: [...playable, []],
    target: dealTarget(cfg, playable),
    phase: 'ready',
    selected: null,
    moves: 0,
    startTime: 0,
    elapsed: 0,
    cardsWon: 0,
    totalScore: 0,
    bestCardTime: null,
  };
}

// ---------- Rendering ----------
function blockEl(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = `block color-${block.color}`;
  if (block.number !== null) {
    el.textContent = String(block.number);
  }
  return el;
}

function renderBoard(): void {
  const { cfg, board, selected } = state;
  boardEl.innerHTML = '';
  // Size blocks to fill the available board area: constrained by height
  // (R slots per column) and by width (cols + buffer side by side).
  const numCols = cfg.cols + 1;
  const heightBased = Math.floor((boardEl.clientHeight - 20 - cfg.rows * 4) / cfg.rows);
  const colWidth = Math.min(
    120,
    Math.floor((boardEl.clientWidth - (numCols - 1) * 6) / numCols)
  );
  const blockH = Math.max(36, Math.min(heightBased, colWidth - 20, 104));
  board.forEach((col, i) => {
    const colEl = document.createElement('div');
    const isBuffer = i === board.length - 1;
    colEl.className = 'column' + (isBuffer ? ' buffer' : '');
    // Column width = block size + padding/border, so blocks render square
    // (the buffer's 2px dashed border needs 2px more than the 1px solid one).
    colEl.style.flex = '0 0 auto';
    colEl.style.width = `${blockH + (isBuffer ? 22 : 20)}px`;
    if (selected === i) colEl.classList.add('selected');
    // Render exactly R slots so capacity is visible; fill from the bottom.
    for (let j = 0; j < cfg.rows; j++) {
      const block = col[j];
      let slotEl: HTMLElement;
      if (block) {
        slotEl = blockEl(block);
        if (selected === i && j === col.length - 1) slotEl.classList.add('top-selected');
      } else {
        slotEl = document.createElement('div');
        slotEl.className = 'slot';
      }
      slotEl.style.height = `${blockH}px`;
      colEl.appendChild(slotEl);
    }
    colEl.addEventListener('click', () => onColumnTap(i, colEl));
    boardEl.appendChild(colEl);
  });
  boardEl.classList.toggle('locked', state.phase !== 'playing');
}

function renderCard(): void {
  const { cfg, target } = state;
  cardFront.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  grid.style.gridTemplateColumns = `repeat(${cfg.cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${cfg.rows}, 1fr)`;
  // Render top row first (row index rows-1 down to 0).
  for (let r = cfg.rows - 1; r >= 0; r--) {
    for (let c = 0; c < cfg.cols; c++) {
      const block = target[c][r];
      const cell = document.createElement('div');
      if (block) {
        cell.className = `card-cell color-${block.color}`;
        if (block.number !== null) {
          cell.textContent = String(block.number);
        }
      } else {
        cell.className = 'card-cell empty';
      }
      grid.appendChild(cell);
    }
  }
  cardFront.appendChild(grid);
}

function renderStats(): void {
  $('stat-time').textContent = state.elapsed.toFixed(1);
  $('stat-moves').textContent = String(state.moves);
  $('stat-cards').textContent = String(state.cardsWon);
  $('stat-best').textContent = state.bestCardTime === null ? '—' : `${state.bestCardTime.toFixed(1)}s`;
  $('stat-score').textContent = String(state.totalScore);
}

// ---------- Timer ----------
function startTimer(): void {
  state.startTime = performance.now();
  stopTimer();
  timerHandle = window.setInterval(() => {
    state.elapsed = (performance.now() - state.startTime) / 1000;
    $('stat-time').textContent = state.elapsed.toFixed(1);
  }, 100);
}

function stopTimer(): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// ---------- Interaction ----------
function rejectMove(colEl: HTMLElement): void {
  colEl.classList.remove('shake');
  void colEl.offsetWidth; // restart animation
  colEl.classList.add('shake');
  navigator.vibrate?.(50);
}

function onColumnTap(i: number, colEl: HTMLElement): void {
  if (state.phase !== 'playing') return;
  const capacity = state.cfg.rows;

  if (state.selected === null) {
    if (state.board[i].length === 0) {
      rejectMove(colEl);
      return;
    }
    state.selected = i;
    renderBoard();
    return;
  }

  if (state.selected === i) {
    state.selected = null;
    renderBoard();
    return;
  }

  const result = applyMove(state.board, state.selected, i, capacity);
  if (!result.ok) {
    rejectMove(colEl);
    return;
  }
  state.board = result.board;
  state.selected = null;
  state.moves += 1;
  renderBoard();
  renderStats();

  if (isWin(state.board, state.target, state.cfg.cols)) {
    onWin();
  }
}

function onWin(): void {
  stopTimer();
  state.elapsed = (performance.now() - state.startTime) / 1000;
  state.phase = 'won';
  const seconds = state.elapsed;
  const points = cardScore(state.cfg.multiplier, seconds, state.moves);
  const prevScore = state.totalScore;
  state.cardsWon += 1;
  state.totalScore += points;
  if (state.bestCardTime === null || seconds < state.bestCardTime) {
    state.bestCardTime = seconds;
  }
  persistBest();
  reportScore(state.cfg.id, points, Math.round(seconds * 1000), state.moves);
  renderStats();
  celebrateWin(prevScore, state.totalScore);

  winDetails.textContent = `Time: ${seconds.toFixed(1)}s\nMoves: ${state.moves}\nPoints: ${points}`;
  setTimeout(() => winOverlay.classList.remove('hidden'), 750);
}

/** Win presentation: snap + staggered sheen, glow ripple, score count-up. */
function celebrateWin(fromScore: number, toScore: number): void {
  boardEl.classList.add('celebrate');
  boardEl
    .querySelectorAll<HTMLElement>('.column:not(.buffer) .block')
    .forEach((el, i) => (el.style.animationDelay = `${i * 30}ms`));
  setTimeout(() => boardEl.classList.remove('celebrate'), 700);

  const ripple = document.createElement('div');
  ripple.className = 'board-ripple';
  boardEl.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());

  const scoreEl = $('stat-score');
  const cell = $('score-cell');
  cell.classList.remove('pulse');
  void cell.offsetWidth;
  cell.classList.add('pulse');
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / 600);
    scoreEl.textContent = String(Math.round(fromScore + (toScore - fromScore) * p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function persistBest(): void {
  const stored = loadBest(state.cfg.id);
  const next = {
    bestTotalScore: Math.max(stored.bestTotalScore, state.totalScore),
    bestCardTime:
      stored.bestCardTime === null
        ? state.bestCardTime
        : state.bestCardTime === null
          ? stored.bestCardTime
          : Math.min(stored.bestCardTime, state.bestCardTime),
  };
  saveBest(state.cfg.id, next);
}

function nextCard(): void {
  winOverlay.classList.add('hidden');
  // Board keeps current arrangement; deal a new face-down card.
  state.target = dealTarget(state.cfg, state.board.slice(0, state.cfg.cols));
  state.phase = 'ready';
  state.selected = null;
  state.moves = 0;
  state.elapsed = 0;
  cardFlipper.classList.remove('flipped');
  startBtn.disabled = false;
  renderCard();
  renderBoard();
  renderStats();
}

function onStart(): void {
  if (state.phase !== 'ready') return;
  state.phase = 'playing';
  cardFlipper.classList.add('flipped');
  startBtn.disabled = true;
  renderBoard();
  startTimer();
}

function resetSession(cfg: DifficultyConfig): void {
  stopTimer();
  state = newSession(cfg);
  cardFlipper.classList.remove('flipped');
  startBtn.disabled = false;
  winOverlay.classList.add('hidden');
  renderCard();
  renderBoard();
  renderStats();
}

// ---------- Best panel ----------
function showBest(): void {
  bestTable.innerHTML = '';
  const all = loadAllBest();
  (Object.keys(DIFFICULTIES) as DifficultyId[]).forEach((id) => {
    const best = all[id];
    const row = document.createElement('div');
    row.className = 'best-row';
    const time = best?.bestCardTime != null ? `${best.bestCardTime.toFixed(1)}s` : '—';
    const score = best?.bestTotalScore ? String(best.bestTotalScore) : '—';
    row.innerHTML = `<span>${DIFFICULTIES[id].label}</span><span>${time} · ${score} pts</span>`;
    bestTable.appendChild(row);
  });
  renderAccount();
  void renderLeaderboard(state.cfg.id);
  bestOverlay.classList.remove('hidden');
}

// ---------- Wiring ----------
difficultySelect.value = state.cfg.id;

difficultySelect.addEventListener('change', () => {
  const id = difficultySelect.value as DifficultyId;
  saveSettings({ difficulty: id });
  resetSession(DIFFICULTIES[id]);
});

newGameBtn.addEventListener('click', () => resetSession(state.cfg));
startBtn.addEventListener('click', onStart);
winNextBtn.addEventListener('click', nextCard);
bestBtn.addEventListener('click', showBest);
bestCloseBtn.addEventListener('click', () => bestOverlay.classList.add('hidden'));

// ---------- Theme ----------
const THEME_KEY = 'copystack.theme';
const themeToggle = $<HTMLButtonElement>('theme-toggle');

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
}

const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
applyTheme(storedTheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
});

window.addEventListener('resize', () => {
  renderBoard();
  // Layout can still be settling during orientation changes; render again next frame.
  requestAnimationFrame(renderBoard);
});

// PWA service worker
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

renderCard();
renderBoard();
renderStats();
wireOnlineUi();
void initOnline();
