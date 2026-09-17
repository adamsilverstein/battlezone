import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const first = Array.from({ length: 16 }, () => a.next());
    const second = Array.from({ length: 16 }, () => b.next());
    expect(first).toEqual(second);
  });

  it('gives different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('returns floats in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('returns integers in [0, maxExclusive)', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const v = rng.int(8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
      seen.add(v);
    }
    expect(seen.size).toBe(8);
  });

  it('treats a non-positive bound as zero', () => {
    const rng = createRng(3);
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-5)).toBe(0);
  });
});
