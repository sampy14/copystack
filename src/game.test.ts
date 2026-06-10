import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  blockSet,
  dealArrangement,
  dealTarget,
  arrangementsEqual,
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
  it('matches the spec formula', () => {
    // round(1 * 10000 / (10 + 2*5)) = round(500) = 500
    expect(cardScore(1, 10, 5)).toBe(500);
    // round(1.5 * 10000 / (7.3 + 2*4)) = round(15000 / 15.3) = round(980.39...) = 980
    expect(cardScore(1.5, 7.3, 4)).toBe(980);
    // round(3 * 10000 / (20 + 2*12)) = round(30000/44) = 682
    expect(cardScore(3, 20, 12)).toBe(682);
  });
});
