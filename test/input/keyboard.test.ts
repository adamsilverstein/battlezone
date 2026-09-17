// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createKeyboard } from '../../src/input/keyboard';

const keyboards: { dispose(): void }[] = [];

function keyboardOn(target: EventTarget): ReturnType<typeof createKeyboard> {
  const keyboard = createKeyboard(target);
  keyboards.push(keyboard);
  return keyboard;
}

function down(target: EventTarget, code: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function up(target: EventTarget, code: string): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

afterEach(() => {
  for (const keyboard of keyboards.splice(0)) keyboard.dispose();
});

describe('createKeyboard', () => {
  it('reads neutral before any key is touched', () => {
    const keyboard = keyboardOn(new EventTarget());
    expect(keyboard.read()).toEqual({
      leftTread: 0,
      rightTread: 0,
      fire: false,
      start: false,
      firePressed: false,
      startPressed: false,
    });
  });

  it('holds a tap that begins and ends between two reads', () => {
    // The simulation polls every 64 ms; a tap on fire or on start is shorter than
    // that, and dropping it is the difference between the game starting on the
    // first press and appearing to ignore it.
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'Space');
    up(target, 'Space');
    expect(keyboard.read()).toMatchObject({ fire: true });
    // And only for the one read: the key really is up.
    expect(keyboard.read()).toMatchObject({ fire: false });
  });

  it('holds a tapped start and a tapped tread key too', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'Enter');
    up(target, 'Enter');
    down(target, 'KeyW');
    up(target, 'KeyW');
    expect(keyboard.read()).toMatchObject({ start: true, leftTread: 1 });
    expect(keyboard.read()).toMatchObject({ start: false, leftTread: 0 });
  });

  it('keeps reporting a key that is still down after a tap of the same key', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'Space');
    up(target, 'Space');
    down(target, 'Space');
    expect(keyboard.read()).toMatchObject({ fire: true });
    expect(keyboard.read()).toMatchObject({ fire: true });
  });

  it('maps W and S to the left tread', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'KeyW');
    expect(keyboard.read()).toMatchObject({ leftTread: 1, rightTread: 0 });
    up(target, 'KeyW');
    down(target, 'KeyS');
    expect(keyboard.read()).toMatchObject({ leftTread: -1, rightTread: 0 });
  });

  it('maps the up and down arrows and I and K to the right tread', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    for (const code of ['ArrowUp', 'KeyI']) {
      down(target, code);
      expect(keyboard.read()).toMatchObject({ leftTread: 0, rightTread: 1 });
      up(target, code);
    }
    for (const code of ['ArrowDown', 'KeyK']) {
      down(target, code);
      expect(keyboard.read()).toMatchObject({ leftTread: 0, rightTread: -1 });
      up(target, code);
    }
  });

  it('pivots on the left and right arrows', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'ArrowLeft');
    expect(keyboard.read()).toMatchObject({ leftTread: -1, rightTread: 1 });
    up(target, 'ArrowLeft');
    down(target, 'ArrowRight');
    expect(keyboard.read()).toMatchObject({ leftTread: 1, rightTread: -1 });
  });

  it('maps Space to fire and Enter to start', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'Space');
    down(target, 'Enter');
    expect(keyboard.read()).toMatchObject({ fire: true, start: true });
    up(target, 'Space');
    expect(keyboard.read()).toMatchObject({ fire: false, start: true });
  });

  it('holds keys until they are released', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'KeyW');
    expect(keyboard.read()).toMatchObject({ leftTread: 1 });
    expect(keyboard.read()).toMatchObject({ leftTread: 1 });
    up(target, 'KeyW');
    expect(keyboard.read()).toMatchObject({ leftTread: 0 });
  });

  it('sums opposing and combined keys, clamped to the -1..1 range', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'KeyW');
    down(target, 'KeyS');
    expect(keyboard.read()).toMatchObject({ leftTread: 0 });
    up(target, 'KeyS');
    down(target, 'ArrowRight');
    // Left tread gets +1 from W and +1 from the pivot but never exceeds +1.
    expect(keyboard.read()).toMatchObject({ leftTread: 1, rightTread: -1 });
  });

  it('ignores keys it does not map', () => {
    const target = new EventTarget();
    const keyboard = keyboardOn(target);
    down(target, 'KeyQ');
    expect(keyboard.read()).toEqual({
      leftTread: 0,
      rightTread: 0,
      fire: false,
      start: false,
      firePressed: false,
      startPressed: false,
    });
  });

  it('cancels a mapped key so the page cannot scroll under the display', () => {
    const target = new EventTarget();
    keyboardOn(target);

    for (const code of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
      const event = new KeyboardEvent('keydown', { code, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented, code).toBe(true);
    }
  });

  it('leaves keys it does not use alone', () => {
    const target = new EventTarget();
    keyboardOn(target);
    const event = new KeyboardEvent('keydown', { code: 'F5', cancelable: true });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('stops listening and reads neutral after dispose', () => {
    const target = new EventTarget();
    const keyboard = createKeyboard(target);
    down(target, 'KeyW');
    keyboard.dispose();
    expect(keyboard.read()).toEqual({
      leftTread: 0,
      rightTread: 0,
      fire: false,
      start: false,
      firePressed: false,
      startPressed: false,
    });
    down(target, 'KeyS');
    expect(keyboard.read()).toMatchObject({ leftTread: 0 });
  });
});
