/**
 * The player's tank: two 2-way sticks, one per tread.
 *
 * THE STICK TABLE
 * ---------------
 * The original dispatches the two stick bits through a nine-entry jump table
 * (`MTAB`, BZONE.MAC.txt:5217-5247).  Reproduced exactly:
 *
 * | left    | right   | action                                  |
 * | ------- | ------- | --------------------------------------- |
 * | forward | forward | forward x2                              |
 * | back    | back    | back x2                                 |
 * | forward | back    | turn right x2 (a pivot, in place)       |
 * | back    | forward | turn left x2                            |
 * | forward | centre  | turn right x1 + forward x1              |
 * | centre  | forward | turn left x1  + forward x1              |
 * | back    | centre  | turn left x1  + back x1                 |
 * | centre  | back    | turn right x1 + back x1                 |
 * | centre  | centre  | nothing                                 |
 *
 * The important consequence is that **one stick curves, it does not pivot**: the
 * tank turns towards the idle tread and drives at the same time.  Spinning on the
 * spot needs the sticks in opposite directions.  Each turn is 1/512 of a turn and
 * each move `PLAYER_MOVE_STEP_UNITS`, both per tick, so the tank turns 11 deg/s
 * while curving, 22 deg/s pivoting, and tops out at about 4450 units/s - half
 * again the ROM's 2970, which is the one deliberate departure here and is argued
 * at `PLAYER_SPEED_MULTIPLIER`.
 *
 * BLOCKING
 * --------
 * `MOTION` moves first and checks afterwards: on contact it restores the *position*
 * and leaves the heading alone (BZONE.MAC.txt:5263-5289), which is why a blocked
 * tank can still turn itself out of trouble.  The `BOING` sound plays once, so
 * `motionBlocked` is emitted on the rising edge of contact rather than every tick.
 */

import {
  PLAYER_MOVE_STEP_UNITS,
  PLAYER_FULL_SPEED_STEPS,
  PLAYER_HALF_SPEED_STEPS,
  PLAYER_OBSTACLE_RADIUS,
  PLAYER_PIVOT_STEPS,
  PLAYER_TURN_STEPS,
  TURN_STEP_DEGREES,
} from '../data/constants';
import type { InputState } from '../input/types';
import { TAU, wrapAngle } from '../engine/math';
import { circleHitsObstacle, tankAtContact, wrapCoordinate } from './collision';
import type { EnemyKind, GameEvent, Vec2, World } from './types';
import { internalState } from './worldState';

/** One rotation step in radians: 1/512 of a turn, clockwise-positive. */
export const TURN_STEP_RADIANS = (TURN_STEP_DEGREES / 360) * TAU;

/**
 * Where a life begins.  The surviving source does not fix the player's start, so
 * this is the recreation's choice: the origin, facing the crescent moon due north
 * (docs/reference/atari-source-notes.md, "Mountains, moon and volcano").  The ROM
 * did randomise the spot after a death, which `resetPlayer` cannot do because its
 * signature has no `Rng`.
 */
export const PLAYER_START: Readonly<Vec2> = Object.freeze({ x: 0, z: 0 });

/** What the two sticks ask for this tick: turn steps (+ right) and move steps (+ forward). */
function readSticks(input: InputState): { turnSteps: number; moveSteps: number } {
  const { leftTread: left, rightTread: right } = input;
  if (left === right) {
    // Both centred is nothing; both the same way is a straight run at full speed.
    return { turnSteps: 0, moveSteps: left * PLAYER_FULL_SPEED_STEPS };
  }
  if (left !== 0 && right !== 0) {
    // Opposite treads: a pivot, towards the side whose tread is reversing.
    return { turnSteps: left * PLAYER_PIVOT_STEPS, moveSteps: 0 };
  }
  // One tread idle: turn towards it and drive, the direction set by the live tread.
  const live = left !== 0 ? left : right;
  const towardsRight = left !== 0 ? 1 : -1;
  return {
    turnSteps: live * towardsRight * PLAYER_TURN_STEPS,
    moveSteps: live * PLAYER_HALF_SPEED_STEPS,
  };
}

/** One tick of tread kinematics and obstacle blocking. */
export function updatePlayer(world: World, input: InputState): GameEvent[] {
  const { player } = world;
  const state = internalState(world);
  const { turnSteps, moveSteps } = player.alive
    ? readSticks(input)
    : { turnSteps: 0, moveSteps: 0 };

  // `moving` is the treads translating and `turning` them rotating, kept apart so
  // the renderer can tell a pivot from a charge.  The engine note does NOT follow
  // `moving` alone: the ROM sets the "rev up" bit for *any* non-centred stick,
  // pivot included (BZONE.MAC.txt:5287-5293), so a consumer of
  // `AudioSnapshot.moving` has to pass `moving || turning`.
  player.turning = turnSteps !== 0;
  player.moving = moveSteps !== 0;
  if (turnSteps !== 0) player.heading = wrapAngle(player.heading + turnSteps * TURN_STEP_RADIANS);

  if (moveSteps === 0) {
    state.playerBlocked = false;
    return [];
  }

  const before = { ...player.pos };
  const distance = moveSteps * PLAYER_MOVE_STEP_UNITS;
  player.pos = {
    x: wrapCoordinate(before.x + distance * Math.sin(player.heading)),
    z: wrapCoordinate(before.z + distance * Math.cos(player.heading)),
  };

  // An enemy tank is as solid as a pyramid: `OBJOBJ` runs its tank-versus-tank test
  // for the player too, so driving into one stops the tank rather than passing
  // through it.  A tank the player bumps does not back off (see `enemies/tank.ts`),
  // so the two simply grind against each other.
  const blocked =
    circleHitsObstacle(player.pos, PLAYER_OBSTACLE_RADIUS, world.obstacles) !== null ||
    tankAtContact(player.pos, world.enemies) !== null;

  if (!blocked) {
    state.playerBlocked = false;
    return [];
  }

  player.pos = before;
  const wasBlocked = state.playerBlocked;
  state.playerBlocked = true;
  return wasBlocked ? [] : [{ type: 'motionBlocked' }];
}

/**
 * The player is destroyed.  The enemy scores 1000 of its own for the kill, which is
 * what drives the difficulty ramp (`HITS+2`, BZONE.MAC.txt:6757), and the next unit
 * is forced to a tank - the ROM refuses to follow a kill with a missile
 * (BZONE.MAC.txt:5249-5255).  The death sequence itself is the game state
 * machine's.
 */
export function killPlayer(world: World, by: EnemyKind): GameEvent[] {
  const state = internalState(world);
  world.player.alive = false;
  state.playerDeaths += 1;
  state.nextUnitOverride = 'tank';
  return [{ type: 'playerDestroyed', by }];
}

/** Puts the player back on the field for a new life. */
export function resetPlayer(world: World): void {
  world.player.pos = { ...PLAYER_START };
  world.player.heading = 0;
  world.player.moving = false;
  world.player.turning = false;
  world.player.alive = true;
  world.shells = world.shells.filter((shell) => shell.owner !== 'player');
  internalState(world).playerBlocked = false;
}
