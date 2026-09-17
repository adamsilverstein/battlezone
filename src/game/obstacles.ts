/**
 * The battlefield furniture: 21 pyramids and boxes that never move.
 *
 * Their types, positions and orientations are hard-coded ROM tables (`PTBLO1`,
 * `PTBLX1`, `PTBLY1`), transcribed as `OBSTACLES` in `data/constants.ts`; the
 * layout is identical in every game, and the claim that it is randomised is a
 * myth (docs/reference/original-game.md section 2).  So `placeObstacles` takes an
 * `Rng` only to match the shape of the other world builders and never draws from
 * it.
 *
 * `ObstacleKind` names the ROM's four shapes - narrow pyramid, wide pyramid, tall
 * box, short box - with the same strings the ROM tables and `data/models.ts` use,
 * so an obstacle's `kind` is directly its wireframe key and its key into both
 * radius tables.  No mapping needed, and no assertion either: `kind: o.model` and
 * the radius lookups below only compile while `ObstacleKind` and the ROM tables'
 * own `ObstacleModel` agree, so a divergence is a type error rather than a
 * silently missing wireframe.
 */

import {
  OBSTACLES,
  OBSTACLE_TANK_RADIUS,
  SHELL_OBSTACLE_RADIUS_QUARTERS,
  SHELL_OBSTACLE_RADIUS_UNIT,
  TANGLE_UNIT_RADIANS,
} from '../data/constants';
import { wrapAngle } from '../engine/math';
import { wrapCoordinate } from './collision';
import type { Obstacle, ObstacleKind, Rng } from './types';

/**
 * Whether a vehicle has run into one of these.  Re-exported so obstacle
 * collision has one import site; `minRadius` is a floor on the threshold, so
 * pass 0 to use the obstacle's own `PROXTB` radius.
 */
export { circleHitsObstacle } from './collision';

/**
 * The fixed ROM layout.  ROM y becomes world z, and both coordinates are folded
 * into the signed half of the torus so the player's start sits at the origin; the
 * orientation byte becomes a clockwise heading in radians.
 */
export function placeObstacles(rng: Rng): Obstacle[] {
  void rng; // The layout is a ROM table; nothing here is random.
  return OBSTACLES.map((o) => ({
    kind: o.model,
    pos: { x: wrapCoordinate(o.x), z: wrapCoordinate(o.y) },
    heading: wrapAngle(-o.orientation * TANGLE_UNIT_RADIANS),
    radius: OBSTACLE_TANK_RADIUS[o.model],
  }));
}

/**
 * The radius a shell has to come within to burst on an obstacle, in world units.
 * `PRXTBL` is in units of 4 because `COLCHK` compares the distance shifted right
 * twice (BZONE.MAC.txt:4945-4953), and the short box entry really is zero.
 */
export function shellHitRadius(kind: ObstacleKind): number {
  return SHELL_OBSTACLE_RADIUS_QUARTERS[kind] * SHELL_OBSTACLE_RADIUS_UNIT;
}
