/**
 * The flying saucer: `SAUCMV` (BZONE.MAC.txt:6697-6849).
 *
 * It is the odd one out in every way.  It does not shoot, does not appear on the
 * radar, is not part of the one-unit-at-a-time rule, passes straight through the
 * obstacles and is no collision hazard to anybody - `OBJOBJ` does not even
 * consider it.  All it does is spin 8 heading units a tick and drift on a random
 * velocity that is re-rolled every 0..127 ticks, until somebody shoots it.  An
 * enemy tank can do that too, and then the player scores nothing.
 *
 * `STIMER` gates its arrivals: it will not come at all until the score reaches
 * 2000, and after each one there is a random wait of up to 255 ticks.  When it is
 * hit, `SCOLFG` counts a 32-tick disintegration down at two a tick while the
 * drawn intensity flares and fades; this module keeps the unit on the field for
 * those ticks with `alive` false and `state` "dying", so the renderer has
 * something to fade, and clears it away afterwards.
 *
 * DEVIATION: the visit timer.  The original's saucer never leaves - it wanders
 * until it is destroyed and merely goes quiet when it is out of view - but design
 * spec 5.2 asks for a timeout, so a saucer the player ignores drifts off after
 * `SAUCER_VISIT_TICKS` and reports `saucerLeft`.  Its hover height is an estimate
 * too; nothing in the surviving source records it.
 */

import {
  SAUCER_COURSE_TICKS_MAX,
  SAUCER_HOVER_HEIGHT,
  SAUCER_MIN_SCORE,
  SAUCER_RESPAWN_TICKS_MAX,
  SAUCER_SPAWN_GRANULARITY,
  SAUCER_SPEED_MAX_PER_TICK,
  SAUCER_SPIN_PER_TICK,
  SAUCER_VISIT_TICKS,
  TANGLE_UNIT_RADIANS,
  HEADING_UNITS_PER_TURN,
  WORLD_SIZE,
} from '../../data/constants';
import { wrapAngle } from '../../engine/math';
import { wrapCoordinate } from '../collision';
import type { Enemy, GameEvent, Rng, World } from '../types';
import { enemyBrain, internalState, type EnemyBrain } from '../worldState';

/** One tick of spin: 8 heading units, a revolution every 32 ticks. */
const SPIN_RADIANS = SAUCER_SPIN_PER_TICK * TANGLE_UNIT_RADIANS;

/** A random signed byte per axis, added to the position once a tick. */
function rollCourse(brain: EnemyBrain, rng: Rng): void {
  const axis = (): number => rng.int(2 * SAUCER_SPEED_MAX_PER_TICK) - SAUCER_SPEED_MAX_PER_TICK;
  brain.drift = { x: axis(), z: axis() };
  brain.courseTicks = rng.int(SAUCER_COURSE_TICKS_MAX + 1);
}

/** The saucer on the field, alive or disintegrating, or null. */
function findSaucer(world: World): Enemy | null {
  return world.enemies.find((enemy) => enemy.kind === 'saucer') ?? null;
}

/** Puts one on the field: a random spot on the 256-unit grid, facing anywhere. */
function arrive(world: World, rng: Rng): GameEvent[] {
  const coordinate = (): number =>
    wrapCoordinate(rng.int(WORLD_SIZE / SAUCER_SPAWN_GRANULARITY) * SAUCER_SPAWN_GRANULARITY);
  const state = internalState(world);
  const saucer: Enemy = {
    id: state.nextEnemyId,
    kind: 'saucer',
    pos: { x: coordinate(), z: coordinate() },
    heading: rng.int(HEADING_UNITS_PER_TURN) * TANGLE_UNIT_RADIANS,
    y: SAUCER_HOVER_HEIGHT,
    alive: true,
    state: 'wander',
    timer: SAUCER_VISIT_TICKS,
  };
  state.nextEnemyId += 1;
  world.enemies.push(saucer);
  rollCourse(enemyBrain(saucer), rng);
  return [{ type: 'saucerAppeared' }];
}

/** Takes the saucer off the field and starts the wait for the next one. */
function depart(world: World, saucer: Enemy, rng: Rng): void {
  world.enemies = world.enemies.filter((enemy) => enemy !== saucer);
  internalState(world).saucerTimer = 1 + rng.int(SAUCER_RESPAWN_TICKS_MAX);
}

/** One tick of the saucer's whole life: the wait, the wander and the fade. */
export function updateSaucer(world: World, rng: Rng): GameEvent[] {
  const state = internalState(world);
  const saucer = findSaucer(world);

  if (saucer === null) {
    if (world.score < SAUCER_MIN_SCORE) return [];
    if (state.saucerTimer > 0) {
      state.saucerTimer -= 1;
      return [];
    }
    return arrive(world, rng);
  }

  // Disintegrating: it hangs where it was hit while the flare fades.
  if (!saucer.alive) {
    saucer.timer -= 1;
    if (saucer.timer <= 0) depart(world, saucer, rng);
    return [];
  }

  saucer.heading = wrapAngle(saucer.heading + SPIN_RADIANS);

  const brain = enemyBrain(saucer);
  if (brain.courseTicks <= 0) rollCourse(brain, rng);
  brain.courseTicks -= 1;

  saucer.pos = {
    x: wrapCoordinate(saucer.pos.x + brain.drift.x),
    z: wrapCoordinate(saucer.pos.z + brain.drift.z),
  };

  saucer.timer -= 1;
  if (saucer.timer <= 0) {
    depart(world, saucer, rng);
    return [{ type: 'saucerLeft' }];
  }
  return [];
}
