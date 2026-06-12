import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  blockSet,
  dealArrangement,
  dealTarget,
  arrangementsEqual,
  mismatchCount,
  applyMove,
  isWin,
  cardScore,
  type Board,
} from './game';

describe('blockSet', () => {
  it('color-only modes have R copies of each color, no numbers', () => {
    const set = blockSet(DIFFICULTIES.easy);
    expect(set).toHaveLength(9);
    expect(set.every((b) => b.number === null)).toBe(true);
    for (let c = 0; c < 3; c++) {
      expect(set.filter((b) => b.color === c)).toHaveLength(3);
    }
  });

  it('numbered modes have every color/number pair exactly once', () => {
    const set = blockSet(DIFFICULTIES.insane);
    expect(set).toHaveLength(16);
    const keys = new Set(set.map((b) => `${b.color}-${b.number}`));
    expect(keys.size).toBe(16);
    expect(set.every((b) => b.number !== null && b.number >= 1 && b.number <= 4)).toBe(true);
  });
});

describe('dealArrangement', () => {
  it('fills all playable columns to capacity', () => {
    const cols = dealArrangement(DIFFICULTIES.medium);
    expect(cols).toHaveLength(4);
    expect(cols.every((c) => c.length === 4)).toBe(true);
  });
});

describe('dealTarget', () => {
  it('never equals the current arrangement', () => {
    // Deterministic rng that would reproduce the same deal at first
    const current = dealArrangement(DIFFICULTIES.easy, () => 0.5);
    let calls = 0;
    const rng = () => {
      calls++;
      // First full deal identical, then diverge
      return calls <= 9 ? 0.5 : Math.random();
    };
    const target = dealTarget(DIFFICULTIES.easy, current, rng);
    expect(arrangementsEqual(target, current)).toBe(false);
  });

  it('requires at least two thirds of positions to differ', () => {
    for (const cfg of [DIFFICULTIES.easy, DIFFICULTIES.insane]) {
      const total = cfg.cols * cfg.rows;
      const minMismatch = Math.ceil((total * 2) / 3);
      for (let i = 0; i < 50; i++) {
        const current = dealArrangement(cfg);
        const target = dealTarget(cfg, current);
        expect(mismatchCount(target, current)).toBeGreaterThanOrEqual(minMismatch);
      }
    }
  });
});

describe('mismatchCount', () => {
  const b = (color: number) => ({ color, number: null });

  it('counts differing positions', () => {
    const a = [[b(0), b(1)], [b(2)]];
    const same = [[b(0), b(1)], [b(2)]];
    const oneOff = [[b(0), b(2)], [b(2)]];
    expect(mismatchCount(a, same)).toBe(0);
    expect(mismatchCount(a, oneOff)).toBe(1);
  });
});

describe('applyMove', () => {
  const b = (color: number) => ({ color, number: null });
  const board: Board = [[b(0), b(1)], [b(2)], []];

  it('moves the top block and counts as immutable update', () => {
    const res = applyMove(board, 0, 2, 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.board[0]).toHaveLength(1);
      expect(res.board[2]).toEqual([b(1)]);
      expect(board[0]).toHaveLength(2); // original untouched
    }
  });

  it('rejects moving from an empty column', () => {
    const res = applyMove(board, 2, 0, 2);
    expect(res).toEqual({ ok: false, reason: 'source-empty' });
  });

  it('rejects moving to a full column', () => {
    const res = applyMove(board, 1, 0, 2);
    expect(res).toEqual({ ok: false, reason: 'destination-full' });
  });

  it('rejects same-column moves', () => {
    const res = applyMove(board, 0, 0, 2);
    expect(res).toEqual({ ok: false, reason: 'same-column' });
  });
});

describe('isWin', () => {
  const b = (color: number) => ({ color, number: null });

  it('wins when playable columns match target', () => {
    const target = [[b(0)], [b(1)]];
    const board: Board = [[b(0)], [b(1)], []];
    expect(isWin(board, target, 2)).toBe(true);
  });

  it('does not win when arrangement differs', () => {
    const target = [[b(0)], [b(1)]];
    const board: Board = [[b(1)], [b(0)], []];
    expect(isWin(board, target, 2)).toBe(false);
  });

  it('numbered blocks must match color AND number', () => {
    const target = [[{ color: 0, number: 1 }]];
    const board: Board = [[{ color: 0, number: 2 }], []];
    expect(isWin(board, target, 1)).toBe(false);
  });
});

describe('cardScore', () => {
  it('matches the formula round(mult * 200000 / (s + 5m)^1.3)', () => {
    expect(cardScore(1, 10, 5)).toBe(Math.round(200000 / Math.pow(35, 1.3)));
    expect(cardScore(4, 7.3, 4)).toBe(Math.round(800000 / Math.pow(27.3, 1.3)));
    expect(cardScore(12, 20, 12)).toBe(Math.round(2400000 / Math.pow(80, 1.3)));
  });

  it('weights moves more heavily than seconds', () => {
    // One extra move costs more than one extra second.
    expect(cardScore(1, 10, 6)).toBeLessThan(cardScore(1, 11, 5));
  });

  it('rewards speed superlinearly: twice as slow loses far more than half the points', () => {
    expect(cardScore(1, 20, 10) * 2).toBeLessThan(cardScore(1, 10, 5));
  });

  it('a solid Insane run beats a fast Easy run', () => {
    const fastEasy = cardScore(DIFFICULTIES.easy.multiplier, 8, 6);
    const solidInsane = cardScore(DIFFICULTIES.insane.multiplier, 45, 25);
    expect(solidInsane).toBeGreaterThan(fastEasy);
  });
});
