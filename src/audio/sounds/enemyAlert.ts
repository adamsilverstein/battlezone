/**
 * New-enemy alert - POKEY effect $10 on channel 2: three rising boops.
 *
 * Reference section 5: "AUDF2 = $40 with step -1 x24, repeated three times;
 * AUDC2 = $a3 held 48 ticks x3". Falling period means rising pitch. The AUDC
 * stream is 144 ticks, so each AUDF step must last 2 ticks for the streams to
 * agree, giving three ~0.19 s boops, matching the reference's "~0.2 s each".
 *
 * This is the sound players remember as the "enemy in range" alert; there is no
 * separate in-range beep in the ROM.
 */

import { hold, type PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const BOOP: PokeyChunk = { value: 0x40, duration: 2, increment: -1, repetitions: 24 };
const AUDF: PokeyChunk[] = [BOOP, BOOP, BOOP];
const AUDC: PokeyChunk[] = [hold(0xa3, 48, 3)];

export function playEnemyAlert(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at });
}
