import { describe, expect, it } from 'vitest';
import { DEAD_ZONE, readGamepad } from '../../src/input/gamepad';

/** Builds a `Gamepad`-shaped object with the standard layout's 4 axes and 17 buttons. */
function fakePad(
  overrides: { axes?: number[]; buttons?: number[]; connected?: boolean; index?: number } = {},
): Gamepad {
  const axes = [0, 0, 0, 0];
  for (const [i, value] of (overrides.axes ?? []).entries()) axes[i] = value;
  const values = [...Array(17).fill(0)];
  for (const [i, value] of (overrides.buttons ?? []).entries()) values[i] = value;
  return {
    id: 'fake pad',
    index: overrides.index ?? 0,
    connected: overrides.connected ?? true,
    mapping: 'standard',
    timestamp: 0,
    axes,
    buttons: values.map((value: number) => ({ pressed: value >= 0.5, touched: value > 0, value })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('readGamepad', () => {
  it('returns null when there is no connected pad', () => {
    expect(readGamepad([])).toBeNull();
    expect(readGamepad([null, null])).toBeNull();
    expect(readGamepad([fakePad({ connected: false })])).toBeNull();
  });

  it('maps axis 1 to the left tread and axis 3 to the right tread, inverting Y', () => {
    const raw = readGamepad([fakePad({ axes: [0, -1, 0, 1] })]);
    expect(raw).toEqual({ leftTread: 1, rightTread: -1, fire: false, start: false });
  });

  it('keeps stick values analogue so quantisation stays a separate step', () => {
    const raw = readGamepad([fakePad({ axes: [0, -0.5, 0, 0.25] })]);
    expect(raw?.leftTread).toBeCloseTo(0.5);
    expect(raw?.rightTread).toBeCloseTo(-0.25);
  });

  it('maps buttons 0 and 7 to fire and button 9 to start', () => {
    expect(readGamepad([fakePad({ buttons: [1] })])?.fire).toBe(true);
    const trigger = [0, 0, 0, 0, 0, 0, 0, 1];
    expect(readGamepad([fakePad({ buttons: trigger })])?.fire).toBe(true);
    const start = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    expect(readGamepad([fakePad({ buttons: start })])?.start).toBe(true);
  });

  it('treats a part-pressed analogue trigger below half travel as released', () => {
    const half = [0, 0, 0, 0, 0, 0, 0, 0.4];
    expect(readGamepad([fakePad({ buttons: half })])?.fire).toBe(false);
  });

  it('maps the d-pad to tread pairs', () => {
    const dpad = (index: number): number[] => {
      const buttons = Array(17).fill(0);
      buttons[index] = 1;
      return buttons;
    };
    expect(readGamepad([fakePad({ buttons: dpad(12) })])).toMatchObject({
      leftTread: 1,
      rightTread: 1,
    });
    expect(readGamepad([fakePad({ buttons: dpad(13) })])).toMatchObject({
      leftTread: -1,
      rightTread: -1,
    });
    expect(readGamepad([fakePad({ buttons: dpad(14) })])).toMatchObject({
      leftTread: -1,
      rightTread: 1,
    });
    expect(readGamepad([fakePad({ buttons: dpad(15) })])).toMatchObject({
      leftTread: 1,
      rightTread: -1,
    });
  });

  it('sums stick and d-pad contributions, clamped to the -1..1 range', () => {
    const dpadUp = Array(17).fill(0);
    dpadUp[12] = 1;
    const raw = readGamepad([fakePad({ axes: [0, -1, 0, 1], buttons: dpadUp })]);
    // Left stick forward plus d-pad forward stays at +1; right stick back cancels the d-pad.
    expect(raw).toMatchObject({ leftTread: 1, rightTread: 0 });
  });

  it('ignores drift inside the dead zone when choosing a pad', () => {
    const drifting = fakePad({ axes: [0, DEAD_ZONE * 0.5, 0, 0], index: 0 });
    const active = fakePad({ axes: [0, -1, 0, 0], index: 1 });
    expect(readGamepad([drifting, active])?.leftTread).toBe(1);
  });

  it('prefers the first pad with input and ignores null slots', () => {
    const idle = fakePad({ index: 0 });
    const active = fakePad({ buttons: [1], index: 2 });
    const alsoActive = fakePad({ axes: [0, -1, 0, 0], index: 3 });
    expect(readGamepad([null, idle, active, alsoActive])?.fire).toBe(true);
  });

  it('falls back to the first connected pad when every pad is idle', () => {
    const raw = readGamepad([null, fakePad({ index: 1 }), fakePad({ index: 2 })]);
    expect(raw).toEqual({ leftTread: 0, rightTread: 0, fire: false, start: false });
  });

  it('honours a caller-supplied dead zone', () => {
    const small = fakePad({ axes: [0, -0.2, 0, 0], index: 0 });
    const large = fakePad({ axes: [0, 0.9, 0, 0], index: 1 });
    // With a wide dead zone the small deflection is drift, so the second pad wins.
    expect(readGamepad([small, large], { deadZone: 0.5 })?.leftTread).toBeCloseTo(-0.9);
    // With a narrow one the first pad already counts as active.
    expect(readGamepad([small, large], { deadZone: 0.1 })?.leftTread).toBeCloseTo(0.2);
  });
});
