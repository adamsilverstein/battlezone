/**
 * Fixed-timestep game loop.
 *
 * The simulation advances in whole ticks at the original's game-logic rate
 * (`TICK_HZ` = 15.625, the 250 Hz NMI divided by 16), while rendering runs once
 * per animation frame and is handed `alpha`, the fraction of the next tick that
 * has already elapsed, so the renderer can interpolate between the last two
 * simulated states (design spec 4).
 *
 * `raf` and `now` are injectable so tests can drive the loop a frame at a time
 * with a fake clock; nothing here touches the DOM directly.
 */

/**
 * Most ticks one frame may simulate before the loop gives up on catching up.
 * Without a cap, a tab that was backgrounded for a minute would try to run
 * hundreds of ticks in one frame and fall further behind every frame.
 */
export const MAX_CATCHUP_TICKS = 5;

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createLoop(opts: {
  tickHz: number;
  update: (tick: number) => void;
  render: (alpha: number) => void;
  raf?: (cb: (t: number) => void) => number;
  now?: () => number;
}): Loop {
  const { tickHz, update, render } = opts;
  const raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
  const now = opts.now ?? (() => performance.now());
  const tickMs = 1000 / tickHz;

  let running = false;
  let tick = 0;
  let lastTime = 0;
  /** Simulation time owed, in milliseconds. */
  let accumulator = 0;

  const frame = (time: number): void => {
    if (!running) return;
    accumulator += time - lastTime;
    lastTime = time;

    let caught = 0;
    while (accumulator >= tickMs && caught < MAX_CATCHUP_TICKS) {
      update(tick);
      tick += 1;
      accumulator -= tickMs;
      caught += 1;
    }
    // Hit the cap: throw the rest away rather than carry a debt that grows.
    if (accumulator >= tickMs) accumulator = 0;

    render(accumulator / tickMs);
    raf(frame);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTime = now();
      accumulator = 0;
      raf(frame);
    },
    stop(): void {
      running = false;
    },
    get running(): boolean {
      return running;
    },
  };
}
