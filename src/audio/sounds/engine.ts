/**
 * Engine rumble - discrete circuit, DSOUND_CTRL bit $80 (motor enable) with bit
 * $10 selecting rev up or rev down.
 *
 * Reference section 5: the rumble runs whenever a game is being played, the rev
 * bit is set whenever the player moves and cleared when both sticks are centred,
 * and the circuit "ramps up and down over the course of several frames rather
 * than switching instantly", so the pitch glides. We build it from two detuned
 * sawtooths (which beat, like the real analog pair) plus low-passed noise for the
 * tread grind.
 */

import type { Synth, Voice } from '../synth';

const IDLE_HZ = 38;
const REV_HZ = 62;
/** The second oscillator is detuned so the rumble beats rather than drones. */
const DETUNE = 1.013;
const IDLE_CUTOFF_HZ = 200;
const REV_CUTOFF_HZ = 460;
const IDLE_LEVEL = 0.26;
const REV_LEVEL = 0.38;
const NOISE_LEVEL = 0.22;
/** Several game frames at 15.625 Hz: the circuit glides, it does not switch. */
export const ENGINE_RAMP_SECONDS = 0.32;

export interface EngineVoice extends Voice {
  /** Rev up while the treads are engaged, down when both sticks are centred. */
  setRev(revvedUp: boolean, at: number): void;
}

export function startEngine(synth: Synth, at: number): EngineVoice {
  const low = synth.oscillator('sawtooth', IDLE_HZ);
  const high = synth.oscillator('sawtooth', IDLE_HZ * DETUNE);
  const noise = synth.noiseSource();
  const noiseGain = synth.gain(NOISE_LEVEL);
  const tone = synth.filter('lowpass', IDLE_CUTOFF_HZ, 1.4);
  const output = synth.gain(IDLE_LEVEL);

  low.connect(tone);
  high.connect(tone);
  noise.connect(noiseGain);
  noiseGain.connect(tone);
  tone.connect(output);
  output.connect(synth.out);
  low.start(at);
  high.start(at);
  noise.start(at);

  const voice = synth.voice([low, high, noise], Infinity);
  let revvedUp = false;

  return {
    get endTime() {
      return voice.endTime;
    },
    stop: (when?: number) => voice.stop(when),
    setRev(next: boolean, when: number) {
      if (next === revvedUp) return;
      revvedUp = next;
      const end = when + ENGINE_RAMP_SECONDS;
      const base = next ? REV_HZ : IDLE_HZ;
      low.frequency.linearRampToValueAtTime(base, end);
      high.frequency.linearRampToValueAtTime(base * DETUNE, end);
      tone.frequency.linearRampToValueAtTime(next ? REV_CUTOFF_HZ : IDLE_CUTOFF_HZ, end);
      output.gain.linearRampToValueAtTime(next ? REV_LEVEL : IDLE_LEVEL, end);
    },
  };
}
