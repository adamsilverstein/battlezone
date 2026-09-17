/**
 * Gamepad API reading, using the "standard" layout so any pad the browser
 * recognises works without configuration.
 *
 * The cabinet had two digital 2-way sticks, one per tread, with a fire button
 * on the right stick. Sticks map to the two thumbsticks' Y axes; the d-pad is
 * a convenience for the cabinet's "both sticks together" moves.
 */

/** Analogue tread values in -1..1, read before quantisation to the cabinet's digital steps. */
export interface RawInput {
  /** Left tread: negative back, positive forward. */
  leftTread: number;
  /** Right tread: negative back, positive forward. */
  rightTread: number;
  /** Fire held. */
  fire: boolean;
  /** Start (1-player) held. */
  start: boolean;
  /**
   * Fire went down since the last read, even if it is already up again.  The
   * game is polled once a tick, every 64 ms, and a tap is shorter than that, so
   * each source latches its own press transitions rather than leaving the tick
   * to notice a button that is no longer held.
   */
  firePressed: boolean;
  /** Start went down since the last read. */
  startPressed: boolean;
}

/** Nothing touched: what a source with no pad and no keys to report reads as. */
export const NEUTRAL_RAW: RawInput = Object.freeze({
  leftTread: 0,
  rightTread: 0,
  fire: false,
  start: false,
  firePressed: false,
  startPressed: false,
});

/** Default stick travel treated as neutral, wide enough to swallow worn-stick drift. */
export const DEAD_ZONE = 0.3;

/** Standard-layout axis indices: left stick Y, right stick Y. Both point down, so they invert. */
const AXIS_LEFT_Y = 1;
const AXIS_RIGHT_Y = 3;

/** Standard-layout button indices. */
const BUTTON_FIRE = [0, 7] as const; // A / Cross, right trigger.
const BUTTON_START = 9;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;

/** Analogue buttons (triggers) count as held past half travel. */
const BUTTON_THRESHOLD = 0.5;

/** Keeps summed tread contributions inside the -1..1 range a stick can report. */
export function clampTread(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function axis(pad: Gamepad, index: number): number {
  return pad.axes[index] ?? 0;
}

function held(pad: Gamepad, index: number): boolean {
  const button = pad.buttons[index];
  if (button === undefined) return false;
  return button.pressed || button.value >= BUTTON_THRESHOLD;
}

/**
 * Composite tread pair from the d-pad: up drives both treads forward, down both
 * back, left and right pivot in place.
 */
function readDpad(pad: Gamepad): { leftTread: number; rightTread: number } {
  let leftTread = 0;
  let rightTread = 0;
  if (held(pad, BUTTON_DPAD_UP)) {
    leftTread += 1;
    rightTread += 1;
  }
  if (held(pad, BUTTON_DPAD_DOWN)) {
    leftTread -= 1;
    rightTread -= 1;
  }
  if (held(pad, BUTTON_DPAD_LEFT)) {
    leftTread -= 1;
    rightTread += 1;
  }
  if (held(pad, BUTTON_DPAD_RIGHT)) {
    leftTread += 1;
    rightTread -= 1;
  }
  return { leftTread, rightTread };
}

/**
 * One pad's current state.  The press flags are false: a single stateless read
 * has no previous state to compare against, so transitions are
 * `createGamepadReader`'s business.
 */
function readPad(pad: Gamepad): RawInput {
  const dpad = readDpad(pad);
  return {
    leftTread: clampTread(-axis(pad, AXIS_LEFT_Y) + dpad.leftTread),
    rightTread: clampTread(-axis(pad, AXIS_RIGHT_Y) + dpad.rightTread),
    fire: BUTTON_FIRE.some((index) => held(pad, index)),
    start: held(pad, BUTTON_START),
    firePressed: false,
    startPressed: false,
  };
}

/** True when the pad is being used, so an idle pad never shadows the one in hand. */
function isActive(raw: RawInput, deadZone: number): boolean {
  return (
    Math.abs(raw.leftTread) > deadZone ||
    Math.abs(raw.rightTread) > deadZone ||
    raw.fire ||
    raw.start
  );
}

/**
 * How much a pad deserves to be the one driving the tank: being used beats
 * sitting idle, and a layout the browser recognises beats one it does not.
 *
 * A pad whose `mapping` is not "standard" still reports axes and buttons - they
 * are simply in whatever order the device sent them - so it is read rather than
 * ignored. Ignoring it would mean a player with an unrecognised pad and nothing
 * else plugged in has no controls at all, which is worse than controls that may
 * be laid out oddly.
 */
function rank(pad: Gamepad, raw: RawInput, deadZone: number): number {
  return (isActive(raw, deadZone) ? 2 : 0) + (pad.mapping === 'standard' ? 1 : 0);
}

/**
 * Reads the connected pad most likely to be in the player's hands: the one being
 * used, preferring the standard layout, and falling back to any connected pad
 * when they are all idle. Pure: hand it `navigator.getGamepads()` output, which
 * returns null slots for disconnected pads. Returns null when no pad is
 * connected, so a pad arriving later is picked up by simply reading again.
 *
 * Tread values stay analogue; `deadZone` only decides which pad is in use.
 */
export function readGamepad(
  pads: readonly (Gamepad | null)[],
  opts: { deadZone?: number } = {},
): RawInput | null {
  const deadZone = opts.deadZone ?? DEAD_ZONE;
  let best: RawInput | null = null;
  let bestRank = -1;
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    const raw = readPad(pad);
    const score = rank(pad, raw, deadZone);
    // Strictly greater, so the first pad wins a tie - the order the browser
    // reports them in is the only tie-break there is.
    if (score > bestRank) {
      best = raw;
      bestRank = score;
    }
  }
  return best;
}

/**
 * The Gamepad API is poll-only: there are no button events, so a tap that begins
 * and ends between two of the simulation's 64 ms polls is invisible to them, in
 * exactly the way a keyboard tap was before `createKeyboard` latched it.
 *
 * This reader closes that gap by being sampled far more often than the game is
 * polled - `main.ts` calls `sample` once per animation frame - and latching every
 * button that goes down until the next `read`.  `read` then reports the tap as one
 * held frame with its press flag set, and clears the latch, so a tap produces
 * exactly one press however many frames it spanned.
 */
export function createGamepadReader(
  getGamepads: () => readonly (Gamepad | null)[],
  opts: { deadZone?: number } = {},
): { sample(): void; read(): RawInput | null } {
  let heldFire = false;
  let heldStart = false;
  let tappedFire = false;
  let tappedStart = false;

  /** Reads the pads and notes any button that has just gone down. */
  function latch(): RawInput | null {
    const raw = readGamepad(getGamepads(), opts);
    const fire = raw?.fire ?? false;
    const start = raw?.start ?? false;
    if (fire && !heldFire) tappedFire = true;
    if (start && !heldStart) tappedStart = true;
    heldFire = fire;
    heldStart = start;
    return raw;
  }

  return {
    sample: () => void latch(),
    read(): RawInput | null {
      const raw = latch();
      // Nothing plugged in and nothing latched: no pad to report at all, which is
      // what lets the keyboard stand alone.
      if (raw === null && !tappedFire && !tappedStart) return null;
      const merged: RawInput = {
        ...(raw ?? NEUTRAL_RAW),
        fire: (raw?.fire ?? false) || tappedFire,
        start: (raw?.start ?? false) || tappedStart,
        firePressed: tappedFire,
        startPressed: tappedStart,
      };
      tappedFire = false;
      tappedStart = false;
      return merged;
    },
  };
}
