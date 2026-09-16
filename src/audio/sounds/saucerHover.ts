/**
 * Saucer alive - POKEY effect $40 on channel 1: the quiet, slow up-and-down
 * hovering siren that loops for as long as the saucer lives.
 *
 * Reference section 5: "AUDF1 alternates $40 step -2 x16 then $20 step +2 x16,
 * twice; AUDC1 = $a1 (volume 1)". That sweeps between the pitches for AUDF $40
 * and $20, i.e. about 492 Hz and 969 Hz. The reference does not give the step
 * duration; 4 ticks per step makes a 128-tick (0.512 s) cycle, which matches its
 * description as "slow". Because the loop is open-ended we drive a square
 * carrier from a triangle LFO at the cycle rate rather than scheduling the
 * stepped stream forever.
 */

import { audcVolume, pokeyFrequency, volumeToGain } from '../pokey';
import type { Synth, Voice } from '../synth';

/** Volume 1: this siren is meant to sit right at the back of the mix. */
const AUDC = 0xa1;
const LOW_HZ = pokeyFrequency(0x40);
const HIGH_HZ = pokeyFrequency(0x20);
const CENTRE_HZ = (LOW_HZ + HIGH_HZ) / 2;
const DEPTH_HZ = (HIGH_HZ - LOW_HZ) / 2;
/** 16 steps up plus 16 steps down, 4 NMI ticks each, at 250 Hz. */
const CYCLE_SECONDS = (32 * 4) / 250;

/** The saucer siren is lowest priority on channel 1, so it can be silenced. */
export interface SaucerHoverVoice extends Voice {
  /** Mutes the siren for the span another channel-1 effect occupies. */
  suppress(from: number, until: number): void;
}

export function startSaucerHover(synth: Synth, at: number): SaucerHoverVoice {
  const level = volumeToGain(audcVolume(AUDC));
  const carrier = synth.oscillator('square', CENTRE_HZ);
  const lfo = synth.oscillator('triangle', 1 / CYCLE_SECONDS);
  const lfoDepth = synth.gain(DEPTH_HZ);
  const output = synth.gain(level);

  lfo.connect(lfoDepth);
  lfoDepth.connect(carrier.frequency);
  carrier.connect(output);
  output.connect(synth.out);
  carrier.start(at);
  lfo.start(at);

  const voice = synth.voice([carrier, lfo], Infinity);
  return {
    get endTime() {
      return voice.endTime;
    },
    stop: (when?: number) => voice.stop(when),
    suppress(from: number, until: number) {
      output.gain.setValueAtTime(0, from);
      output.gain.setValueAtTime(level, until);
    },
  };
}
