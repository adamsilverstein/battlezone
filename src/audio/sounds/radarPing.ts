/**
 * Radar ping - POKEY effect $01 on channel 2.
 *
 * Reference section 5: "AUDF2 = $23 held 16 ticks; AUDC2 = $a3 held 16 ticks",
 * a single ~64 ms high blip at volume 3. It fires once per radar sweep pass over
 * an enemy, and it happily stomps the new-enemy alert because they share
 * channel 2 with no priority handling.
 */

import { hold } from '../pokey';
import type { Synth, Voice } from '../synth';

const AUDF = [hold(0x23, 16)];
const AUDC = [hold(0xa3, 16)];

export function playRadarPing(synth: Synth, at: number): Voice {
  return synth.pokeyVoice({ audf: AUDF, audc: AUDC, at });
}
