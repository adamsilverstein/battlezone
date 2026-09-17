import { describe, expect, it } from 'vitest';
import { DEAD_ZONE, readGamepad } from '../../src/input/gamepad';
import { fakePad, pressed } from './fake-pad';

describe('readGamepad', () => {
  it('returns null when there is no connected pad', () => {
    expect(readGamepad([])).toBeNull();
    expect(readGamepad([null, null])).toBeNull();
    expect(readGamepad([fakePad({ connected: false })])).toBeNull();
  });

  it('maps axis 1 to the left tread and axis 3 to the right tread, inverting Y', () => {
    const raw = readGamepad([fakePad({ axes: [0, -1, 0, 1] })]);
    expect(raw).toEqual({
      leftTread: 1,
      rightTread: -1,
      fire: false,
      start: false,
      firePressed: false,
      startPressed: false,
    });
  });

  it('keeps stick values analogue so quantisation stays a separate step', () => {
    const raw = readGamepad([fakePad({ axes: [0, -0.5, 0, 0.25] })]);
    expect(raw?.leftTread).toBeCloseTo(0.5);
    expect(raw?.rightTread).toBeCloseTo(-0.25);
  });

  it('maps buttons 0 and 7 to fire and button 9 to start', () => {
    expect(readGamepad([fakePad({ buttons: pressed(0) })])?.fire).toBe(true);
    expect(readGamepad([fakePad({ buttons: pressed(7) })])?.fire).toBe(true);
    expect(readGamepad([fakePad({ buttons: pressed(9) })])?.start).toBe(true);
  });

  it('treats a part-pressed analogue trigger below half travel as released', () => {
    const half = pressed();
    half[7] = 0.4;
    expect(readGamepad([fakePad({ buttons: half })])?.fire).toBe(false);
  });

  it('maps the d-pad to tread pairs', () => {
    expect(readGamepad([fakePad({ buttons: pressed(12) })])).toMatchObject({
      leftTread: 1,
      rightTread: 1,
    });
    expect(readGamepad([fakePad({ buttons: pressed(13) })])).toMatchObject({
      leftTread: -1,
      rightTread: -1,
    });
    expect(readGamepad([fakePad({ buttons: pressed(14) })])).toMatchObject({
      leftTread: -1,
      rightTread: 1,
    });
    expect(readGamepad([fakePad({ buttons: pressed(15) })])).toMatchObject({
      leftTread: 1,
      rightTread: -1,
    });
  });

  it('sums stick and d-pad contributions, clamped to the -1..1 range', () => {
    const raw = readGamepad([fakePad({ axes: [0, -1, 0, 1], buttons: pressed(12) })]);
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
    const active = fakePad({ buttons: pressed(0), index: 2 });
    const alsoActive = fakePad({ axes: [0, -1, 0, 0], index: 3 });
    expect(readGamepad([null, idle, active, alsoActive])?.fire).toBe(true);
  });

  it('falls back to the first connected pad when every pad is idle', () => {
    const raw = readGamepad([null, fakePad({ index: 1 }), fakePad({ index: 2 })]);
    expect(raw).toEqual({
      leftTread: 0,
      rightTread: 0,
      fire: false,
      start: false,
      firePressed: false,
      startPressed: false,
    });
  });

  it('honours a caller-supplied dead zone', () => {
    const small = fakePad({ axes: [0, -0.2, 0, 0], index: 0 });
    const large = fakePad({ axes: [0, 0.9, 0, 0], index: 1 });
    // With a wide dead zone the small deflection is drift, so the second pad wins.
    expect(readGamepad([small, large], { deadZone: 0.5 })?.leftTread).toBeCloseTo(-0.9);
    // With a narrow one the first pad already counts as active.
    expect(readGamepad([small, large], { deadZone: 0.1 })?.leftTread).toBeCloseTo(0.2);
  });

  it('prefers a standard layout when both pads are sitting idle', () => {
    // Nothing is being touched on either, so the only thing to go on is which
    // layout the browser could resolve.
    const odd = fakePad({ mapping: '' as GamepadMappingType, axes: [0, 0, 0, 0] });
    const standard = fakePad();
    expect(readGamepad([odd, standard])).toEqual(readGamepad([standard]));
  });

  it('prefers a standard layout when both pads are being used', () => {
    const odd = fakePad({ mapping: '' as GamepadMappingType, axes: [0, -1] });
    const standard = fakePad({ axes: [0, 0, 0, -1] });
    expect(readGamepad([odd, standard])).toEqual(readGamepad([standard]));
  });

  it('reads a non-standard pad rather than ignoring it', () => {
    // A pad the browser cannot map still reports axes and buttons, and being the
    // only one plugged in it is the one in the player's hands. Skipping it would
    // leave that player with no controls at all.
    const odd = fakePad({ mapping: '' as GamepadMappingType, axes: [0, -1], buttons: pressed(0) });
    expect(readGamepad([odd])).toMatchObject({ leftTread: 1, fire: true });
  });

  it('takes the pad in use over an idle one, whatever the layouts are', () => {
    // Which wins when the two rules disagree: the pad being moved, because an
    // untouched pad in another slot is not what the player is holding.
    const idleStandard = fakePad();
    const busyOdd = fakePad({ mapping: '' as GamepadMappingType, buttons: pressed(0) });
    expect(readGamepad([idleStandard, busyOdd])?.fire).toBe(true);
    expect(readGamepad([busyOdd, idleStandard])?.fire).toBe(true);
  });
});
