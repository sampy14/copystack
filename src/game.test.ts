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
  it('matches the formula round(mult * 100000 / (s + 5m))', () => {
    // round(1 * 100000 / (10 + 5*5)) = round(2857.14...) = 2857
    expect(cardScore(1, 10, 5)).toBe(2857);
    // round(1.5 * 100000 / (7.3 + 5*4)) = round(150000 / 27.3) = 5495
    expect(cardScore(1.5, 7.3, 4)).toBe(5495);
    // round(3 * 100000 / (20 + 5*12)) = round(300000 / 80) = 3750
    expect(cardScore(3, 20, 12)).toBe(3750);
  });

  it('weights moves more heavily than seconds', () => {
    // One extra move costs more than one extra second.
    expect(cardScore(1, 10, 6)).toBeLessThan(cardScore(1, 11, 5));
  });
});
