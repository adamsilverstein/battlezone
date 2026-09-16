/**
 * Extra life - POKEY effect $08 on channel 2: four high beeps.
 *
 * Reference section 5: "AUDF2 = $10 (high pitch) held $70 ticks x2; AUDC2
 * alternates $a2/$a0 seven times, 32 ticks each". Seven 32-tick AUDC steps are
 * 224 ticks, exactly the two 112-tick AUDF holds, and the a2/a0 alternation
 * gates one pitch on and off to make four beeps.
 */

import { hold, type PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const AUDF: PokeyChunk[] = [hold(0x10, 0x70, 2)];
const AUDC: PokeyChunk[] = [0xa2, 0xa0, 0xa2, 0xa0, 0xa2, 0xa0, 0xa2].map((value) =>
  hold(value, 32),
);

export function playExtraLife(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at });
}
