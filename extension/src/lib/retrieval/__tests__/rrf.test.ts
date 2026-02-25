import { describe, it, expect } from 'vitest';
import { rrf, rrfWithScores } from '../rrf';

// ─── rrf() ────────────────────────────────────────────────────────────────────

describe('rrf()', () => {
  it('returns empty array when all lists are empty', () => {
    expect(rrf([])).toEqual([]);
    expect(rrf([[], []])).toEqual([]);
  });

  it('single list — returns IDs in original order', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = rrf([list]);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('item in both lists ranks above items in only one', () => {
    const bm25   = [{ id: 'a' }, { id: 'b' }, { id: 'common' }];
    const vector = [{ id: 'common' }, { id: 'c' }, { id: 'd' }];
    const result = rrf([bm25, vector]);
    // 'common' appears at rank 2 in bm25 and rank 0 in vector → high combined score
    const commonIndex = result.indexOf('common');
    expect(commonIndex).toBeLessThan(result.indexOf('a'));
    expect(commonIndex).toBeLessThan(result.indexOf('c'));
  });

  it('item at rank-0 in both lists ranks first overall', () => {
    const list1 = [{ id: 'winner' }, { id: 'x' }];
    const list2 = [{ id: 'winner' }, { id: 'y' }];
    const result = rrf([list1, list2]);
    expect(result[0]).toBe('winner');
  });

  it('completely disjoint lists — all items included, higher-ranked ones first', () => {
    const list1 = [{ id: 'a' }];  // score = 1/(60+0+1) = 1/61
    const list2 = [{ id: 'b' }];  // same score
    const result = rrf([list1, list2]);
    expect(result).toHaveLength(2);
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('higher k value reduces score differences between ranks', () => {
    const list = [{ id: 'first' }, { id: 'second' }];
    const scoresLowK  = rrfWithScores([list], 1);
    const scoresHighK = rrfWithScores([list], 1000);
    const diffLowK  = (scoresLowK[0]?.score  ?? 0) - (scoresLowK[1]?.score  ?? 0);
    const diffHighK = (scoresHighK[0]?.score ?? 0) - (scoresHighK[1]?.score ?? 0);
    expect(diffHighK).toBeLessThan(diffLowK);
  });

  it('output is deterministic for the same input', () => {
    const lists = [[{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]];
    expect(rrf(lists)).toEqual(rrf(lists));
  });
});

// ─── rrfWithScores() ──────────────────────────────────────────────────────────

describe('rrfWithScores()', () => {
  it('scores decrease monotonically', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = rrfWithScores([list]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it('score formula matches 1/(k+rank+1) for single list', () => {
    const k = 60;
    const list = [{ id: 'x' }, { id: 'y' }];
    const result = rrfWithScores([list], k);

    const xScore = result.find(r => r.id === 'x')?.score ?? 0;
    const yScore = result.find(r => r.id === 'y')?.score ?? 0;

    expect(xScore).toBeCloseTo(1 / (k + 0 + 1));
    expect(yScore).toBeCloseTo(1 / (k + 1 + 1));
  });

  it('item in two lists at rank 0 each has score ≈ 2/(k+1)', () => {
    const k = 60;
    const item = { id: 'top' };
    const result = rrfWithScores([[item], [item]], k);
    const score = result.find(r => r.id === 'top')?.score ?? 0;
    expect(score).toBeCloseTo(2 / (k + 1));
  });

  it('returns empty for empty input', () => {
    expect(rrfWithScores([])).toEqual([]);
    expect(rrfWithScores([[]])).toEqual([]);
  });
});
