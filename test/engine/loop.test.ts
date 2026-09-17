import { describe, expect, it } from 'vitest';
import { MAX_CATCHUP_TICKS, createLoop } from '../../src/engine/loop';

/** A fake clock plus a fake rAF that only fires when the test pumps it. */
function harness(tickHz: number) {
  let time = 0;
  const pending: ((t: number) => void)[] = [];
  const ticks: number[] = [];
  const alphas: number[] = [];

  const loop = createLoop({
    tickHz,
    update: (tick) => ticks.push(tick),
    render: (alpha) => alphas.push(alpha),
    raf: (cb) => {
      pending.push(cb);
      return pending.length;
    },
    now: () => time,
  });

  /** Advance the clock by `ms` and deliver one animation frame. */
  const frame = (ms: number) => {
    time += ms;
    const cb = pending.shift();
    if (cb) cb(time);
  };

  return { loop, frame, ticks, alphas, pendingCount: () => pending.length };
}

describe('createLoop', () => {
  it('starts stopped and reports running', () => {
    const { loop } = harness(15.625);
    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });

  it('ticks exactly once per tick period of elapsed time', () => {
    const { loop, frame, ticks } = harness(10); // 100 ms per tick
    loop.start();
    frame(100);
    expect(ticks).toEqual([0]);
    frame(100);
    expect(ticks).toEqual([0, 1]);
    frame(250);
    expect(ticks).toEqual([0, 1, 2, 3]);
  });

  it('does not tick before a whole tick period has passed', () => {
    const { loop, frame, ticks, alphas } = harness(10);
    loop.start();
    frame(40);
    expect(ticks).toEqual([]);
    expect(alphas).toHaveLength(1);
    expect(alphas[0]).toBeCloseTo(0.4, 9);
  });

  it('passes the fraction of the pending tick as alpha in [0, 1)', () => {
    const { loop, frame, alphas } = harness(10);
    loop.start();
    frame(150);
    frame(25);
    expect(alphas[0]).toBeCloseTo(0.5, 9);
    expect(alphas[1]).toBeCloseTo(0.75, 9);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  it('caps catch-up ticks and drops the backlog', () => {
    const { loop, frame, ticks, alphas } = harness(10);
    loop.start();
    frame(100 * (MAX_CATCHUP_TICKS + 20));
    expect(ticks).toHaveLength(MAX_CATCHUP_TICKS);
    expect(alphas[0]).toBe(0);
    // The dropped backlog must not reappear on the next frame.
    frame(100);
    expect(ticks).toHaveLength(MAX_CATCHUP_TICKS + 1);
  });

  it('keeps requesting frames while running and stops afterwards', () => {
    const { loop, frame, pendingCount } = harness(10);
    loop.start();
    expect(pendingCount()).toBe(1);
    frame(100);
    expect(pendingCount()).toBe(1);
    loop.stop();
    frame(100);
    expect(pendingCount()).toBe(0);
  });

  it('ignores a second start', () => {
    const { loop, frame, ticks, pendingCount } = harness(10);
    loop.start();
    loop.start();
    expect(pendingCount()).toBe(1);
    frame(100);
    expect(ticks).toEqual([0]);
  });

  it('does not leave a second chain of frames running after a restart', () => {
    const { loop, frame, alphas, pendingCount } = harness(10);
    loop.start();
    loop.stop();
    loop.start();
    // The request made before the stop is still outstanding alongside the new one.
    expect(pendingCount()).toBe(2);
    frame(10);
    frame(10);
    expect(alphas).toHaveLength(1);
    expect(pendingCount()).toBe(1);
  });

  it('never reports a negative alpha when the clock jumps backwards', () => {
    const { loop, frame, alphas } = harness(10);
    loop.start();
    frame(-50);
    expect(alphas[0]).toBe(0);
  });

  it('does not run up a backlog across a stop and restart', () => {
    const { loop, frame, ticks } = harness(10);
    loop.start();
    frame(100);
    loop.stop();
    frame(5000);
    loop.start();
    frame(100);
    expect(ticks).toEqual([0, 1]);
  });
});
