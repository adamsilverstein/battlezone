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
 * NAMING
 * ------
 * `ObstacleKind` in `game/types.ts` and the ROM's own model names do not line up:
 * the four shapes are a narrow pyramid, a wide pyramid, a tall box and a short
 * box, while the shared type calls them `pyramid`, `wideCube`, `tallCube` and
 * `cube`.  `OBSTACLE_MODEL_BY_KIND` is the bridge, and is also how the renderer
 * looks up the wireframe in `data/models.ts`.  (`wideCube` is a *pyramid*; the
 * shared type is the contract, so the mismatch is documented rather than fixed.)
 */

import {
  OBSTACLES,
  OBSTACLE_TANK_RADIUS,
  SHELL_OBSTACLE_RADIUS_QUARTERS,
  SHELL_OBSTACLE_RADIUS_UNIT,
} from '../data/constants';
import { TAU, wrapAngle } from '../engine/math';
import { wrapCoordinate } from './collision';
import type { Obstacle, ObstacleKind, Rng } from './types';

/** ROM model name for each shared obstacle kind, and the reverse. */
export const OBSTACLE_MODEL_BY_KIND = {
  /** Narrow pyramid, object $00. */
  pyramid: 'pyramid',
  /** Wide pyramid, object $0c. */
  wideCube: 'pyramidWide',
  /** Tall box, object $01. */
  tallCube: 'box',
  /** Short box, object $0f - the one shells fly over. */
  cube: 'boxShort',
} as const satisfies Record<ObstacleKind, string>;

type RomModel = (typeof OBSTACLE_MODEL_BY_KIND)[ObstacleKind];

const KIND_BY_MODEL = Object.fromEntries(
  Object.entries(OBSTACLE_MODEL_BY_KIND).map(([kind, model]) => [model, kind]),
) as Record<RomModel, ObstacleKind>;

/**
 * One `TANGLE` unit in radians.  The ROM's angles count the opposite way round
 * from `Player.heading` - increasing `TANGLE` turns left - so converting flips
 * the sign (see the angle convention in `engine/math.ts`).
 */
const TANGLE_UNIT_RADIANS = TAU / 256;

/**
 * Each obstacle's yaw, in the simulation's clockwise radians, index-aligned with
 * `placeObstacles`.  `Obstacle` in `game/types.ts` has nowhere to keep it, and
 * the layout is fixed, so the renderer reads it from here by index.
 */
export const OBSTACLE_HEADINGS: readonly number[] = OBSTACLES.map((o) =>
  wrapAngle(-o.orientation * TANGLE_UNIT_RADIANS),
);

/**
 * The fixed ROM layout.  ROM y becomes world z, and both coordinates are folded
 * into the signed half of the torus so the player's start sits at the origin.
 */
export function placeObstacles(rng: Rng): Obstacle[] {
  void rng; // The layout is a ROM table; nothing here is random.
  return OBSTACLES.map((o) => ({
    kind: KIND_BY_MODEL[o.model],
    pos: { x: wrapCoordinate(o.x), z: wrapCoordinate(o.y) },
    radius: OBSTACLE_TANK_RADIUS[o.model],
  }));
}

/**
 * The radius a shell has to come within to burst on an obstacle, in world units.
 * `PRXTBL` is in units of 4 because `COLCHK` compares the distance shifted right
 * twice (BZONE.MAC.txt:4945-4953), and the short box entry really is zero.
 */
export function shellHitRadius(kind: ObstacleKind): number {
  return SHELL_OBSTACLE_RADIUS_QUARTERS[OBSTACLE_MODEL_BY_KIND[kind]] * SHELL_OBSTACLE_RADIUS_UNIT;
}
