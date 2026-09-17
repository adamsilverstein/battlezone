/**
 * The one test that runs the shipped bundle in a real browser.
 *
 * Everything else in this repository is a unit test against a fake display, a
 * fake clock and a fake `AudioContext`, which says nothing about whether the page
 * boots, whether the canvas is ever drawn on, or whether a keystroke reaches the
 * simulation.  This does: it loads the built site, checks the attract screen is
 * lit, starts a game with a single Enter, drives for a second and asks for the
 * audio context the first keystroke should have created.
 *
 * Reading the screen: the HUD is drawn in red (`#ff3322`) and the battlefield in
 * green, and the attract high score table has no HUD at all - so "a red pixel
 * exists" is the same statement as "a game's status strip is on screen", without
 * a screenshot comparison to maintain.
 */

import { expect, test, type Page } from '@playwright/test';

/** What `main.ts` publishes in DEV and test builds. */
interface BattlezoneWindow {
  __battlezone?: { phase: string; tick: number };
  /** Counted by the init script below, one per `new AudioContext()`. */
  __audioContexts?: string[];
}

/** Ticks are 64 ms, so a second of game time is a generous wait for a phase change. */
const PHASE_TIMEOUT = 3_000;

/** Ticks in a second of game time, the rate `src/data/constants.ts` runs at. */
const TICK_HZ = 15.625;

/** A pixel counts as lit past this sum of channels, which skips the phosphor's tail. */
const LIT_THRESHOLD = 24;

/**
 * Records every `AudioContext` the page constructs, before any of the page's own
 * script runs.  The state is read at construction time and again when asked, so a
 * context that is still suspended under the autoplay policy - which is what
 * headless Chromium does without a real gesture - still counts as created.
 */
async function watchAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __audioContexts?: string[];
      AudioContext: typeof AudioContext;
    };
    w.__audioContexts = [];
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audioContexts?.push(this.state);
      }
    } as typeof AudioContext;
  });
}

/** Lit and red pixel counts straight off the canvas backing store. */
async function pixels(page: Page): Promise<{ lit: number; red: number }> {
  return page.evaluate((threshold) => {
    const canvas = document.getElementById('screen');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no #screen canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r + g + b > threshold) lit += 1;
      // The HUD's red is the only stroke colour with no green in it.
      if (r > 60 && r > g * 2 && r > b * 2) red += 1;
    }
    return { lit, red };
  }, LIT_THRESHOLD);
}

function hook(page: Page): Promise<{ phase: string; tick: number }> {
  return page.evaluate(() => {
    const w = window as unknown as BattlezoneWindow;
    if (!w.__battlezone) throw new Error('window.__battlezone missing: build with --mode test');
    return { phase: w.__battlezone.phase, tick: w.__battlezone.tick };
  });
}

async function phase(page: Page): Promise<string> {
  return (await hook(page)).phase;
}

/** Every `AudioContext` the page has constructed, in the order it made them. */
function audioContexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as BattlezoneWindow).__audioContexts ?? []);
}

/** Waits for the phase to settle on `wanted`, polling the getter. */
async function expectPhase(page: Page, wanted: string): Promise<void> {
  await expect.poll(async () => phase(page), { timeout: PHASE_TIMEOUT }).toBe(wanted);
}

/**
 * The one console error this suite does not fail on.
 *
 * A browser logs it when the audio device or the WebAudio renderer gives up
 * underneath the page - a headless runner with no output device is a good way to
 * provoke it - and the game answers it by building a fresh context on the next
 * gesture rather than by going quiet. It is a condition the game handles, so it
 * is not a reason to fail the build; that the game keeps playing through it is
 * asserted below either way.
 */
const HANDLED_ERROR = /AudioContext encountered an error/i;

test.describe('the built game', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !HANDLED_ERROR.test(message.text())) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    await watchAudioContexts(page);
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible();
  });

  test('boots into attract, starts on one Enter and plays', async ({ page }) => {
    // The attract cycle opens on the high score table: something is drawn, and
    // none of it is the HUD.
    await expect
      .poll(async () => (await pixels(page)).lit, { timeout: PHASE_TIMEOUT })
      .toBeGreaterThan(0);
    const attract = await pixels(page);
    expect(attract.red).toBe(0);
    expect(await phase(page)).toMatch(/^attract/);
    // Nothing has been touched yet, so the autoplay policy should have kept the
    // game from reaching for an audio context at all.
    expect(await audioContexts(page)).toEqual([]);

    // One press, not two: a tap that lands entirely between two 64 ms polls has
    // to survive to the next one (regression, see input/keyboard.ts).
    await page.keyboard.press('Enter');
    await expectPhase(page, 'playing');
    // And the status strip the player looks at is really on screen.
    await expect
      .poll(async () => (await pixels(page)).red, { timeout: PHASE_TIMEOUT })
      .toBeGreaterThan(0);

    // A gesture has happened, so the audio system should have its context by now;
    // headless Chromium may leave it suspended, which is still "created".
    const contexts = await audioContexts(page);
    expect(contexts.length).toBeGreaterThan(0);
    expect(['running', 'suspended']).toContain(contexts[0]);

    // Drive forward for a second of game time: both treads ahead, waiting on the
    // simulation's own tick counter rather than on the wall clock.
    const from = (await hook(page)).tick;
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    await expect
      .poll(async () => (await hook(page)).tick, { timeout: PHASE_TIMEOUT })
      .toBeGreaterThanOrEqual(from + TICK_HZ);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ArrowUp');

    expect(await phase(page)).toBe('playing');
    expect((await pixels(page)).lit).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
