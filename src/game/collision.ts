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
  WORLD_SIZE,
} from '../data/constants';
import type { Obstacle, Vec2 } from './types';

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
