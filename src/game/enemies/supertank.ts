/**
 * The supertank (`TR7`): the same brain as the tank in a much better vehicle.
 *
 * `TR7CHK` (BZONE.MAC.txt:7315-7323) swaps it in for the ordinary tank once five
 * missiles have been launched, and everything about it that differs is a number
 * rather than a behaviour: it takes twice the move step, pivots four steps a tick
 * instead of two, and stops closing at `$800` rather than `$500`
 * (BZONE.MAC.txt:5985-6001; docs/reference/original-game.md section 2).  It has no
 * treads and no radar dish, which is why its debris is only body panels.
 *
 * THE DODGE
 * ---------
 * The one behaviour here that is not in the ROM.  Design spec 5.2 asks the
 * supertank to dodge when the player fires, and nothing in the original reacts to
 * the player's shell at all: `TryShootPlayer` and `UpdateTank` never look at the
 * projectile slots (docs/reference/original-game.md section 3).  The recreation's
 * version is deliberately small - on the first tick of each new player shell the
 * supertank swings its goal 90 degrees off the bearing to the player for
 * `SUPERTANK_DODGE_TICKS` and then carries on - so it slides across the shell's
 * path at supertank speed rather than inventing a whole evasion mode.  `dodgedShell`
 * remembers the shell it reacted to, so one shot buys one dodge.
 */

import {
  SUPERTANK_DODGE_TICKS,
  SUPERTANK_PIVOT_STEPS,
  SUPERTANK_SPEED_MULTIPLIER,
  SUPERTANK_STOP_CLOSING_UNITS,
} from '../../data/constants';
import { TAU, wrapAngle } from '../../engine/math';
import { bearingTo } from '../collision';
import type { Enemy, GameEvent, Rng, World } from '../types';
import { enemyBrain } from '../worldState';
import { updateTank, type TankProfile } from './tank';

export const SUPERTANK_PROFILE: TankProfile = {
  pivotSteps: SUPERTANK_PIVOT_STEPS,
  speedMultiplier: SUPERTANK_SPEED_MULTIPLIER,
  stopClosing: SUPERTANK_STOP_CLOSING_UNITS,
};

/** The newest player shell in the air, or null while the player is reloading. */
function incomingShell(world: World): number | null {
  let newest: number | null = null;
  for (const shell of world.shells) {
    if (shell.owner === 'player' && (newest === null || shell.id > newest)) newest = shell.id;
  }
  return newest;
}

/** One tick of a supertank: the dodge, then the tank's own machine. */
export function updateSupertank(world: World, enemy: Enemy, rng: Rng): GameEvent[] {
  const brain = enemyBrain(enemy);
  const shell = incomingShell(world);

  if (shell !== null && shell !== brain.dodgedShell) {
    brain.dodgedShell = shell;
    brain.goal = wrapAngle(bearingTo(enemy.pos, world.player.pos) + TAU / 4);
    enemy.state = 'dodge';
    // The dodge outlives the tank's own decision timer, so the goal stands.
    enemy.timer = SUPERTANK_DODGE_TICKS + 1;
  }

  return updateTank(world, enemy, rng, SUPERTANK_PROFILE);
}
