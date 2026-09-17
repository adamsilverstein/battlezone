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
 * zero - shells really do fly over short boxes.  Shell-versus-enemy is the
 * enemy's business and arrives with the enemy systems (task 6).
 */

import { SHELL_LIFE_TICKS, SHELL_STEPS_PER_TICK, SHELL_STEP_UNITS } from '../data/constants';
import { octagonalDistance, wrapCoordinate } from './collision';
import { shellHitRadius } from './obstacles';
import type { GameEvent, Obstacle, Shell, World } from './types';
import { internalState } from './worldState';

/** Ticks of life spent per sub-step. */
const TICKS_PER_SUB_STEP = 1 / SHELL_STEPS_PER_TICK;

/** The obstacle a shell has flown into, or null.  Short boxes never match. */
function shellHitsObstacle(shell: Shell, obstacles: readonly Obstacle[]): Obstacle | null {
  for (const obstacle of obstacles) {
    const radius = shellHitRadius(obstacle.kind);
    if (radius > 0 && octagonalDistance(shell.pos, obstacle.pos) < radius) return obstacle;
  }
  return null;
}

/** Fires the player's cannon, unless a shell of theirs is already in flight. */
export function firePlayerShell(world: World): GameEvent[] {
  if (!world.player.alive) return [];
  if (world.shells.some((shell) => shell.owner === 'player')) return [];

  const state = internalState(world);
  world.shells.push({
    id: state.nextShellId,
    owner: 'player',
    // The shell leaves from the player's own position and is invisible until it
    // passes the near plane (BZONE.MAC.txt:5329-5411).
    pos: { ...world.player.pos },
    y: 0,
    heading: world.player.heading,
    ticksLeft: SHELL_LIFE_TICKS,
  });
  state.nextShellId += 1;
  return [{ type: 'playerFired' }];
}

/**
 * Flies every shell one tick, in `SHELL_STEPS_PER_TICK` sub-steps with a
 * collision test after each, and takes the ones that hit something or ran out of
 * life off the field.
 */
export function updateShells(world: World): GameEvent[] {
  const events: GameEvent[] = [];
  const survivors: Shell[] = [];

  for (const shell of world.shells) {
    const stepX = SHELL_STEP_UNITS * Math.sin(shell.heading);
    const stepZ = SHELL_STEP_UNITS * Math.cos(shell.heading);
    let ended: GameEvent | null = null;

    for (let step = 0; step < SHELL_STEPS_PER_TICK && ended === null; step += 1) {
      shell.pos = {
        x: wrapCoordinate(shell.pos.x + stepX),
        z: wrapCoordinate(shell.pos.z + stepZ),
      };
      shell.ticksLeft -= TICKS_PER_SUB_STEP;
      if (shellHitsObstacle(shell, world.obstacles)) ended = { type: 'shellHitObstacle' };
      else if (shell.ticksLeft <= 0) ended = { type: 'shellExpired' };
    }

    if (ended) events.push(ended);
    else survivors.push(shell);
  }

  world.shells = survivors;
  return events;
}
