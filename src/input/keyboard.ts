/**
 * Keyboard fallback for the cabinet's two tread sticks, per the controls table:
 * W/S drive the left tread, the up/down arrows (or I/K) the right tread, the
 * left/right arrows pivot both, Space fires and Enter starts.
 */
import { clampTread, type RawInput } from './gamepad';

/** Tread contribution of each mapped key, summed so combinations behave predictably. */
const TREAD_KEYS: Readonly<Record<string, { leftTread: number; rightTread: number }>> = {
  KeyW: { leftTread: 1, rightTread: 0 },
  KeyS: { leftTread: -1, rightTread: 0 },
  ArrowUp: { leftTread: 0, rightTread: 1 },
  ArrowDown: { leftTread: 0, rightTread: -1 },
  KeyI: { leftTread: 0, rightTread: 1 },
  KeyK: { leftTread: 0, rightTread: -1 },
  ArrowLeft: { leftTread: -1, rightTread: 1 },
  ArrowRight: { leftTread: 1, rightTread: -1 },
};

const FIRE_KEY = 'Space';
const START_KEY = 'Enter';

function isMapped(code: string): boolean {
  return code in TREAD_KEYS || code === FIRE_KEY || code === START_KEY;
}

/**
 * Tracks held keys on the given target (normally `window`) and reports them as
 * a `RawInput`. Held state, not events, is what the simulation needs, so the
 * listeners only maintain a set and `read()` stays a plain lookup.
 *
 * A mapped key's default action is cancelled: Space and the arrows would otherwise
 * scroll the page out from under the display.
 */
export function createKeyboard(target: EventTarget): { read(): RawInput; dispose(): void } {
  const heldCodes = new Set<string>();

  const onKeyDown = (event: Event): void => {
    const { code } = event as KeyboardEvent;
    if (!isMapped(code)) return;
    heldCodes.add(code);
    // Space and the arrows scroll the page and Enter can activate whatever has
    // focus; the cabinet's controls do none of that, so the key stops here.
    event.preventDefault();
  };
  const onKeyUp = (event: Event): void => {
    heldCodes.delete((event as KeyboardEvent).code);
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return {
    read(): RawInput {
      let leftTread = 0;
      let rightTread = 0;
      for (const code of heldCodes) {
        const tread = TREAD_KEYS[code];
        if (tread === undefined) continue;
        leftTread += tread.leftTread;
        rightTread += tread.rightTread;
      }
      return {
        leftTread: clampTread(leftTread),
        rightTread: clampTread(rightTread),
        fire: heldCodes.has(FIRE_KEY),
        start: heldCodes.has(START_KEY),
      };
    },
    dispose(): void {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      heldCodes.clear();
    },
  };
}
