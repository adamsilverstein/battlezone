/**
 * Entry point: the only module that touches the page.
 *
 * Everything else is pure - the simulation takes an `InputState` and an `Rng`, the
 * renderer takes a `VectorDisplay`, the audio system takes an `AudioContext`
 * factory and the high score table takes a `Storage`.  This file supplies all four
 * and runs them from the fixed-step loop: `update` polls the controls and advances
 * the game one 15.625 Hz tick, `render` draws the interpolated frame.
 *
 * WHAT THE ORIGINAL DID AT THESE SEAMS
 * ------------------------------------
 * * All audio, POKEY included, is hard-muted while a game is not being played
 *   (docs/reference/original-game.md section 4), which is `setMuted` on every
 *   attract phase.
 * * The cabinet kept its high scores in battery-backed RAM.  Here they are loaded
 *   from `localStorage` at boot and written back whenever the table changes, which
 *   is only ever at the end of an entry.  Reaching for `localStorage` at all can
 *   throw - blocked site data, a sandboxed iframe - so the game falls back to a
 *   table that lives as long as the page rather than refusing to boot.
 * * Browsers will not start an `AudioContext` until the user has done something, so
 *   a key or a click unlocks it; the ROM had no such problem.  A gesture can be
 *   refused, so the listeners stay on until the context actually reports running.
 * * The cabinet read its switches at leisure; a browser hands keys over as events
 *   and pads only when asked.  Both are sampled per frame and latched, so a tap
 *   shorter than the 64 ms tick still reaches the game.
 */

import { createAudioSystem } from './audio';
import { TICK_HZ } from './data/constants';
import { createLoop } from './engine/loop';
import { createRng } from './engine/rng';
import { createGame, isAttractPhase } from './game/game';
import {
  HIGH_SCORES_STORAGE_KEY,
  loadHighScores,
  saveHighScores,
  type HighScoreStorage,
} from './game/highScores';
import type { HighScoreEntry } from './game/types';
import { createInput } from './input/input';
import { createKeyboard } from './input/keyboard';
import { createRenderer } from './render/renderer';
import { createCanvasDisplay } from './render/vectorDisplay';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: no #screen canvas');

const display = createCanvasDisplay(canvas);
const renderer = createRenderer(display);

const keyboard = createKeyboard(window);
const input = createInput({
  // Re-read every poll, so a pad plugged in mid-game just starts working.
  getGamepads: () => navigator.getGamepads(),
  keyboard,
});

const audio = createAudioSystem();

/**
 * Web Audio stays suspended until the player has touched something, and a given
 * gesture can still be refused, so a first key or click is what starts the sound.
 *
 * The listeners then stay on for the life of the page rather than coming off at
 * the first success, because a browser can take the sound away again at any
 * point - an output device unplugged or switched, an audio service that dies -
 * and the way back is another gesture. Taking the listeners off once meant the
 * game fell silent for the rest of the session the first time that happened.
 * The audio system bounds the retries, so a machine with no working device is
 * not asked over and over.
 */
function unlockAudio(): void {
  void audio.unlock();
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

/** A table that lives as long as the page, for when the browser has no store to give. */
function memoryStorage(): HighScoreStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

/**
 * `localStorage` throws on access - not just on use - when site data is blocked or
 * the page is in a sandboxed iframe, so even naming it has to be guarded.
 *
 * The probe only reads.  A store that is full, or over quota, still hands back a
 * perfectly good saved table, and falling back to memory over a refused *write*
 * would throw that table away and show the player the factory scores instead;
 * `saveHighScores` already swallows a write that will not go through.
 */
function openStorage(): HighScoreStorage {
  try {
    const store = window.localStorage;
    store.getItem(HIGH_SCORES_STORAGE_KEY);
    return store;
  } catch {
    return memoryStorage();
  }
}

const storage = openStorage();
let savedScores: HighScoreEntry[] = loadHighScores(storage);

/** The mute the audio system was last told about. */
let wasMuted = false;

const game = createGame({
  // The one place a seed may come from the clock: nothing downstream may.
  rng: createRng(Date.now() >>> 0),
  highScores: savedScores,
});

const loop = createLoop({
  tickHz: TICK_HZ,
  update: () => {
    const events = game.update(input.poll());

    // The original mutes everything, POKEY included, outside a game.  Only a
    // change is worth reporting: a repeated mute would restart the fade every tick.
    const muted = isAttractPhase(game.state.phase);
    if (muted !== wasMuted) {
      wasMuted = muted;
      audio.setMuted(muted);
    }
    for (const event of events) audio.handle(event);
    audio.update(game.audioSnapshot());

    // `insertHighScore` returns a new table, so identity is the change flag.
    if (game.state.highScores !== savedScores) {
      savedScores = game.state.highScores;
      saveHighScores(storage, savedScores);
    }
  },
  render: (alpha) => {
    // The Gamepad API has no button events, so the pads are looked at once a
    // frame and any press is latched for the next poll; a tap on fire is far
    // shorter than the 64 ms between polls.
    input.sample();
    renderer.render(game.state, alpha);
  },
});

loop.start();

// A read-only window onto the state machine for the browser smoke test, in
// development and test builds only: which display the game is on, and whether the
// simulation is still running.  Nothing here can change the game, and the
// production bundle has none of it.
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  Object.defineProperty(window, '__battlezone', {
    value: {
      get phase() {
        return game.state.phase;
      },
      get tick() {
        return game.state.world.tick;
      },
    },
  });
}
