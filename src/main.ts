/**
 * Entry point.
 *
 * Until the simulation lands this boots the loop over a static battlefield: the
 * horizon, the mountain range with its crescent moon, and the volcano erupting,
 * seen from a camera that pans slowly so the backdrop's scrolling and the
 * eruption can be checked in a browser.  No gameplay, no input, no audio yet -
 * those arrive with their own tasks and plug into the same loop.
 */

import { TICK_HZ } from './data/constants';
import { createLoop } from './engine/loop';
import { TAU, wrapAngle } from './engine/math';
import type { GameState } from './game/types';
import { createAttractWorld } from './game/world';
import { createRenderer } from './render/renderer';
import { createCanvasDisplay } from './render/vectorDisplay';

/** Seconds for the attract camera to complete one revolution. */
const PAN_SECONDS = 45;

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: no #screen canvas');

const state: GameState = {
  phase: 'attractTitle',
  phaseTicks: 0,
  world: createAttractWorld(),
  highScores: [],
};

const display = createCanvasDisplay(canvas);
const renderer = createRenderer(display);

const loop = createLoop({
  tickHz: TICK_HZ,
  // The loop numbers the ticks, and update(n) produces the state after tick n.
  update: (tick) => {
    state.world.tick = tick + 1;
    state.phaseTicks = tick + 1;
    // A function of the tick rather than an accumulation, so the pan cannot drift.
    state.world.player.heading = wrapAngle((state.world.tick * TAU) / (PAN_SECONDS * TICK_HZ));
  },
  render: (alpha) => renderer.render(state, alpha),
});

loop.start();
