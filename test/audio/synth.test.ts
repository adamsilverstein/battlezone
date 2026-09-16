import { describe, expect, it } from 'vitest';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
} from './fakeAudioContext';
import { createSynth } from '../../src/audio/synth';
import { NMI_HZ, hold, pokeyFrequency, volumeToGain } from '../../src/audio/pokey';

function setup(): { fake: FakeAudioContext; out: FakeGainNode } {
  const fake = new FakeAudioContext();
  const out = fake.createGain();
  out.connect(fake.destination);
  return { fake, out };
}

describe('pokeyVoice', () => {
  it('plays a pure-tone stream on a square oscillator through its own gain', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const voice = synth.pokeyVoice({
      audf: [{ value: 0x40, duration: 2, increment: -1, repetitions: 3 }],
      audc: [hold(0xa3, 6)],
      at: 1,
    });

    const osc = fake.nodesOfKind('oscillator')[0];
    expect(osc).toBeInstanceOf(FakeOscillatorNode);
    if (!(osc instanceof FakeOscillatorNode)) throw new Error('no oscillator');
    expect(osc.type).toBe('square');
    // POKEY pure tone is a square wave, so nothing else should be used.
    expect(fake.nodesOfKind('oscillator')).toHaveLength(1);
    expect(fake.nodesOfKind('bufferSource')).toHaveLength(0);

    expect(osc.frequency.changes).toEqual([
      { method: 'setValueAtTime', value: pokeyFrequency(0x40), time: 1 },
      { method: 'setValueAtTime', value: pokeyFrequency(0x3f), time: 1 + 2 / NMI_HZ },
      { method: 'setValueAtTime', value: pokeyFrequency(0x3e), time: 1 + 4 / NMI_HZ },
    ]);

    const gain = fake.nodesOfKind('gain').find((node) => node !== out);
    if (!(gain instanceof FakeGainNode)) throw new Error('no voice gain');
    // The stream's volume, then a release to silence when the stream ends.
    expect(gain.gain.scheduledValues()).toEqual([volumeToGain(3), 0]);
    expect(osc.outputs).toEqual([gain]);
    expect(gain.outputs).toEqual([out]);

    // The stream lasts 6 ticks, so the voice starts at 1 and ends at 1.024.
    expect(osc.startTime).toBe(1);
    expect(osc.stopTime).toBeCloseTo(1 + 6 / NMI_HZ, 9);
    expect(voice.endTime).toBeCloseTo(1 + 6 / NMI_HZ, 9);
  });

  it('scales AUDC volume by the requested level', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    synth.pokeyVoice({
      audf: [hold(0x10, 4)],
      audc: [{ value: 0xa2, duration: 2, increment: -1, repetitions: 2 }],
      at: 0,
      level: 0.5,
    });

    const gain = fake.nodesOfKind('gain').find((node) => node !== out);
    if (!(gain instanceof FakeGainNode)) throw new Error('no voice gain');
    expect(gain.gain.scheduledValues()).toEqual([volumeToGain(2) * 0.5, volumeToGain(1) * 0.5, 0]);
  });

  it('plays a poly-noise stream from a looping poly buffer', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    synth.pokeyVoice({ audf: [hold(0x10, 16)], audc: [hold(0xc1, 16)], at: 0 });

    expect(fake.nodesOfKind('oscillator')).toHaveLength(0);
    const source = fake.nodesOfKind('bufferSource')[0];
    if (!(source instanceof FakeAudioBufferSourceNode)) throw new Error('no buffer source');
    expect(source.loop).toBe(true);
    expect(source.buffer?.length).toBe(15);
    // The poly counter is clocked at the channel frequency.
    expect(source.playbackRate.scheduledValues()).toEqual([pokeyFrequency(0x10) / fake.sampleRate]);
  });

  it('repeats the whole stream for looped effects', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const voice = synth.pokeyVoice({
      audf: [hold(0x30, 2, 2)],
      audc: [hold(0xa3, 4)],
      at: 0,
      repeat: 3,
    });

    const osc = fake.nodesOfKind('oscillator')[0];
    if (!(osc instanceof FakeOscillatorNode)) throw new Error('no oscillator');
    expect(osc.frequency.changes.map((c) => c.time)).toEqual([
      0,
      2 / NMI_HZ,
      4 / NMI_HZ,
      6 / NMI_HZ,
      8 / NMI_HZ,
      10 / NMI_HZ,
    ]);
    expect(voice.endTime).toBeCloseTo(12 / NMI_HZ, 9);
  });

  it('stops early when asked', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const voice = synth.pokeyVoice({ audf: [hold(0x10, 250)], audc: [hold(0xa8, 250)], at: 0 });
    voice.stop(0.25);

    const osc = fake.nodesOfKind('oscillator')[0];
    if (!(osc instanceof FakeOscillatorNode)) throw new Error('no oscillator');
    expect(osc.stopTime).toBe(0.25);
  });
});

describe('noiseVoice', () => {
  it('builds a filtered noise burst with an attack and exponential decay', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const voice = synth.noiseVoice({
      at: 2,
      duration: 0.5,
      level: 0.8,
      filter: { type: 'lowpass', from: 1200, to: 80, q: 1.2 },
    });

    const source = fake.nodesOfKind('bufferSource')[0];
    const filter = fake.nodesOfKind('biquad')[0];
    const gain = fake.nodesOfKind('gain').find((node) => node !== out);
    if (
      !(source instanceof FakeAudioBufferSourceNode) ||
      !(filter instanceof FakeBiquadFilterNode) ||
      !(gain instanceof FakeGainNode)
    ) {
      throw new Error('unexpected noise graph');
    }

    expect(source.loop).toBe(true);
    expect(source.outputs).toEqual([filter]);
    expect(filter.outputs).toEqual([gain]);
    expect(gain.outputs).toEqual([out]);

    expect(filter.type).toBe('lowpass');
    expect(filter.Q.value).toBe(1.2);
    expect(filter.frequency.changes).toEqual([
      { method: 'setValueAtTime', value: 1200, time: 2 },
      { method: 'exponentialRampToValueAtTime', value: 80, time: 2.5 },
    ]);

    const gainMethods = gain.gain.changes.map((c) => c.method);
    expect(gainMethods).toContain('linearRampToValueAtTime');
    expect(gainMethods.at(-1)).toBe('exponentialRampToValueAtTime');
    expect(Math.max(...gain.gain.changes.map((c) => c.value))).toBeCloseTo(0.8, 6);
    expect(source.startTime).toBe(2);
    expect(source.stopTime).toBeCloseTo(2.5, 9);
    expect(voice.endTime).toBeCloseTo(2.5, 9);
  });

  it('works without a filter', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    synth.noiseVoice({ at: 0, duration: 0.1, level: 0.5 });

    expect(fake.nodesOfKind('biquad')).toHaveLength(0);
    const source = fake.nodesOfKind('bufferSource')[0];
    if (!(source instanceof FakeAudioBufferSourceNode)) throw new Error('no buffer source');
    expect(source.outputs[0]?.kind).toBe('gain');
  });
});

describe('buffers', () => {
  it('caches one buffer per noise kind', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    expect(synth.whiteNoiseBuffer()).toBe(synth.whiteNoiseBuffer());
    expect(synth.polyBuffer('poly4')).toBe(synth.polyBuffer('poly4'));
    expect(synth.polyBuffer('poly4')).not.toBe(synth.polyBuffer('poly17'));
  });

  it('fills poly buffers with one polynomial-counter period of bits', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const poly4 = synth.polyBuffer('poly4');
    expect(poly4.length).toBe(15);
    expect(synth.polyBuffer('poly17').length).toBe(131071);

    const data = poly4.getChannelData(0);
    expect([...new Set(data)].sort()).toEqual([-1, 1]);
    // A maximal-length 4-bit counter visits every state but zero: 8 ones.
    expect([...data].filter((sample) => sample === 1)).toHaveLength(8);
  });

  it('fills the white noise buffer with values inside the sample range', () => {
    const { fake, out } = setup();
    const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);

    const buffer = synth.whiteNoiseBuffer();
    expect(buffer.length).toBe(fake.sampleRate);
    const data = buffer.getChannelData(0);
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
    expect(Math.min(...data)).toBeGreaterThanOrEqual(-1);
    // Deterministic, so a recreation sounds the same every run.
    expect(data[0]).toBe(synth.whiteNoiseBuffer().getChannelData(0)[0]);
  });
});
