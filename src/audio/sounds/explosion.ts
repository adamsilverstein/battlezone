/**
 * Explosion - discrete circuit, DSOUND_CTRL bit $01 (enable) with bit $02
 * selecting volume.
 *
 * Reference section 5: the enable bit is held for a counter of $ff (~1 s) for a
 * loud explosion - player death, the victim of a kill, the 100K boom and the
 * high-score boom - and $70 (~0.5 s) for a soft one, meaning a shell hitting an
 * obstacle or the shooter's own feedback. Both counters run at the 250 Hz NMI.
 */

import type { Synth, Voice } from '../synth';

export const LOUD_EXPLOSION_SECONDS = 0xff / 250;
export const SOFT_EXPLOSION_SECONDS = 0x70 / 250;
const LOUD_LEVEL = 0.9;
const SOFT_LEVEL = 0.45;

export function playExplosion(synth: Synth, at: number, loud: boolean): Voice {
  return synth.noiseVoice({
    at,
    duration: loud ? LOUD_EXPLOSION_SECONDS : SOFT_EXPLOSION_SECONDS,
    level: loud ? LOUD_LEVEL : SOFT_LEVEL,
    attack: 0.006,
    filter: { type: 'lowpass', from: loud ? 1100 : 1500, to: 70, q: 1 },
  });
}
