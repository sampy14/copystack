import type { DifficultyId } from './game';

export interface BestScores {
  bestTotalScore: number;
  bestCardTime: number | null; // seconds
}

export interface Settings {
  difficulty: DifficultyId;
}

const BEST_KEY = 'copystack.best';
const SETTINGS_KEY = 'copystack.settings';

type BestMap = Partial<Record<DifficultyId, BestScores>>;

export function loadBest(difficulty: DifficultyId): BestScores {
  const map = readJson<BestMap>(BEST_KEY) ?? {};
  return map[difficulty] ?? { bestTotalScore: 0, bestCardTime: null };
}

export function loadAllBest(): BestMap {
  return readJson<BestMap>(BEST_KEY) ?? {};
}

export function saveBest(difficulty: DifficultyId, best: BestScores): void {
  const map = readJson<BestMap>(BEST_KEY) ?? {};
  map[difficulty] = best;
  writeJson(BEST_KEY, map);
}

export function loadSettings(): Settings {
  return readJson<Settings>(SETTINGS_KEY) ?? { difficulty: 'easy' };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode etc.) — play without persistence.
  }
}
