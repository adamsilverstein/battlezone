/** Shared setup for the audio-system tests. */

import {
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
} from './fakeAudioContext';
import { createAudioSystem, type AudioSystem } from '../../src/audio/audioSystem';
import type { AudioSnapshot } from '../../src/game/types';
import { pokeyFrequency } from '../../src/audio/pokey';

export const SILENT: AudioSnapshot = {
  engineRunning: false,
  moving: false,
  enemyInRange: false,
  missileActive: false,
  saucerActive: false,
  missileDistance: null,
};

/** In play, engine idling, nothing else going on. */
export const PLAYING: AudioSnapshot = { ...SILENT, engineRunning: true };

export interface Harness {
  /** The first context the system builds, and the only one unless it is replaced. */
  fake: FakeAudioContext;
  /** Every context the system has asked for, in order; a fresh one each time. */
  fakes: FakeAudioContext[];
  audio: AudioSystem;
  factoryCalls: () => number;
}

export function harness(): Harness {
  const fake = new FakeAudioContext();
  const fakes: FakeAudioContext[] = [fake];
  let calls = 0;
  const audio = createAudioSystem(() => {
    calls += 1;
    // A real factory hands back a brand new context every time, which is what a
    // system recovering from a dead one depends on.
    if (calls > fakes.length) fakes.push(new FakeAudioContext());
    return asAudioContext(fakes[calls - 1] as FakeAudioContext);
  });
  return { fake, fakes, audio, factoryCalls: () => calls };
}

export async function unlocked(): Promise<Harness> {
  const h = harness();
  await h.audio.unlock();
  return h;
}

export function oscillators(fake: FakeAudioContext): FakeOscillatorNode[] {
  return fake.nodes.filter((node): node is FakeOscillatorNode => {
    return node instanceof FakeOscillatorNode;
  });
}

export function gains(fake: FakeAudioContext): FakeGainNode[] {
  return fake.nodes.filter((node): node is FakeGainNode => node instanceof FakeGainNode);
}

/** Durations of every source that has both a start and a stop scheduled. */
export function sourceDurations(fake: FakeAudioContext): number[] {
  return fake
    .sources()
    .filter((source) => source.startTime !== null && source.stopTime !== null)
    .map((source) => (source.stopTime as number) - (source.startTime as number));
}

/** The saucer siren's output gain, found through its square carrier. */
export function sirenGain(fake: FakeAudioContext): FakeGainNode {
  const centre = (pokeyFrequency(0x40) + pokeyFrequency(0x20)) / 2;
  const carrier = fake.nodes.find((node): node is FakeOscillatorNode => {
    return node instanceof FakeOscillatorNode && Math.abs(node.frequency.value - centre) < 1;
  });
  const output = carrier?.outputs[0];
  if (!(output instanceof FakeGainNode)) throw new Error('no siren output gain');
  return output;
}

/** The missile buzz pair runs through its own 900 Hz lowpass into its gain. */
export function buzzGain(fake: FakeAudioContext): FakeGainNode {
  const filter = fake.nodes.find((node): node is FakeBiquadFilterNode => {
    return node instanceof FakeBiquadFilterNode && node.frequency.value === 900;
  });
  const output = filter?.outputs[0];
  if (!(output instanceof FakeGainNode)) throw new Error('no buzz output gain');
  return output;
}
