/**
 * Post-collision "merp" - POKEY effect $04, a very short quiet high squeak.
 *
 * Reference section 5: "AUDF1 $10 held 1 tick x32; AUDC1 $c1 decreasing x2".
 * The reference's channel table puts this effect on channel 2 while its data
 * column names AUDF1/AUDC1; we follow the channel table and play it on
 * channel 2. $c1 is 4-bit poly noise at volume 1, and the two AUDC steps split
 * the 32-tick stream in half (16 ticks each), so the squeak fades to silence.
 */

import type { PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const AUDF: PokeyChunk[] = [{ value: 0x10, duration: 1, increment: 0, repetitions: 32 }];
const AUDC: PokeyChunk[] = [{ value: 0xc1, duration: 16, increment: -1, repetitions: 2 }];

export function playMerp(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at });
}
