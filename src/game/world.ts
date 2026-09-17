/**
 * The world: entity lists and the systems that advance them one tick.
 *
 * `updateWorld` is one pass of the original's `MAIN`: the player, then the shells,
 * then the enemy, then the radar and the range flags.  (`MAIN` actually draws
 * first and runs its logic last, in the order shells, enemy, player - the order
 * here is the design spec's, and the only visible difference is that a shell
 * moves on the tick it is fired.)
 *
 * The enemy is task 6's, and the game state machine task 7's, so neither is
 * hard-wired here: they push onto `systems`, which `updateWorld` runs in order.
 *
 * Nothing in this module touches `Math.random`, `Date` or the DOM - the only
 * source of chance is the `Rng` handed in, so a game replays exactly from its seed
 * and its inputs.
 */

import {
  DEFAULT_OPTIONS,
  ENEMY_IN_RANGE_UNITS,
  RADAR_SWEEP_PER_TICK,
  RETICLE_LOCK_HEADING,
  TANGLE_UNIT_RADIANS,
} from '../data/constants';
import { wrapAngle } from '../engine/math';
import { createRng } from '../engine/rng';
import type { InputState } from '../input/types';
import { bearingTo, octagonalDistance } from './collision';
import { placeObstacles } from './obstacles';
import { PLAYER_START, updatePlayer } from './player';
import { firePlayerShell, updateShells } from './shells';
import type { Enemy, GameEvent, Rng, World } from './types';

/** How far the radar sweep line advances each tick: `$0B` heading units. */
const RADAR_SWEEP_RADIANS = RADAR_SWEEP_PER_TICK * TANGLE_UNIT_RADIANS;

/** How near dead ahead an enemy has to be for the reticle to flare open. */
const RETICLE_LOCK_RADIANS = RETICLE_LOCK_HEADING * TANGLE_UNIT_RADIANS;

/**
 * Per-tick systems, run in registration order after the player and the shells.
 * Task 6 registers the enemy here and task 7 the saucer and the difficulty ramp,
 * so neither has to edit this file.  The list is module-wide, registered once at
 * start-up; a test that pushes onto it has to empty it again afterwards.
 */
export const systems: Array<(world: World, input: InputState, rng: Rng) => GameEvent[]> = [];

/** A new battlefield: the fixed obstacle layout, and the player at the start. */
export function createWorld(rng: Rng, opts?: { lives?: number }): World {
  return {
    tick: 0,
    player: {
      pos: { ...PLAYER_START },
      heading: 0,
      moving: false,
      turning: false,
      alive: true,
    },
    enemies: [],
    shells: [],
    obstacles: placeObstacles(rng),
    debris: [],
    radarAngle: 0,
    enemyInRange: false,
    targetInSights: false,
    score: 0,
    lives: opts?.lives ?? DEFAULT_OPTIONS.lives,
    nextBonusAt: DEFAULT_OPTIONS.bonusThreshold,
  };
}

/**
 * The battlefield with the obstacles up but nobody on it, for the boot code and
 * the attract screens.  Enemies only ever arrive through `systems`, so this is
 * `createWorld` on a fixed seed - the obstacle layout is a ROM table and does not
 * depend on the seed anyway.
 */
export function createAttractWorld(): World {
  return createWorld(createRng(0));
}

/** The nearest living enemy, which is the one the HUD talks about. */
function nearestEnemy(world: World): { enemy: Enemy; distance: number } | null {
  let best: { enemy: Enemy; distance: number } | null = null;
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    const distance = octagonalDistance(world.player.pos, enemy.pos);
    if (!best || distance < best.distance) best = { enemy, distance };
  }
  return best;
}

/**
 * "ENEMY IN RANGE" and the reticle lock.  Both are the same test the ROM makes:
 * in range while the octagonal distance is under `$8000`, and locked while the
 * bearing is within `RETICLE_LOCK_HEADING` heading units of the view direction
 * (BZONE.MAC.txt:971-1019, 7857-7885).  The alert is announced on its rising edge
 * only; it goes quiet without comment.
 */
function updateRangeFlags(world: World): GameEvent[] {
  const target = nearestEnemy(world);
  const inRange = target !== null && target.distance < ENEMY_IN_RANGE_UNITS;
  const rising = inRange && !world.enemyInRange;

  world.enemyInRange = inRange;
  world.targetInSights =
    target !== null &&
    Math.abs(wrapAngle(bearingTo(world.player.pos, target.enemy.pos) - world.player.heading)) <
      RETICLE_LOCK_RADIANS;

  return rising ? [{ type: 'enemyInRange' }] : [];
}

/** Advances the world one game tick and returns everything that happened. */
export function updateWorld(world: World, input: InputState, rng: Rng): GameEvent[] {
  world.tick += 1;

  const events: GameEvent[] = [];
  events.push(...updatePlayer(world, input));
  // Holding the trigger re-fires the moment the cannon reloads; there is no
  // separate reload timer, only the one-shell-in-flight rule.
  if (input.fire) events.push(...firePlayerShell(world));
  events.push(...updateShells(world));
  for (const system of systems) events.push(...system(world, input, rng));

  world.radarAngle = wrapAngle(world.radarAngle + RADAR_SWEEP_RADIANS);
  events.push(...updateRangeFlags(world));

  return events;
}
