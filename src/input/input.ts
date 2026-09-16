/**
 * Merges gamepad and keyboard reads into the per-tick `InputState` the
 * simulation consumes: digital tread positions like the cabinet's 2-way sticks,
 * plus the press edges the game flow needs.
 */
import type { InputState } from './types';
import { DEAD_ZONE, readGamepad, type RawInput } from './gamepad';

/**
 * Snaps an analogue tread value to the cabinet's three positions. Travel up to
 * and including `deadZone` is neutral, so a worn or drifting stick sits still.
 */
export function quantiseTread(v: number, deadZone: number): -1 | 0 | 1 {
  if (v > deadZone) return 1;
  if (v < -deadZone) return -1;
  return 0;
}

function clampTread(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

/** Either source can drive the tank, so contributions sum and opposing ones cancel. */
function merge(pad: RawInput | null, keys: RawInput): RawInput {
  if (pad === null) return keys;
  return {
    leftTread: clampTread(pad.leftTread + keys.leftTread),
    rightTread: clampTread(pad.rightTread + keys.rightTread),
    fire: pad.fire || keys.fire,
    start: pad.start || keys.start,
  };
}

/**
 * Creates the per-tick input source. `getGamepads` is injected (normally
 * `() => navigator.getGamepads()`) and re-read on every poll, so pads
 * connecting or disconnecting mid-game need no event handling.
 */
export function createInput(opts: {
  getGamepads: () => readonly (Gamepad | null)[];
  keyboard: { read(): RawInput };
}): { poll(): InputState } {
  let firing = false;
  let starting = false;

  return {
    poll(): InputState {
      const raw = merge(readGamepad(opts.getGamepads()), opts.keyboard.read());
      const leftTread = quantiseTread(raw.leftTread, DEAD_ZONE);
      const rightTread = quantiseTread(raw.rightTread, DEAD_ZONE);

      const firePressed = raw.fire && !firing;
      const startPressed = raw.start && !starting;
      firing = raw.fire;
      starting = raw.start;

      return {
        leftTread,
        rightTread,
        fire: raw.fire,
        firePressed,
        startPressed,
        anyActivity: leftTread !== 0 || rightTread !== 0 || raw.fire || raw.start,
      };
    },
  };
}
