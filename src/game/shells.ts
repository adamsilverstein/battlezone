/**
 * Cannon shells.
 *
 * The player's cannon holds exactly one shell: firing is refused while `FIRECT`
 * is non-zero, so the reload time is however long the last shot takes to land or
 * run out (BZONE.MAC.txt:5305-5313).  The enemy has its own, independent slot -
 * nothing couples the two, and there is no projectile-versus-projectile test
 * anywhere in the ROM, so shells cannot shoot each other down.
 *
 * SUB-STEPS
 * ---------
 * `MAIN` runs `COLCHK` + `SHUPDT` four times per tick, so a shell advances
 * `SHELL_STEP_UNITS` and is tested against the obstacles four times a tick
 * (docs/reference/atari-source-notes.md, "Frame timing and the main loop").  That
 * matters: a whole tick of flight is 1024 units, wider than any obstacle's hit
 * radius, so without the sub-steps fast shells would tunnel straight through.
 *
 * `FIRECT` starts at 127 and is decremented once per sub-step, which is 31.75
 * ticks - `Shell.ticksLeft` is in ticks, so it counts down in quarters.  Quarters
 * are exact in binary floating point, so the shell still dies on sub-step 127
 * exactly, `SHELL_RANGE_UNITS` from the muzzle.
 *
 * Shell-versus-obstacle uses `PRXTBL`, which is a completely different (and much
 * smaller) table from the one vehicles collide with, and whose short box entry is
 * zero - shells really do fly over short boxes.
 *
 * WHAT ELSE A SHELL CAN HIT
 * ------------------------
 * `CheckProjColl` tests the opposing unit, then the saucer, then the obstacles, and
 * it does all three **inside** the sub-step loop.  That ordering matters: a shell
 * that passes a tank on one sub-step and a pyramid on the next kills the tank.  The
 * vehicles are the enemy systems' business, so they register their test in
 * `shellTargets` and this module runs it first on every sub-step - the same plugin
 * arrangement `world.ts` uses for the systems themselves, and for the same reason:
 * nothing down here needs to know what an enemy is.
 */

import { SHELL_LIFE_TICKS, SHELL_STEPS_PER_TICK, SHELL_STEP_UNITS } from '../data/constants';
import { octagonalDistance, wrapCoordinate } from './collision';
import { shellHitRadius } from './obstacles';
import type { GameEvent, Obstacle, Rng, Shell, Vec2, World } from './types';
import { internalState } from './worldState';

/** Ticks of life spent per sub-step. */
const TICKS_PER_SUB_STEP = 1 / SHELL_STEPS_PER_TICK;

/**
 * A test run against one shell at one sub-step position: the events of whatever it
 * struck, or null if it struck nothing.  Returning events ends the shell's flight.
 */
export type ShellTarget = (world: World, shell: Shell, rng: Rng) => GameEvent[] | null;

/**
 * The vehicle tests, run in registration order before the obstacle test on every
 * sub-step.  The enemy systems register theirs on import; a test that wants bare
 * shell flight leaves the list empty.
 */
export const shellTargets: ShellTarget[] = [];

/** The obstacle a shell has flown into, or null.  Short boxes never match. */
function shellHitsObstacle(shell: Shell, obstacles: readonly Obstacle[]): Obstacle | null {
  for (const obstacle of obstacles) {
    const radius = shellHitRadius(obstacle.kind);
    if (radius > 0 && octagonalDistance(shell.pos, obstacle.pos) < radius) return obstacle;
  }
  return null;
}

/**
 * Puts a shell in the air and returns it.  Both cannons load the same way - the
 * shell leaves from the firer's own position, along its own heading, and is
 * invisible until it passes the near plane (BZONE.MAC.txt:5329-5411) - so both go
 * through here; the one-shell-per-side rule is the caller's business.
 */
export function fireShell(world: World, owner: Shell['owner'], from: Vec2, heading: number): Shell {
  const state = internalState(world);
  const shell: Shell = {
    id: state.nextShellId,
    owner,
    pos: { ...from },
    y: 0,
    heading,
    ticksLeft: SHELL_LIFE_TICKS,
  };
  world.shells.push(shell);
  state.nextShellId += 1;
  return shell;
}

/** Fires the player's cannon, unless a shell of theirs is already in flight. */
export function firePlayerShell(world: World): GameEvent[] {
  if (!world.player.alive) return [];
  if (world.shells.some((shell) => shell.owner === 'player')) return [];

  fireShell(world, 'player', world.player.pos, world.player.heading);
  return [{ type: 'playerFired' }];
}

/**
 * Flies every shell one tick, in `SHELL_STEPS_PER_TICK` sub-steps, testing the
 * registered vehicle targets and then the obstacles after each, and takes the ones
 * that hit something or ran out of life off the field.
 */
export function updateShells(world: World, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const survivors: Shell[] = [];

  for (const shell of world.shells) {
    const stepX = SHELL_STEP_UNITS * Math.sin(shell.heading);
    const stepZ = SHELL_STEP_UNITS * Math.cos(shell.heading);
    let ended = false;

    for (let step = 0; step < SHELL_STEPS_PER_TICK && !ended; step += 1) {
      shell.pos = {
        x: wrapCoordinate(shell.pos.x + stepX),
        z: wrapCoordinate(shell.pos.z + stepZ),
      };
      shell.ticksLeft -= TICKS_PER_SUB_STEP;

      // The vehicles first, as CheckProjColl does; whoever was hit reports it.
      for (const target of shellTargets) {
        const hit = target(world, shell, rng);
        if (hit) {
          events.push(...hit);
          ended = true;
          break;
        }
      }
      if (ended) break;

      // Then the obstacles, then the shell's own life.  Both events carry whose
      // shell it was and the sub-step position it ended on, which is where the burst
      // picture goes and what the sound needs.
      const type = shellHitsObstacle(shell, world.obstacles)
        ? 'shellHitObstacle'
        : shell.ticksLeft <= 0
          ? 'shellExpired'
          : null;
      if (type) {
        events.push({ type, owner: shell.owner, pos: { ...shell.pos } });
        ended = true;
      }
    }

    if (!ended) survivors.push(shell);
  }

  world.shells = survivors;
  return events;
}
