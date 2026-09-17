/**
 * The demo pilot: what drives the player's tank while nobody is playing.
 *
 * `MOTION` takes the sticks over in attract mode (BZONE.MAC.txt:5143-5175): the
 * tank drives forward while bit 6 of `FRAME` is clear and reverses while it is set
 * - `ATTRACT_DRIVE_MASK`, about four seconds each way - and turns left or right by
 * the sign bits of its own x position, which is what keeps the demo from wandering
 * off across the wrapped battlefield.  `UpdatePlayer` is also described as turning
 * the demo tank towards the enemy (docs/reference/original-game.md section 4), so
 * the two rules are layered here in that order: chase the enemy when there is one,
 * otherwise drive the ROM's patrol.
 *
 * The one thing the demo must never do is press start - that is the player's job,
 * and the state machine reads it from the real input, not from here.
 *
 * `rng` is part of the published signature and deliberately unused: every decision
 * above is a function of the world and the tick, so the demo replays identically,
 * and the chance in an attract cycle all comes from the enemy AI it is fighting.
 */

import { ATTRACT_DRIVE_MASK, RETICLE_LOCK_HEADING, TANGLE_UNIT_RADIANS } from '../data/constants';
import { wrapAngle } from '../engine/math';
import { NEUTRAL_INPUT, type InputState } from '../input/types';
import { bearingTo, nearestEnemyUnit } from './collision';
import type { Rng, World } from './types';

/**
 * How far off the nose the demo pilot bothers to turn.  The reticle's own lock
 * window is what "in sights" means everywhere else in the game, so the pilot
 * steers until the target is inside it and then drives at it.
 */
const AIM_TOLERANCE_RADIANS = RETICLE_LOCK_HEADING * TANGLE_UNIT_RADIANS;

/** Treads for a pivot: `+1` turns right, `-1` left (the table in game/player.ts). */
function pivot(direction: 1 | -1): Pick<InputState, 'leftTread' | 'rightTread'> {
  return { leftTread: direction, rightTread: -direction as 1 | -1 };
}

/** Treads for a curve towards one side while driving `drive` forward or back. */
function curve(direction: 1 | -1, drive: 1 | -1): Pick<InputState, 'leftTread' | 'rightTread'> {
  // One tread idle turns towards that tread, so the live tread is the far one.
  return direction === 1
    ? { leftTread: drive, rightTread: 0 }
    : { leftTread: 0, rightTread: drive };
}

/** Which way `MOTION` has the demo driving this tick: forward, then back. */
function driveDirection(tick: number): 1 | -1 {
  return (tick & ATTRACT_DRIVE_MASK) === 0 ? 1 : -1;
}

/** One tick of the demo pilot's sticks and trigger. */
export function attractInput(world: World, tick: number, _rng: Rng): InputState {
  const target = nearestEnemyUnit(world);
  const drive = driveDirection(tick);

  if (target) {
    const off = wrapAngle(bearingTo(world.player.pos, target.pos) - world.player.heading);
    const treads =
      Math.abs(off) > AIM_TOLERANCE_RADIANS
        ? pivot(off > 0 ? 1 : -1)
        : { leftTread: 1 as const, rightTread: 1 as const };
    return {
      ...NEUTRAL_INPUT,
      ...treads,
      // The demo shoots the moment the sights lock, which is the same flag the
      // reticle brightens on.
      fire: world.targetInSights,
      firePressed: world.targetInSights,
    };
  }

  const { x } = world.player.pos;
  const treads = x === 0 ? { leftTread: drive, rightTread: drive } : curve(x < 0 ? 1 : -1, drive);
  return { ...NEUTRAL_INPUT, ...treads };
}
