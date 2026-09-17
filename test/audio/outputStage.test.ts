/**
 * The output stage: the limiter and soft clip that stand where the cabinet's
 * amplifier stood.
 *
 * The numbers these tests pin down come from rendering the system offline in
 * Chrome: an ordinary minute - one tank idling, the odd shot - peaked at 0.67 of
 * full scale, while everything at once peaked at 2.31 and spent a third of its
 * samples past the browser's ceiling. The stage has to leave the first alone and
 * catch the second.
 */

import { describe, expect, it } from 'vitest';
import {
  FakeAudioContext,
  FakeDynamicsCompressorNode,
  FakeGainNode,
  FakeWaveShaperNode,
  asAudioContext,
} from './fakeAudioContext';
import { createAudioSystem, SOFT_CLIP_HEADROOM, softClipCurve } from '../../src/audio/audioSystem';
import { gains, unlocked } from './audioSystemHarness';

function compressor(fake: FakeAudioContext): FakeDynamicsCompressorNode | undefined {
  return fake.nodes.find((n): n is FakeDynamicsCompressorNode => {
    return n instanceof FakeDynamicsCompressorNode;
  });
}

function shaper(fake: FakeAudioContext): FakeWaveShaperNode | undefined {
  return fake.nodes.find((n): n is FakeWaveShaperNode => n instanceof FakeWaveShaperNode);
}

/**
 * A signal through the whole soft clip: scaled down into the shaper's range, read
 * off the curve the way a WaveShaper reads it - clamping anything outside -1..1
 * first, as the spec says - and scaled back up.
 */
function shape(curve: Float32Array, signal: number): number {
  const input = Math.min(1, Math.max(-1, signal / SOFT_CLIP_HEADROOM));
  const position = ((input + 1) / 2) * (curve.length - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, curve.length - 1);
  const t = position - low;
  const shaped = (curve[low] as number) * (1 - t) + (curve[high] as number) * t;
  return shaped * SOFT_CLIP_HEADROOM;
}

describe('the graph', () => {
  it('puts the limiter and the soft clip between the mix and the destination', async () => {
    const { fake } = await unlocked();

    const master = gains(fake)[0];
    const limiter = compressor(fake);
    const clip = shaper(fake);

    expect(master?.outputs).toEqual([limiter]);
    // Into the curve's range, through it, and back out again.
    const into = limiter?.outputs[0] as FakeGainNode | undefined;
    expect(into?.outputs).toEqual([clip]);
    const outOf = clip?.outputs[0] as FakeGainNode | undefined;
    expect(outOf?.outputs).toEqual([fake.destination]);
    expect(into?.gain.value).toBeCloseTo(1 / SOFT_CLIP_HEADROOM, 10);
    expect((into?.gain.value as number) * (outOf?.gain.value as number)).toBeCloseTo(1, 10);
  });

  it('gives the curve room to bend an overshoot the limiter let through', () => {
    // A WaveShaper clamps its input to -1..1 before it reads the curve, so a
    // curve drawn straight over that range cannot see an overshoot at all: the
    // leading edge of a stacked explosion would land on the last point and come
    // out as the flat top this stage exists to avoid.
    const curve = softClipCurve();
    const overshoot = 1.8;
    const bent = shape(curve, overshoot);
    expect(bent).toBeLessThan(1);
    expect(bent).toBeGreaterThan(shape(curve, 1));
    expect(bent).toBeLessThan(shape(curve, overshoot + 0.5));
  });

  it('sets a limiter that catches an explosion but does not pump on the engine', async () => {
    const { fake } = await unlocked();
    const limiter = compressor(fake);

    // Under the threshold the ordinary game passes through; over it the stack of
    // voices is held back.
    expect(limiter?.threshold.value).toBeLessThan(0);
    expect(limiter?.threshold.value).toBeGreaterThan(-12);
    expect(limiter?.ratio.value).toBeGreaterThan(1);
    // Fast enough for the attack of a shot, slow enough that the idling engine
    // is not audibly ducked by every one.
    expect(limiter?.attack.value).toBeLessThanOrEqual(0.005);
    expect(limiter?.release.value).toBeGreaterThanOrEqual(0.1);
  });

  it('shapes at 4x so the bend does not alias back down the spectrum', async () => {
    const { fake } = await unlocked();
    expect(shaper(fake)?.oversample).toBe('4x');
    expect(shaper(fake)?.curve).toBeInstanceOf(Float32Array);
  });

  it('still reaches the destination on a context with neither node', async () => {
    // An older browser, or a stripped test double: sound matters more than the
    // stage does.
    const bare = new FakeAudioContext();
    bare.createDynamicsCompressor = (): never => {
      throw new Error('no compressor here');
    };
    bare.createWaveShaper = (): never => {
      throw new Error('no shaper here');
    };
    const audio = createAudioSystem(() => asAudioContext(bare));

    await expect(audio.unlock()).resolves.toBe(true);
    expect(gains(bare)[0]?.outputs).toEqual([bare.destination]);
  });
});

describe('the soft clip curve', () => {
  const curve = softClipCurve();

  it('leaves an ordinary mix exactly as it found it', () => {
    // The quiet game's peak, and everything under it.
    for (const x of [0, 0.1, -0.25, 0.5, -0.67]) {
      expect(shape(curve, x)).toBeCloseTo(x, 3);
    }
  });

  it('bends what is over the knee towards the ceiling, and never past it', () => {
    for (const x of [0.75, 0.9, 1, 1.8, 3.5, -0.85, -1, -2.4]) {
      const y = shape(curve, x);
      expect(Math.abs(y)).toBeLessThan(1);
      expect(Math.abs(y)).toBeLessThan(Math.abs(x));
    }
  });

  it('never turns back on itself, so the bend adds no fold-back', () => {
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i] as number).toBeGreaterThanOrEqual(curve[i - 1] as number);
    }
    // And it is still rising over everything the mix can actually reach; only
    // the far tail, well past twice full scale, flattens onto the ceiling.
    const indexFor = (signal: number): number =>
      Math.round((curve.length - 1) * ((signal / SOFT_CLIP_HEADROOM + 1) / 2));
    for (let i = indexFor(-2) + 1; i <= indexFor(2); i += 1) {
      expect(curve[i] as number).toBeGreaterThan(curve[i - 1] as number);
    }
  });

  it('joins the straight part at the same slope, so the knee itself is silent', () => {
    const step = 0.002;
    const before = (shape(curve, 0.69) - shape(curve, 0.69 - step)) / step;
    const after = (shape(curve, 0.71 + step) - shape(curve, 0.71)) / step;
    expect(before).toBeCloseTo(1, 1);
    expect(after).toBeCloseTo(1, 1);
  });

  it('is odd, so it adds no even harmonics and no offset', () => {
    for (const x of [0.2, 0.55, 0.8, 0.95]) {
      expect(shape(curve, -x)).toBeCloseTo(-shape(curve, x), 5);
    }
  });
});
