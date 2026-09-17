/**
 * Obstacle collision warble - POKEY effect $02 on channel 1.
 *
 * Reference section 5: AUDF1 sweeps through ten alternating chunks, each held
 * 1 tick and stepped 12 times, which converge on a middle pitch; AUDC1 starts at
 * $ab and fades by 1 for 9 steps, then holds $a2 twice.
 *
 * The reference does not record the AUDC chunk durations. The AUDF stream runs
 * 120 ticks across 11 AUDC steps, so we hold ten of them for 11 ticks and the
 * last for 10, which comes to exactly 120 ticks (0.48 s) and keeps the two
 * streams in step.
 */

import type { PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const AUDF: PokeyChunk[] = [
  { value: 0xc0, duration: 1, increment: -10, repetitions: 12 },
  { value: 0x84, duration: 1, increment: 9, repetitions: 12 },
  { value: 0xf0, duration: 1, increment: -8, repetitions: 12 },
  { value: 0x90, duration: 1, increment: 7, repetitions: 12 },
  { value: 0xe4, duration: 1, increment: -6, repetitions: 12 },
  { value: 0x9c, duration: 1, increment: 5, repetitions: 12 },
  { value: 0xd8, duration: 1, increment: -4, repetitions: 12 },
  { value: 0xa8, duration: 1, increment: 3, repetitions: 12 },
  { value: 0xcc, duration: 1, increment: -2, repetitions: 12 },
  { value: 0xb4, duration: 1, increment: 1, repetitions: 12 },
];

const AUDC: PokeyChunk[] = [
  { value: 0xab, duration: 11, increment: -1, repetitions: 9 },
  { value: 0xa2, duration: 11, increment: 0, repetitions: 1 },
  { value: 0xa2, duration: 10, increment: 0, repetitions: 1 },
];

export function playCollisionWarble(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at });
}
