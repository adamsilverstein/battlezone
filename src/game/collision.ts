/**
 * The playfield metric: how far apart two things are, and whether a vehicle has
 * run into an obstacle.
 *
 * THE TORUS
 * ---------
 * The original stores positions as unsigned 16-bit words (`TPOSX`/`TPOSY`), so
 * the battlefield is a `WORLD_SIZE` x `WORLD_SIZE` torus and its subtractions are
 * automatically the shortest way round (docs/reference/atari-source-notes.md,
 * "The playfield").  This module keeps coordinates in the signed half of that
 * range - centred on where the player starts - and `wrapDelta` reproduces the
 * 16-bit subtraction.
 *
 * THE METRIC
 * ----------
 * Every distance in the game comes from the MathBox's `DSTNCE`, which is an
 * octagonal approximation, not a hypotenuse: `max + 3/8 * min` of the two legs
 * (MBUCOD.V05, "DISTANCE ROUTINE GIVEN TWO POINTS"; see
 * `DISTANCE_MINOR_NUMERATOR` in `data/constants.ts`).  It overestimates the
 * diagonal by up to 6%, which is why obstacles feel slightly "cornered" - so
 * range checks, collisions and the radar all use this and never `dist()`.
 */

import {
  DISTANCE_MINOR_DENOMINATOR,
  DISTANCE_MINOR_NUMERATOR,
  ENEMY_IN_RANGE_UNITS,
  MISSILE_OBSTACLE_SCALE,
  RETICLE_LOCK_HEADING,
  SHELL_MISSILE_ANGLE_BIAS,
  SHELL_MISSILE_ANGLE_SHIFT,
  SHELL_SAUCER_RADIUS_QUARTERS,
  SHELL_TANK_ANGLE_SCALE,
  SHELL_TANK_ANGLE_SHIFT,
  SHELL_TANK_RADIUS_BASE,
  TANGLE_UNIT_RADIANS,
  WORLD_SIZE,
} from '../data/constants';
import { wrapAngle } from '../engine/math';
import type { Enemy, Obstacle, Shell, Vec2, World } from './types';

/** Half the playfield: coordinates live in [-WORLD_HALF, WORLD_HALF). */
export const WORLD_HALF = WORLD_SIZE / 2;

/**
 * Folds a coordinate back into the playfield.  The same fold applied to a
 * difference of two coordinates gives the shortest signed separation, which is
 * what the ROM's 16-bit subtraction produces.
 */
export function wrapCoordinate(v: number): number {
  return ((((v + WORLD_HALF) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) - WORLD_HALF;
}

/** The MathBox distance between two positions: `max + 3/8 * min`. */
export function octagonalDistance(a: Vec2, b: Vec2): number {
  const dx = Math.abs(wrapCoordinate(a.x - b.x));
  const dz = Math.abs(wrapCoordinate(a.z - b.z));
  const major = Math.max(dx, dz);
  const minor = Math.min(dx, dz);
  return major + (minor * DISTANCE_MINOR_NUMERATOR) / DISTANCE_MINOR_DENOMINATOR;
}

/**
 * The bearing from one position to another, in the same clockwise convention as
 * `Player.heading`, measured the short way round the torus.  `angleTo` in
 * `engine/math.ts` is the same thing without the wrap, which is wrong for
 * anything near the edge of the playfield.
 */
export function bearingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(wrapCoordinate(to.x - from.x), wrapCoordinate(to.z - from.z));
}

/**
 * The first obstacle a body at `pos` has run into, or null.
 *
 * `OBJOBJ` never sums two radii: it compares the distance against a *single*
 * threshold, which is the obstacle's own `PROXTB` entry for the enemy and a flat
 * `PLAYER_OBSTACLE_RADIUS` for the player - larger than every `PROXTB` entry,
 * "COLLIDE SO WE CAN SEE OBJECT" (BZONE.MAC.txt:7159-7169), so the player is
 * stopped further out and the obstacle stays in view.
 *
 * `minRadius` is therefore a floor on that threshold, not a body radius to be
 * added to the obstacle's: **pass 0 to collide on the obstacle's own `PROXTB`
 * radius**, which is what the enemy does, or `PLAYER_OBSTACLE_RADIUS` to get the
 * player's wider stand-off everywhere.
 */
export function circleHitsObstacle(
  pos: Vec2,
  minRadius: number,
  obstacles: readonly Obstacle[],
): Obstacle | null {
  for (const obstacle of obstacles) {
    const threshold = Math.max(minRadius, obstacle.radius);
    if (threshold > 0 && octagonalDistance(pos, obstacle.pos) < threshold) return obstacle;
  }
  return null;
}

/**
 * The obstacle the missile has run into, or null.  `OBJOBJ` scales the measured
 * distance to 3/4 before comparing it with `PROXTB`, so the missile's effective
 * radius is 4/3 larger than a tank's and it starts levitating that bit earlier
 * (BZONE.MAC.txt:7181-7205).
 */
export function missileHitsObstacle(pos: Vec2, obstacles: readonly Obstacle[]): Obstacle | null {
  for (const obstacle of obstacles) {
    if (
      obstacle.radius > 0 &&
      octagonalDistance(pos, obstacle.pos) * MISSILE_OBSTACLE_SCALE < obstacle.radius
    ) {
      return obstacle;
    }
  }
  return null;
}

// --------------------------------------------------------------------------- //
// Shell against vehicle
// --------------------------------------------------------------------------- //

/**
 * World units per quarter unit.  `SHRTCK` and `SAUCHK` shift the distance right
 * twice before comparing it with their radius tables, so those tables are in
 * units of four (BZONE.MAC.txt:4537-4589, 4885-4889).
 */
const QUARTER_UNIT = 4;

/** How near a shell has to pass the saucer to burst it: `$90` quarter units. */
export const SAUCER_HIT_RADIUS = SHELL_SAUCER_RADIUS_QUARTERS * QUARTER_UNIT;

/**
 * How near a shell has to pass a vehicle to hit it, in world units.
 *
 * Tanks are not circles, and `SHRTCK` says so: the threshold grows with the angle
 * between the shell and the target.  With `d` the heading difference in `TANGLE`
 * units doubled and shifted right three places, the radius is `1.5 * d + $38`
 * quarter units - 224 world units with the two headings aligned, about 416 with
 * them opposed (BZONE.MAC.txt:4537-4589).
 *
 * Note that the widest reading is at 180 degrees, not at 90: the ROM's `d` is
 * monotonic in the heading difference, so a tank driving straight at or away from
 * the shell is not the narrow target the shape of the hull would suggest.
 *
 * A missile (`fat`) shifts two places instead, doubling how fast the radius
 * opens, and adds `$18` before the 1.5 scale, so it is a much easier target than
 * any tank at every angle.
 */
export function shellUnitHitRadius(
  shellHeading: number,
  targetHeading: number,
  fat: boolean,
): number {
  const unitsOff = Math.abs(wrapAngle(shellHeading - targetHeading)) / TANGLE_UNIT_RADIANS;
  const shift = fat ? SHELL_MISSILE_ANGLE_SHIFT : SHELL_TANK_ANGLE_SHIFT;
  const bias = fat ? SHELL_MISSILE_ANGLE_BIAS : 0;
  const d = Math.floor((unitsOff * 2) / (1 << shift)) + bias;
  return (SHELL_TANK_ANGLE_SCALE * d + SHELL_TANK_RADIUS_BASE) * QUARTER_UNIT;
}

/** Whether a shell is inside the (heading-dependent) hit radius of a vehicle. */
export function shellHitsUnit(
  shell: Pick<Shell, 'pos' | 'heading'>,
  target: { pos: Vec2; heading: number },
  fat: boolean,
): boolean {
  return (
    octagonalDistance(shell.pos, target.pos) <
    shellUnitHitRadius(shell.heading, target.heading, fat)
  );
}

// --------------------------------------------------------------------------- //
// What the radar and the reticle can see
// --------------------------------------------------------------------------- //

/** How near dead ahead an enemy has to be for the reticle to flare open. */
const RETICLE_LOCK_RADIANS = RETICLE_LOCK_HEADING * TANGLE_UNIT_RADIANS;

/**
 * The enemy unit the radar and the HUD talk about: the nearest living tank,
 * supertank or missile.  The saucer is deliberately excluded - it is not on the
 * radar, does not drive `EIRNGE` and is not what the reticle locks onto
 * (docs/reference/original-game.md section 2, "Enemy types").
 */
export function nearestEnemyUnit(world: World): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const enemy of world.enemies) {
    if (!enemy.alive || enemy.kind === 'saucer') continue;
    const distance = octagonalDistance(world.player.pos, enemy.pos);
    if (distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * "ENEMY IN RANGE": the enemy unit is inside the radar's reach, which is the
 * single test `DRADAR` makes - `TDIST`, the high byte of the octagonal distance,
 * under `$80` (BZONE.MAC.txt:7857-7885, 7989-8015).
 */
export function isEnemyInRange(world: World): boolean {
  const unit = nearestEnemyUnit(world);
  return unit !== null && octagonalDistance(world.player.pos, unit.pos) < ENEMY_IN_RANGE_UNITS;
}

/**
 * Whether the reticle shows its locked picture: the enemy unit is in range and
 * its bearing is within `RETICLE_LOCK_HEADING` heading units of the view
 * direction (`PTURN` < 2, BZONE.MAC.txt:971-1019).
 */
export function isTargetInSights(world: World): boolean {
  const unit = nearestEnemyUnit(world);
  if (unit === null || !isEnemyInRange(world)) return false;
  return (
    Math.abs(wrapAngle(bearingTo(world.player.pos, unit.pos) - world.player.heading)) <
    RETICLE_LOCK_RADIANS
  );
}
