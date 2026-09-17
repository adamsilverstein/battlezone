/**
 * Saucer hit - POKEY effect $20 on channel 1: a short rising chirp, played
 * twice and looped while the saucer flashes and fades out.
 *
 * Reference section 5: "AUDF1 = $30 step -4 x12, twice; AUDC2 = $a3 held 2
 * ticks x12". The AUDC stream is 24 ticks, so the 24 AUDF steps are 1 tick each:
 * one pass is 96 ms. The fade-out runs `saucer_dead_intens` $40 down 2 per game
 * frame, i.e. 32 frames (2.048 s), so the effect loops 21 times to cover it
 * (reference section 2, "Saucer killed").
 */

import { hold, type PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const SWEEP: PokeyChunk = { value: 0x30, duration: 1, increment: -4, repetitions: 12 };
const AUDF: PokeyChunk[] = [SWEEP, SWEEP];
const AUDC: PokeyChunk[] = [hold(0xa3, 2, 12)];

/** Passes needed to cover the 32-game-frame fade-out. */
export const SAUCER_HIT_REPEAT = 21;

export function playSaucerHit(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at, repeat: SAUCER_HIT_REPEAT });
}
