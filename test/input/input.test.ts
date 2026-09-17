import { describe, expect, it } from 'vitest';
import { DEAD_ZONE, type RawInput } from '../../src/input/gamepad';
import { createInput, quantiseTread } from '../../src/input/input';
import { fakePad, pressed } from './fake-pad';

const NEUTRAL_RAW: RawInput = {
  leftTread: 0,
  rightTread: 0,
  fire: false,
  start: false,
  firePressed: false,
  startPressed: false,
};

/** A keyboard stand-in whose reading the test controls. */
function fakeKeyboard(initial: RawInput = NEUTRAL_RAW): {
  read(): RawInput;
  set(next: Partial<RawInput>): void;
} {
  let current = initial;
  return {
    read: () => current,
    set: (next) => {
      current = { ...current, ...next };
    },
  };
}

describe('quantiseTread', () => {
  it("snaps to the cabinet's three digital positions", () => {
    expect(quantiseTread(1, DEAD_ZONE)).toBe(1);
    expect(quantiseTread(0.5, DEAD_ZONE)).toBe(1);
    expect(quantiseTread(-1, DEAD_ZONE)).toBe(-1);
    expect(quantiseTread(-0.5, DEAD_ZONE)).toBe(-1);
    expect(quantiseTread(0, DEAD_ZONE)).toBe(0);
  });

  it('treats travel inside the dead zone as neutral', () => {
    expect(quantiseTread(DEAD_ZONE, 0.3)).toBe(0);
    expect(quantiseTread(-DEAD_ZONE, 0.3)).toBe(0);
    expect(quantiseTread(0.31, 0.3)).toBe(1);
    expect(quantiseTread(-0.31, 0.3)).toBe(-1);
  });

  it('honours the given dead zone', () => {
    expect(quantiseTread(0.5, 0.9)).toBe(0);
    expect(quantiseTread(0.5, 0.1)).toBe(1);
  });
});

describe('createInput', () => {
  it('reports a press for a pad button tapped between two polls', () => {
    // The Gamepad API has no events, so the tap only exists in the frames
    // between polls: `sample` is what sees it, and the latch carries it over.
    let pads: Gamepad[] = [fakePad()];
    const input = createInput({ getGamepads: () => pads, keyboard: fakeKeyboard() });

    expect(input.poll()).toMatchObject({ fire: false, firePressed: false });

    // Down and up again, both inside one 64 ms tick.
    pads = [fakePad({ buttons: pressed(0) })];
    input.sample();
    pads = [fakePad()];
    input.sample();

    expect(input.poll()).toMatchObject({ fire: true, firePressed: true });
    expect(input.poll()).toMatchObject({ fire: false, firePressed: false });
  });

  it('reports a start press for a pad tapped between two polls', () => {
    let pads: Gamepad[] = [fakePad()];
    const input = createInput({ getGamepads: () => pads, keyboard: fakeKeyboard() });
    input.poll();

    pads = [fakePad({ buttons: pressed(9) })];
    input.sample();
    pads = [fakePad()];
    input.sample();

    // `InputState` carries no held start, only the edge the game flow uses.
    expect(input.poll()).toMatchObject({ startPressed: true, anyActivity: true });
    expect(input.poll()).toMatchObject({ startPressed: false, anyActivity: false });
  });

  it('gives a held pad button exactly one press, however often it is sampled', () => {
    const pads = [fakePad({ buttons: pressed(0) })];
    const input = createInput({ getGamepads: () => pads, keyboard: fakeKeyboard() });

    expect(input.poll()).toMatchObject({ fire: true, firePressed: true });
    for (let frame = 0; frame < 4; frame += 1) input.sample();
    expect(input.poll()).toMatchObject({ fire: true, firePressed: false });
  });

  it('reports a press for a key tapped between two polls', () => {
    // The keyboard latches a tap until the next read, so a down and an up inside
    // one tick still arrive as a held frame, and the edge fires exactly once.
    let tapped = false;
    const keyboard = {
      read: (): RawInput => {
        const raw = { ...NEUTRAL_RAW, fire: tapped };
        tapped = false;
        return raw;
      },
    };
    const input = createInput({ getGamepads: () => [], keyboard });

    expect(input.poll()).toMatchObject({ fire: false, firePressed: false });
    tapped = true;
    expect(input.poll()).toMatchObject({ fire: true, firePressed: true });
    expect(input.poll()).toMatchObject({ fire: false, firePressed: false });
  });

  it('reads neutral with no pad and an untouched keyboard', () => {
    const input = createInput({ getGamepads: () => [], keyboard: fakeKeyboard() });
    expect(input.poll()).toEqual({
      leftTread: 0,
      rightTread: 0,
      fire: false,
      firePressed: false,
      startPressed: false,
      anyActivity: false,
    });
  });

  it('quantises pad sticks to digital tread positions', () => {
    const input = createInput({
      getGamepads: () => [fakePad({ axes: [0, -0.8, 0, 0.9] })],
      keyboard: fakeKeyboard(),
    });
    expect(input.poll()).toMatchObject({ leftTread: 1, rightTread: -1, anyActivity: true });
  });

  it('ignores stick drift inside the dead zone', () => {
    const input = createInput({
      getGamepads: () => [fakePad({ axes: [0, -0.2, 0, 0.2] })],
      keyboard: fakeKeyboard(),
    });
    expect(input.poll()).toMatchObject({ leftTread: 0, rightTread: 0, anyActivity: false });
  });

  it('re-reads the pad list each poll so a pad connected later is picked up', () => {
    let pads: (Gamepad | null)[] = [];
    const input = createInput({ getGamepads: () => pads, keyboard: fakeKeyboard() });
    expect(input.poll().leftTread).toBe(0);
    pads = [fakePad({ axes: [0, -1, 0, 0] })];
    expect(input.poll().leftTread).toBe(1);
    pads = [null];
    expect(input.poll().leftTread).toBe(0);
  });

  it('prefers the pad that is being used when several are connected', () => {
    const input = createInput({
      getGamepads: () => [fakePad(), fakePad({ axes: [0, 0, 0, -1] })],
      keyboard: fakeKeyboard(),
    });
    expect(input.poll()).toMatchObject({ leftTread: 0, rightTread: 1 });
  });

  it('merges keyboard and pad input so either source works', () => {
    const keyboard = fakeKeyboard();
    const input = createInput({
      getGamepads: () => [fakePad({ axes: [0, -1, 0, 0] })],
      keyboard,
    });
    keyboard.set({ rightTread: 1, fire: true });
    expect(input.poll()).toMatchObject({ leftTread: 1, rightTread: 1, fire: true });
  });

  it('cancels opposing pad and keyboard tread input', () => {
    const keyboard = fakeKeyboard({ ...NEUTRAL_RAW, leftTread: -1 });
    const input = createInput({
      getGamepads: () => [fakePad({ axes: [0, -1, 0, 0] })],
      keyboard,
    });
    expect(input.poll().leftTread).toBe(0);
  });

  it('reports fire as an edge on the tick it is pressed', () => {
    const keyboard = fakeKeyboard();
    const input = createInput({ getGamepads: () => [], keyboard });
    keyboard.set({ fire: true });
    expect(input.poll()).toMatchObject({ fire: true, firePressed: true });
    expect(input.poll()).toMatchObject({ fire: true, firePressed: false });
    keyboard.set({ fire: false });
    expect(input.poll()).toMatchObject({ fire: false, firePressed: false });
    keyboard.set({ fire: true });
    expect(input.poll()).toMatchObject({ fire: true, firePressed: true });
  });

  it('reports start as an edge and never as a held state', () => {
    const keyboard = fakeKeyboard();
    const input = createInput({ getGamepads: () => [], keyboard });
    keyboard.set({ start: true });
    expect(input.poll().startPressed).toBe(true);
    expect(input.poll().startPressed).toBe(false);
    keyboard.set({ start: false });
    expect(input.poll().startPressed).toBe(false);
    keyboard.set({ start: true });
    expect(input.poll().startPressed).toBe(true);
  });

  it('flags any activity, including a held start, to wake attract mode', () => {
    const keyboard = fakeKeyboard();
    const input = createInput({ getGamepads: () => [], keyboard });
    expect(input.poll().anyActivity).toBe(false);
    keyboard.set({ start: true });
    expect(input.poll().anyActivity).toBe(true);
    expect(input.poll().anyActivity).toBe(true);
    keyboard.set({ start: false, leftTread: -1 });
    expect(input.poll().anyActivity).toBe(true);
  });

  it('returns a fresh snapshot each poll so callers can retain one', () => {
    const keyboard = fakeKeyboard();
    const input = createInput({ getGamepads: () => [], keyboard });
    const first = input.poll();
    keyboard.set({ fire: true });
    expect(input.poll()).not.toBe(first);
    expect(first.fire).toBe(false);
  });
});
