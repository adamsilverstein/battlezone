/**
 * Cannon fire - discrete circuit, DSOUND_CTRL bit $04 (enable) with bit $08
 * selecting volume.
 *
 * Reference section 5: the enable bit is held for a counter of 5 NMI ticks
 * ("play briefly"); the player's shot uses the loud volume bit and the enemy's
 * the soft one. The circuit keeps ringing after the enable bit drops, so the
 * burst is a short filtered noise crack with a decay tail.
 */

import type { Synth, Voice } from '../synth';

/** 5 NMI ticks at 250 Hz is how long the enable bit is held. */
export const CANNON_ENABLE_SECONDS = 5 / 250;
const TAIL_SECONDS = 0.14;
const LOUD_LEVEL = 0.85;
const SOFT_LEVEL = 0.42;

export function playCannon(synth: Synth, at: number, loud: boolean): Voice {
  return synth.noiseVoice({
    at,
    duration: CANNON_ENABLE_SECONDS + TAIL_SECONDS,
    level: loud ? LOUD_LEVEL : SOFT_LEVEL,
    attack: 0.002,
    filter: { type: 'lowpass', from: 2600, to: 220, q: 1.1 },
  });
}
