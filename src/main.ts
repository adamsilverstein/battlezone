/**
 * Entry point.
 *
 * Until the simulation lands this boots the loop over a static battlefield: the
 * horizon, the mountain range with its crescent moon, and the volcano erupting,
 * seen from a camera that pans slowly so the backdrop's scrolling and the
 * eruption can be checked in a browser.  No gameplay, no input, no audio yet -
 * those arrive with their own tasks and plug into the same loop.
 *
 * `placeholderWorld` below is boot data, not gameplay: on top of the real
 * battlefield it hand-places one tank, two more obstacles, a shell and some
 * debris so the objects and the HUD can be seen in a browser.  Task 8 replaces
 * it with the real game state machine.
 */

import {
  MESSAGE_FLASH_MASK,
  RADAR_SWEEP_PER_TICK,
  TANGLE_UNIT_RADIANS,
  TICK_HZ,
} from './data/constants';
import { createLoop } from './engine/loop';
import { TAU, wrapAngle } from './engine/math';
import type { GameState, World } from './game/types';
import { createAttractWorld } from './game/world';
import { createRenderer } from './render/renderer';
import { createCanvasDisplay } from './render/vectorDisplay';

/** Seconds for the attract camera to complete one revolution. */
const PAN_SECONDS = 45;

/** PLACEHOLDER boot data: a scene to look at until the simulation lands. */
function placeholderWorld(): World {
  const world = createAttractWorld();
  const still = { x: 0, y: 0, z: 0 };
  const tank = { pos: { x: 600, z: 7000 }, heading: 3, y: 0, alive: true };
  world.enemies = [{ id: 1, kind: 'tank', state: 'chase', timer: 0, ...tank }];
  world.obstacles = [
    ...world.obstacles,
    { kind: 'pyramid', pos: { x: -4000, z: 9000 }, heading: 0, radius: 832 },
    { kind: 'box', pos: { x: 4200, z: 11000 }, heading: 0.7, radius: 832 },
  ];
  world.shells = [
    { id: 2, owner: 'player', pos: { x: -200, z: 3000 }, y: 300, heading: 0, ticksLeft: 20 },
  ];
  world.debris = [1, 2, 3].map((n) => ({
    model: `debrisPiece${n}`,
    pos: { x: -1800 + n * 300, z: 6000 },
    y: 400 * n,
    rot: { ...still, y: n },
    vel: still,
    spin: still,
    ticksLeft: 30,
  }));
  world.score = 3000;
  world.lives = 3;
  return world;
}

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('main: no #screen canvas');

const state: GameState = {
  phase: 'playing',
  phaseTicks: 0,
  world: placeholderWorld(),
  highScores: [{ initials: 'ADS', score: 25000 }],
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
    state.world.radarAngle = wrapAngle(
      state.world.tick * RADAR_SWEEP_PER_TICK * TANGLE_UNIT_RADIANS,
    );
    state.world.enemyInRange = true;
    state.world.targetInSights = (state.world.tick & MESSAGE_FLASH_MASK) === 0;
  },
  render: (alpha) => renderer.render(state, alpha),
});

loop.start();
