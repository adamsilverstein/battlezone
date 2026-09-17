/**
 * Enemy explosions: six chunks, thrown out on a fixed pattern, spinning flat.
 *
 * `EXINIT` (BZONE.MAC.txt:5091-5139) replaces the dead unit with six pieces at its
 * own position, each with a per-piece ground velocity from `EXPTBX`/`EXPTBY` and a
 * vertical velocity from `IZVEL` whose low byte is random - so the spray is the
 * same shape every time with only a little variation.  `EXPLDE`
 * (BZONE.MAC.txt:3449-3645) then flies them: the height gains four times the
 * vertical velocity per tick and the velocity loses `GRAVTY` = 4, and each piece
 * turns by `piece * 4 + 3` heading units about the vertical axis and nothing else -
 * "the chunks that appear to be tumbling wildly through the air are actually just
 * spinning in circles" (docs/reference/original-game.md section 2).
 *
 * Piece 3 gets much the largest vertical velocity, so it is thrown high and lands
 * well after the others; the spawner waits for exactly that, because in the
 * original the next enemy appears the instant the last chunk touches down.
 *
 * DEVIATIONS.  The ROM picks its chunk models by object number - `piece / 2 + $10`
 * for a tank, eight higher for a missile, with one swapped out for a supertank -
 * and only the tank's and the missile's sets survive in the decoded model tables.
 * The sets below are named from those models: the tank sheds its hull, two body
 * panels, its radar dish and its treads, the supertank (which has neither dish nor
 * treads) sheds body panels, and the missile uses the two small missile fragments.
 * The saucer is given the same small spray, although the original disintegrates it
 * with a brightness flash and no chunks at all (BZONE.MAC.txt:6699-6727).
 */

import {
  DEBRIS_PIECES,
  DEBRIS_SMALL_SCALE,
  DEBRIS_SPIN_BASE,
  DEBRIS_SPIN_PER_PIECE,
  DEBRIS_VELOCITY_X,
  DEBRIS_VELOCITY_Y,
  DEBRIS_VELOCITY_Z,
  DEBRIS_Z_VELOCITY_SCALE,
  GRAVITY_PER_TICK,
  HEADING_UNITS_PER_TURN,
  TANGLE_UNIT_RADIANS,
} from '../data/constants';
import { wrapAngle } from '../engine/math';
import { wrapCoordinate } from './collision';
import type { Debris, Enemy, EnemyKind, Rng, World } from './types';
import { internalState } from './worldState';

/**
 * Which model each of the six chunks uses.  Chunk 3 is the one `IZVEL` throws
 * highest (`DEBRIS_HIGH_PIECE`), so that slot holds the piece a player's eye
 * follows all the way down: the tank's radar dish, the supertank's hull.
 */
const CHUNK_MODELS: Record<EnemyKind, readonly string[]> = {
  tank: ['debrisHull', 'debrisPiece1', 'debrisPiece2', 'radarDish', 'tread4', 'tread8'],
  supertank: [
    'debrisPiece1',
    'debrisPiece2',
    'debrisPiece1',
    'debrisHull',
    'debrisPiece2',
    'debrisPiece1',
  ],
  missile: [
    'debrisPiece4',
    'debrisPiece3',
    'debrisPiece4',
    'debrisPiece3',
    'debrisPiece4',
    'debrisPiece3',
  ],
  saucer: [
    'debrisPiece4',
    'debrisPiece3',
    'debrisPiece4',
    'debrisPiece3',
    'debrisPiece4',
    'debrisPiece3',
  ],
};

/** The missile's and the saucer's chunks are smaller, so they fly less far. */
const SPRAY_SCALE: Record<EnemyKind, number> = {
  tank: 1,
  supertank: 1,
  missile: DEBRIS_SMALL_SCALE,
  saucer: DEBRIS_SMALL_SCALE,
};

/**
 * How long a chunk stays up.  The original has no lifetime counter - it simply
 * drops the explosion once every piece's height has gone negative - so this walks
 * the same arithmetic forward to find the tick that happens on, which keeps
 * `ticksLeft` and the flight exactly in step.
 */
function flightTicks(startY: number, velocityY: number): number {
  let y = startY;
  let velocity = velocityY;
  let ticks = 0;
  while (y >= 0) {
    y += DEBRIS_Z_VELOCITY_SCALE * velocity;
    velocity += GRAVITY_PER_TICK;
    ticks += 1;
  }
  return ticks;
}

/**
 * The three ROM tables zipped into one per-chunk template: the ground velocity
 * from `EXPTBX`/`EXPTBY`, the whole part of the vertical velocity from `IZVEL`, and
 * the spin, whose direction alternates with the index.
 */
const CHUNKS = DEBRIS_VELOCITY_X.slice(0, DEBRIS_PIECES).map((x, piece) => ({
  x,
  z: DEBRIS_VELOCITY_Y[piece]!,
  lift: DEBRIS_VELOCITY_Z[piece]!,
  spin:
    (piece % 2 === 0 ? 1 : -1) *
    (piece * DEBRIS_SPIN_PER_PIECE + DEBRIS_SPIN_BASE) *
    TANGLE_UNIT_RADIANS,
}));

/**
 * Scatters a dead unit into its six chunks.  For a tank, supertank or missile this
 * also books the tick the next unit may arrive on - the one its highest chunk lands
 * - because in the original the replacement appears the instant that chunk touches
 * down, with no gap at all.  The saucer is outside that rule and does not book
 * anything.
 */
export function spawnExplosion(world: World, enemy: Enemy, rng: Rng): void {
  const models = CHUNK_MODELS[enemy.kind];
  const scale = SPRAY_SCALE[enemy.kind];
  let longest = 0;

  for (const [piece, chunk] of CHUNKS.entries()) {
    // IZVEL is the whole part of the vertical velocity and the low byte under it
    // is random, which is what makes two explosions of the same tank differ.
    const velocityY = (chunk.lift + rng.int(256) / 256) * scale;
    const ticksLeft = flightTicks(enemy.y, velocityY);
    world.debris.push({
      model: models[piece]!,
      pos: { ...enemy.pos },
      y: enemy.y,
      vel: { x: chunk.x * scale, y: velocityY, z: chunk.z * scale },
      // A random starting orientation, and yaw only: no chunk ever tilts.
      rot: { x: 0, y: rng.int(HEADING_UNITS_PER_TURN) * TANGLE_UNIT_RADIANS, z: 0 },
      spin: { x: 0, y: chunk.spin, z: 0 },
      ticksLeft,
    });
    longest = Math.max(longest, ticksLeft);
  }

  if (enemy.kind !== 'saucer') internalState(world).nextUnitAt = world.tick + longest;
}

/** Flies every chunk one tick and takes the ones that have landed off the field. */
export function updateDebris(world: World): void {
  const flying: Debris[] = [];

  for (const piece of world.debris) {
    piece.pos = {
      x: wrapCoordinate(piece.pos.x + piece.vel.x),
      z: wrapCoordinate(piece.pos.z + piece.vel.z),
    };
    piece.y += DEBRIS_Z_VELOCITY_SCALE * piece.vel.y;
    piece.vel.y += GRAVITY_PER_TICK;
    piece.rot = { ...piece.rot, y: wrapAngle(piece.rot.y + piece.spin.y) };
    piece.ticksLeft -= 1;
    if (piece.ticksLeft > 0) flying.push(piece);
  }

  world.debris = flying;
}
