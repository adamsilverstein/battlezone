/**
 * Missile buzz - POKEY channels 3 and 4.
 *
 * Reference section 5: the frequencies are set once at missile creation, AUDF3 =
 * $ff and AUDF4 = $fe, "two channels one period apart, which beat against each
 * other and give the missile its low warbling drone". Volume tracks distance -
 * the distance high byte shifted right 3, masked to 0-15 and inverted, written to
 * AUDC3/AUDC4 every frame - so nearer is louder, and the buzz is silent when the
 * missile is too far away.
 */

import { pokeyFrequency, volumeToGain } from '../pokey';
import type { Synth, Voice } from '../synth';

const AUDF3 = 0xff;
const AUDF4 = 0xfe;
/** The original rewrites the volume once per game frame (64 ms). */
const LEVEL_RAMP_SECONDS = 0.064;

export interface MissileBuzzVoice extends Voice {
  /** POKEY volume 0-15, as written to AUDC3/AUDC4; 0 is silence. */
  setVolume(volume: number, at: number): void;
}

export function startMissileBuzz(synth: Synth, at: number, volume: number): MissileBuzzVoice {
  const a = synth.oscillator('square', pokeyFrequency(AUDF3));
  const b = synth.oscillator('square', pokeyFrequency(AUDF4));
  // The pair is a raw square beat in the original; roll the harshest harmonics
  // off so it reads as a drone rather than a buzzsaw.
  const tone = synth.filter('lowpass', 900, 0.8);
  const output = synth.gain(volumeToGain(volume));

  a.connect(tone);
  b.connect(tone);
  tone.connect(output);
  output.connect(synth.out);
  a.start(at);
  b.start(at);

  const voice = synth.voice([a, b], Infinity);
  return {
    get endTime() {
      return voice.endTime;
    },
    stop: (when?: number) => voice.stop(when),
    setVolume(next: number, when: number) {
      output.gain.linearRampToValueAtTime(volumeToGain(next), when + LEVEL_RAMP_SECONDS);
    },
  };
}
