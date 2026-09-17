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
 *   is only ever at the end of an entry.
 * * Browsers will not start an `AudioContext` until the user has done something, so
 *   the first key or click unlocks it; the ROM had no such problem.
 */

import { createAudioSystem } from './audio';
import { TICK_HZ } from './data/constants';
import { createLoop } from './engine/loop';
import { createRng } from './engine/rng';
import { createGame, isAttractPhase } from './game/game';
import { loadHighScores, saveHighScores } from './game/highScores';
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

/** Web Audio stays suspended until the player has touched something. */
function unlockAudio(): void {
  void audio.unlock();
  window.removeEventListener('keydown', unlockAudio);
  window.removeEventListener('pointerdown', unlockAudio);
}
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

const storage = window.localStorage;
let savedScores: HighScoreEntry[] = loadHighScores(storage);

const game = createGame({
  // The one place a seed may come from the clock: nothing downstream may.
  rng: createRng(Date.now() >>> 0),
  highScores: savedScores,
});

const loop = createLoop({
  tickHz: TICK_HZ,
  update: () => {
    const events = game.update(input.poll());

    // The original mutes everything, POKEY included, outside a game.
    audio.setMuted(isAttractPhase(game.state.phase));
    for (const event of events) audio.handle(event);
    audio.update(game.audioSnapshot());

    // `insertHighScore` returns a new table, so identity is the change flag.
    if (game.state.highScores !== savedScores) {
      savedScores = game.state.highScores;
      saveHighScores(storage, savedScores);
    }
  },
  render: (alpha) => renderer.render(game.state, alpha),
});

loop.start();

// A window onto the phase for the smoke test, in development and test builds only.
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  Object.defineProperty(window, '__battlezone', {
    value: {
      get phase() {
        return game.state.phase;
      },
    },
  });
}
