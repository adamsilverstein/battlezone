/**
 * The missile - `R2D3` in the source, the "buzz bomb" to everyone else.  Its own
 * header says it "flies the buzz bomb directly at player, at high speed, swooping
 * in on him.  If another object is encountered, buzz-bomb levitates and restarts
 * swooping" (BZONE.MAC.txt:6303-6325), and `BUZBOM` (BZONE.MAC.txt:6325-6675) is
 * exactly that in five steps, reproduced below in the same order:
 *
 * 1. **levitate.**  Below `TOP` and touching an obstacle, it climbs `$100` and does
 *    nothing else - which is why nothing on the battlefield can hide you from it.
 * 2. **stay in front.**  If its flight heading is within 90 degrees of the
 *    player's own heading it is coming at their back, so the goal is nudged away
 *    until it is not; otherwise the goal steps one or two heading units towards the
 *    true bearing.  A missile never attacks from directly behind.
 * 3. **weave.**  Far out, the flight heading is the goal plus or minus
 *    `FRAME & $1F` - up to 44 degrees - with the sign flipping every 16 ticks.
 * 4. **fly.**  Four times the player's step per tick, about twice their top speed,
 *    and it sinks `$100` a tick until it is on the ground.
 * 5. **ram.**  Inside `$300` of the player both die.
 *
 * `state` is `swoop` while it is driving straight in, `weave` while it is swerving
 * and `hop` while it is levitating.
 *
 * WHEN THE WEAVING STOPS.  The threshold is `MISLVL + $25` in BCD less the score,
 * floored at 8, compared with `TDIST`.  The two reference documents disagree on
 * which side of it weaves: docs/reference/original-game.md says the missile stops
 * swerving *inside* the threshold and that the first missile of the game never
 * swerves at all, while atari-source-notes.md says the swerve starts below it.  The
 * first reading is the self-consistent one - the threshold shrinks towards `$800`
 * as the score rises, which is what makes late missiles "swerve until just before
 * the collision" and early ones fly straight - so that is what this does.
 *
 * DEVIATION.  The obstacle test is skipped once the missile is at or above `TOP`,
 * so it flies over the obstacle it has climbed rather than staying pinned against
 * it; the ROM only describes the on-the-ground case (BZONE.MAC.txt:6597-6619), and
 * without this the missile would hover beside the first box it met forever.
 */

import {
  DEFAULT_OPTIONS,
  ENEMY_IN_RANGE_UNITS,
  ENEMY_MEAN_SCORE,
  MISSILE_APPROACH_CONE_HEADING,
  MISSILE_CLIMB_PER_TICK,
  MISSILE_GOAL_FINE_STEPS,
  MISSILE_GOAL_STEPS,
  MISSILE_LEVITATE_TOP,
  MISSILE_SPEED_MULTIPLIER,
  MISSILE_SWOOP_BCD_BIAS,
  MISSILE_SWOOP_TDIST_MIN,
  MISSILE_WEAVE_MASK,
  MISSILE_WEAVE_SIGN_TICKS,
  MOVE_STEP_UNITS,
  SCORE_UNIT,
  TANGLE_UNIT_RADIANS,
  TANK_MISSILE_RADIUS,
  TDIST_UNIT,
} from '../../data/constants';
import { wrapAngle } from '../../engine/math';
import { bearingTo, missileHitsObstacle, octagonalDistance, wrapCoordinate } from '../collision';
import { spawnExplosion } from '../explosions';
import { bcdAdd, decimalToBcd } from '../score';
import type { Enemy, GameEvent, Rng, World } from '../types';
import { killPlayer } from '../player';
import { ageEnemy, enemyBrain, type EnemyBrain } from '../worldState';

/** The 90-degree cone behind the player the missile refuses to fly out of. */
const APPROACH_CONE_RADIANS = MISSILE_APPROACH_CONE_HEADING * TANGLE_UNIT_RADIANS;

/** One heading unit's worth of goal correction, coarse and fine. */
const GOAL_STEP_RADIANS = MISSILE_GOAL_STEPS * TANGLE_UNIT_RADIANS;
const GOAL_FINE_RADIANS = MISSILE_GOAL_FINE_STEPS * TANGLE_UNIT_RADIANS;

/**
 * How near the missile has to be before it gives up swerving, in world units.
 *
 * Reproduced in the ROM's own mixed arithmetic (BZONE.MAC.txt:6409-6451): `MISLVL`
 * and `$25` are added in decimal mode, so `$10 + $25` is `$35`, and then the
 * score's thousands byte is subtracted in *binary* and the raw result compared
 * against `TDIST`.  `$35` is therefore read as 53, not 35 - the ROM never converts
 * it - so a fresh game's missile drives straight in from 53 * 256 = 13568 units and
 * every 1000 points takes a little off that.  Past 100000, or once the subtraction
 * goes negative, it floors at `MISSILE_SWOOP_TDIST_MIN`.
 *
 * (docs/reference/original-game.md reads this as "the first missile of the game
 * never swerves at all"; on these numbers it swerves for the first third of its
 * run and then drives straight in.  The arithmetic is what the source does.)
 */
export function straightInDistance(world: World): number {
  if (world.score >= ENEMY_MEAN_SCORE) return MISSILE_SWOOP_TDIST_MIN * TDIST_UNIT;

  const level = decimalToBcd(DEFAULT_OPTIONS.missileThreshold / SCORE_UNIT);
  const scoreThousands = decimalToBcd(Math.floor(world.score / SCORE_UNIT));
  const raw = bcdAdd(level, MISSILE_SWOOP_BCD_BIAS) - scoreThousands;

  return Math.max(MISSILE_SWOOP_TDIST_MIN, raw) * TDIST_UNIT;
}

/** Step 2: keep the approach out of the cone behind the player. */
function steerGoal(world: World, enemy: Enemy, brain: EnemyBrain): void {
  const fromBehind = wrapAngle(brain.goal - world.player.heading);
  if (Math.abs(fromBehind) < APPROACH_CONE_RADIANS) {
    // Swing the approach away from the player's own heading, either way will do.
    const away = fromBehind === 0 ? 1 : Math.sign(fromBehind);
    brain.goal = wrapAngle(brain.goal + away * GOAL_STEP_RADIANS);
    return;
  }

  const error = wrapAngle(bearingTo(enemy.pos, world.player.pos) - brain.goal);
  const step = Math.abs(error) > GOAL_STEP_RADIANS ? GOAL_STEP_RADIANS : GOAL_FINE_RADIANS;
  brain.goal = wrapAngle(
    Math.abs(error) <= step ? brain.goal + error : brain.goal + Math.sign(error) * step,
  );
}

/** Step 3: the flight heading, weaving or straight in. */
function flightHeading(world: World, enemy: Enemy, brain: EnemyBrain): number {
  if (octagonalDistance(enemy.pos, world.player.pos) <= straightInDistance(world)) {
    enemy.state = 'swoop';
    return brain.goal;
  }
  enemy.state = 'weave';
  const swerve = (world.tick & MISSILE_WEAVE_MASK) * TANGLE_UNIT_RADIANS;
  const sign = (world.tick & MISSILE_WEAVE_SIGN_TICKS) === 0 ? 1 : -1;
  return wrapAngle(brain.goal + sign * swerve);
}

/** Step 5: the missile and the player destroy each other. */
function ram(world: World, enemy: Enemy, rng: Rng): GameEvent[] {
  enemy.alive = false;
  spawnExplosion(world, enemy, rng);
  // No `enemyDestroyed`: ramming the player scores them nothing.
  return killPlayer(world, 'missile');
}

/** One tick of a missile. */
export function updateMissile(world: World, enemy: Enemy, rng: Rng): GameEvent[] {
  const brain = enemyBrain(enemy);
  ageEnemy(brain);

  // The spawner replaces a missile that has flown away and given up on the player.
  brain.outOfRangeTicks =
    octagonalDistance(enemy.pos, world.player.pos) >= ENEMY_IN_RANGE_UNITS
      ? brain.outOfRangeTicks + 1
      : 0;

  if (enemy.y < MISSILE_LEVITATE_TOP && brain.blocked) {
    enemy.y += MISSILE_CLIMB_PER_TICK;
    enemy.state = 'hop';
    return [];
  }

  steerGoal(world, enemy, brain);
  enemy.heading = flightHeading(world, enemy, brain);

  const before = { ...enemy.pos };
  const distance = MISSILE_SPEED_MULTIPLIER * MOVE_STEP_UNITS;
  enemy.pos = {
    x: wrapCoordinate(before.x + distance * Math.sin(enemy.heading)),
    z: wrapCoordinate(before.z + distance * Math.cos(enemy.heading)),
  };

  const touching = missileHitsObstacle(enemy.pos, world.obstacles);
  if (enemy.y < MISSILE_LEVITATE_TOP) {
    // Low enough to run into it: back the move out and start climbing next tick.
    if (touching) {
      enemy.pos = before;
      brain.blocked = true;
      enemy.state = 'hop';
    } else {
      brain.blocked = false;
      enemy.y = Math.max(0, enemy.y - MISSILE_CLIMB_PER_TICK);
    }
  } else {
    // At `TOP` it is over the obstacle, and it holds that height until it is clear
    // of it - otherwise it would sink straight back into the far side of a wide
    // pyramid and cross it in a series of stutters instead of one hop.
    brain.blocked = false;
    if (touching) enemy.state = 'hop';
    else enemy.y = Math.max(0, enemy.y - MISSILE_CLIMB_PER_TICK);
  }

  if (world.player.alive && octagonalDistance(enemy.pos, world.player.pos) < TANK_MISSILE_RADIUS) {
    return ram(world, enemy, rng);
  }
  return [];
}
