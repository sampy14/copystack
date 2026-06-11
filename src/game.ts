// Core game logic for CopyStack. Pure functions, no DOM.

export interface Block {
  color: number; // 0-based color index
  number: number | null; // null in color-only modes
}

export type Column = Block[]; // index 0 = bottom
export type Board = Column[]; // playable columns + final buffer column

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  cols: number; // playable columns
  rows: number; // capacity per column
  colors: number;
  numbered: boolean;
  multiplier: number;
}

export type DifficultyId = 'easy' | 'medium' | 'hard' | 'insane';

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: { id: 'easy', label: 'Easy', cols: 3, rows: 3, colors: 3, numbered: false, multiplier: 1 },
  medium: { id: 'medium', label: 'Medium', cols: 4, rows: 4, colors: 4, numbered: false, multiplier: 1.5 },
  hard: { id: 'hard', label: 'Hard', cols: 3, rows: 3, colors: 3, numbered: true, multiplier: 2 },
  insane: { id: 'insane', label: 'Insane', cols: 4, rows: 4, colors: 4, numbered: true, multiplier: 3 },
};

/** Build the full block set for a difficulty. */
export function blockSet(cfg: DifficultyConfig): Block[] {
  const blocks: Block[] = [];
  for (let c = 0; c < cfg.colors; c++) {
    for (let r = 0; r < cfg.rows; r++) {
      blocks.push({ color: c, number: cfg.numbered ? r + 1 : null });
    }
  }
  return blocks;
}

/** Deal blocks into a random full arrangement of the playable columns (no buffer). */
export function dealArrangement(cfg: DifficultyConfig, rng: () => number = Math.random): Column[] {
  const blocks = blockSet(cfg);
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  const cols: Column[] = [];
  for (let c = 0; c < cfg.cols; c++) {
    cols.push(blocks.slice(c * cfg.rows, (c + 1) * cfg.rows));
  }
  return cols;
}

export function blocksEqual(a: Block, b: Block): boolean {
  return a.color === b.color && a.number === b.number;
}

export function arrangementsEqual(a: Column[], b: Column[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((col, i) => {
    if (col.length !== b[i].length) return false;
    return col.every((blk, j) => blocksEqual(blk, b[i][j]));
  });
}

/** Number of board positions whose block differs between two arrangements. */
export function mismatchCount(a: Column[], b: Column[]): number {
  let count = 0;
  a.forEach((col, i) => {
    col.forEach((blk, j) => {
      const other = b[i]?.[j];
      if (!other || !blocksEqual(blk, other)) count++;
    });
  });
  return count;
}

/**
 * Deal a target that differs substantially from the current playable
 * arrangement: at least two thirds of the positions must not match, so every
 * round requires real work. Bounded re-roll keeps the best candidate seen.
 */
export function dealTarget(
  cfg: DifficultyConfig,
  current: Column[],
  rng: () => number = Math.random
): Column[] {
  const totalBlocks = cfg.cols * cfg.rows;
  const minMismatch = Math.ceil((totalBlocks * 2) / 3);
  let best: Column[] | null = null;
  let bestMismatch = -1;
  for (let attempt = 0; attempt < 200; attempt++) {
    const target = dealArrangement(cfg, rng);
    const mismatch = mismatchCount(target, current);
    if (mismatch >= minMismatch) return target;
    if (mismatch > bestMismatch && mismatch > 0) {
      best = target;
      bestMismatch = mismatch;
    }
  }
  return best!;
}

export type MoveResult =
  | { ok: true; board: Board }
  | { ok: false; reason: 'source-empty' | 'destination-full' | 'same-column' };

/** Move the top block of column `from` to column `to`. Board includes the buffer as the last column. */
export function applyMove(board: Board, from: number, to: number, capacity: number): MoveResult {
  if (from === to) return { ok: false, reason: 'same-column' };
  if (board[from].length === 0) return { ok: false, reason: 'source-empty' };
  if (board[to].length >= capacity) return { ok: false, reason: 'destination-full' };
  const next = board.map((col) => col.slice());
  next[to].push(next[from].pop()!);
  return { ok: true, board: next };
}

/** Win when playable columns match the target exactly (buffer must be empty by construction). */
export function isWin(board: Board, target: Column[], playableCols: number): boolean {
  return arrangementsEqual(board.slice(0, playableCols), target);
}

/**
 * Per-card points: round(multiplier * 100000 / (seconds + 5 * moves)).
 * Moves are weighted heavily to reward planning over frantic tapping; the
 * 100k scale spreads scores out so performance differences are visible.
 */
export function cardScore(multiplier: number, seconds: number, moves: number): number {
  return Math.round((multiplier * 100000) / (seconds + 5 * moves));
}
