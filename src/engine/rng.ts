/**
 * Seeded pseudo-random source.  The simulation never touches `Math.random`, so
 * AI, spawning and attract-mode demo play are reproducible (design spec 4).
 *
 * mulberry32: a 32-bit state, one multiply-xorshift round per draw.  It is not
 * the original's LFSR - the ROM's `RANDOM` byte is a hardware noise source that
 * cannot be reproduced anyway - but it is fast, well distributed and stable
 * across engines, which is what the tests need.
 */

import type { Rng } from '../game/types';

export function createRng(seed: number): Rng {
  // Keep the state a 32-bit unsigned integer so the arithmetic below stays exact.
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (maxExclusive: number): number =>
      maxExclusive > 0 ? Math.floor(next() * maxExclusive) : 0,
  };
}
