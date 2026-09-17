/**
 * Merges gamepad and keyboard reads into the per-tick `InputState` the
 * simulation consumes: digital tread positions like the cabinet's 2-way sticks,
 * plus the press edges the game flow needs.
 */
import type { InputState } from './types';
import { clampTread, createGamepadReader, DEAD_ZONE, type RawInput } from './gamepad';

/**
 * Snaps an analogue tread value to the cabinet's three positions. Travel up to
 * and including `deadZone` is neutral, so a worn or drifting stick sits still.
 */
export function quantiseTread(v: number, deadZone: number): -1 | 0 | 1 {
  if (v > deadZone) return 1;
  if (v < -deadZone) return -1;
  return 0;
}

/** Either source can drive the tank, so contributions sum and opposing ones cancel. */
function merge(pad: RawInput | null, keys: RawInput): RawInput {
  if (pad === null) return keys;
  return {
    leftTread: clampTread(pad.leftTread + keys.leftTread),
    rightTread: clampTread(pad.rightTread + keys.rightTread),
    fire: pad.fire || keys.fire,
    start: pad.start || keys.start,
    firePressed: pad.firePressed || keys.firePressed,
    startPressed: pad.startPressed || keys.startPressed,
  };
}

/**
 * Creates the per-tick input source. `getGamepads` is injected (normally
 * `() => navigator.getGamepads()`) and re-read on every poll, so pads
 * connecting or disconnecting mid-game need no event handling.
 *
 * `sample` is the frame-rate half of it: the Gamepad API has no events, so the
 * pads are looked at once per animation frame and a button that goes down is
 * latched until the next `poll`. Without it a tap between two 64 ms polls would
 * be lost, which is the bug the keyboard latch fixes on its side.
 */
export function createInput(opts: {
  getGamepads: () => readonly (Gamepad | null)[];
  keyboard: { read(): RawInput };
}): { poll(): InputState; sample(): void } {
  const gamepad = createGamepadReader(opts.getGamepads);
  let firing = false;
  let starting = false;

  return {
    sample: () => gamepad.sample(),

    poll(): InputState {
      const raw = merge(gamepad.read(), opts.keyboard.read());
      const leftTread = quantiseTread(raw.leftTread, DEAD_ZONE);
      const rightTread = quantiseTread(raw.rightTread, DEAD_ZONE);

      // Either the button is newly down this tick, or a source saw it go down
      // and come back up between two ticks and latched the press for us.
      const firePressed = (raw.fire && !firing) || raw.firePressed;
      const startPressed = (raw.start && !starting) || raw.startPressed;
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
