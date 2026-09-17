/**
 * The enemy systems: what every hostile thing on the battlefield does in a tick,
 * and what happens when a shell finds one.
 *
 * Importing this module registers two systems with the world, in the order the
 * original's `MAIN` runs them after the player and the shells:
 *
 * 1. `updateEnemies` - the live units and the saucer move, the shells that have
 *    reached something resolve, the debris flies on, and the radar blip relights as
 *    the sweep passes the enemy's bearing;
 * 2. `updateSpawner` - the ladder keeps exactly one unit on the field.
 *
 * SHELL COLLISION
 * ---------------
 * `CheckProjColl` tests, in order, the opposing unit, then the saucer, then the
 * obstacles - and nothing else, which is the whole answer to whether a shell can
 * shoot down another shell: **it cannot**, there is no projectile-versus-projectile
 * test anywhere in the ROM (docs/reference/original-game.md section 3).
 *
 * All three run on every sub-step, so `resolveShellHits` is registered with
 * `shellTargets` and `updateShells` calls it four times a tick, before its own
 * obstacle test.  That is not a detail: a tick of flight is 1024 units, wider than
 * any hit radius, and a shell that passed a tank early in the tick and a pyramid
 * late in it has to kill the tank.  Obstacles stay `updateShells`' business and are
 * owner-agnostic, so an enemy shell is stopped by a pyramid exactly as the player's
 * is.
 *
 * A missile at or above `TOP` cannot be hit at all (BZONE.MAC.txt:4527-4535), and a
 * saucer shot by an *enemy* shell scores the player nothing
 * (docs/reference/original-game.md section 2).
 *
 * WHAT THE DEAD LEAVE BEHIND
 * --------------------------
 * A destroyed unit is taken off `world.enemies` at once and represented by its
 * debris, which is what the ROM does in effect - it marks the unit exploding and
 * draws chunks instead of a tank.  The saucer is the exception: it stays on the
 * field with `alive` false for its 32-tick flare-and-fade before it goes.
 */

import { MISSILE_HITTABLE_BELOW, SAUCER_DEATH_TICKS } from '../../data/constants';
import { wrapAngle } from '../../engine/math';
import type { InputState } from '../../input/types';
import {
  SAUCER_HIT_RADIUS,
  bearingTo,
  isEnemyInRange,
  nearestEnemyUnit,
  octagonalDistance,
  shellHitsUnit,
} from '../collision';
import { spawnExplosion, updateDebris } from '../explosions';
import { killPlayer } from '../player';
import { addScore, pointsFor } from '../score';
import { shellTargets } from '../shells';
import { updateSpawner } from '../spawn';
import type { Enemy, GameEvent, Rng, Shell, World } from '../types';
import { RADAR_SWEEP_RADIANS, systems } from '../world';
import { enemyBrain, shellFirer } from '../worldState';
import { updateMissile } from './missile';
import { findSaucer, updateSaucer } from './saucer';
import { updateSupertank } from './supertank';
import { updateTank } from './tank';

export { fireEnemyShell, updateTank } from './tank';
export { updateSupertank } from './supertank';
export { updateMissile } from './missile';
export { updateSaucer } from './saucer';
export { updateSpawner } from '../spawn';
export { spawnExplosion, updateDebris } from '../explosions';
export { addScore } from '../score';
export { isEnemyInRange, isTargetInSights } from '../collision';

/** Whether the player's shell can touch this unit at all. */
function hittable(enemy: Enemy): boolean {
  return enemy.kind !== 'missile' || enemy.y < MISSILE_HITTABLE_BELOW;
}

/** Whether the shell is inside the saucer's flat hit radius. */
function hitsSaucer(shell: Shell, saucer: Enemy): boolean {
  return octagonalDistance(shell.pos, saucer.pos) < SAUCER_HIT_RADIUS;
}

/** Takes a unit off the field and scatters it; the saucer fades instead. */
function destroy(world: World, enemy: Enemy, rng: Rng): void {
  enemy.alive = false;
  spawnExplosion(world, enemy, rng);
  if (enemy.kind === 'saucer') {
    enemy.state = 'dying';
    enemy.timer = SAUCER_DEATH_TICKS;
    return;
  }
  world.enemies = world.enemies.filter((other) => other !== enemy);
}

/** The player's shell against the unit, then the saucer. */
function playerShellHits(world: World, shell: Shell, rng: Rng): GameEvent[] | null {
  const unit = nearestEnemyUnit(world);
  const saucer = findSaucer(world);
  const target =
    unit && hittable(unit) && shellHitsUnit(shell, unit, unit.kind === 'missile')
      ? unit
      : saucer?.alive && hitsSaucer(shell, saucer)
        ? saucer
        : null;
  if (!target) return null;

  destroy(world, target, rng);
  const points = pointsFor(target.kind);
  return [{ type: 'enemyDestroyed', kind: target.kind, points }, ...addScore(world, points)];
}

/** An enemy shell against the player, then the saucer it may hit by accident. */
function enemyShellHits(world: World, shell: Shell, rng: Rng): GameEvent[] | null {
  if (world.player.alive && shellHitsUnit(shell, world.player, false)) {
    // The unit that fired may already be scrap, so the kind travels with the shell.
    return killPlayer(world, shellFirer(shell) ?? 'tank');
  }

  const saucer = findSaucer(world);
  if (saucer?.alive && hitsSaucer(shell, saucer)) {
    destroy(world, saucer, rng);
    // The enemy's own kill: the player is not paid for it.
    return [{ type: 'enemyDestroyed', kind: 'saucer', points: 0 }];
  }
  return null;
}

/**
 * `CheckProjColl` for one shell at one sub-step position: the opposing unit, then
 * the saucer, then - back in `updateShells` - the obstacles.  Returns the events of
 * whatever it struck, or null when it struck nothing and should fly on.
 *
 * The task brief's signature for this is `(world)`.  It takes the shell because the
 * ROM tests each one on every sub-step rather than once a tick, and the `Rng`
 * because a hit scatters debris and nothing in `src/game` may reach for
 * `Math.random`.  It is registered with `shellTargets`, so `updateShells` is what
 * actually calls it, and taking the spent shell off the field is that function's
 * job.
 */
export function resolveShellHits(world: World, shell: Shell, rng: Rng): GameEvent[] | null {
  const hit =
    shell.owner === 'player'
      ? playerShellHits(world, shell, rng)
      : enemyShellHits(world, shell, rng);
  if (!hit) return null;

  // A landed shell clears `TIMOUT` (BZONE.MAC.txt:4589-4607), so the spawner's
  // patience with a unit starts again whenever something actually happens - it is
  // only a stalled, avoided enemy the ladder gives up on.
  const survivor = nearestEnemyUnit(world);
  if (survivor) enemyBrain(survivor).aliveTicks = 0;
  return hit;
}

/**
 * The radar blip: `DRADAR` relights it when the sweep line passes within `$0C`
 * heading units of the enemy's player-relative bearing, so the blip flashes once a
 * revolution rather than burning steadily (BZONE.MAC.txt:7775-7803).  The world
 * advances `radarAngle` after the systems have run, so the arc covered this tick is
 * the one just ahead of the current angle.
 */
function radarPing(world: World): GameEvent[] {
  const unit = nearestEnemyUnit(world);
  if (!unit || !isEnemyInRange(world)) return [];
  const relative = wrapAngle(bearingTo(world.player.pos, unit.pos) - world.player.heading);
  const ahead = wrapAngle(relative - world.radarAngle);
  return ahead > 0 && ahead <= RADAR_SWEEP_RADIANS ? [{ type: 'radarPing' }] : [];
}

/** One tick of every enemy on the field. */
export function updateEnemies(world: World, _input: InputState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];

  // A copy, because a unit that dies this tick is taken out of the list.
  for (const enemy of [...world.enemies]) {
    if (!enemy.alive && enemy.kind !== 'saucer') continue;
    switch (enemy.kind) {
      case 'tank':
        events.push(...updateTank(world, enemy, rng));
        break;
      case 'supertank':
        events.push(...updateSupertank(world, enemy, rng));
        break;
      case 'missile':
        events.push(...updateMissile(world, enemy, rng));
        break;
      case 'saucer':
        break; // the saucer's whole life is its own system, below
    }
  }

  // A missile that rams the player destroys itself, so sweep up anything that died
  // during its own update; only the saucer stays on to be faded out.
  world.enemies = world.enemies.filter((enemy) => enemy.alive || enemy.kind === 'saucer');

  events.push(...updateSaucer(world, rng));
  updateDebris(world);
  events.push(...radarPing(world));
  return events;
}

/**
 * The spawner has no use for the input, so it is adapted to the system signature
 * the world calls everything with.
 */
function spawnEnemies(world: World, _input: InputState, rng: Rng): GameEvent[] {
  return updateSpawner(world, rng);
}

/** The systems this module installs, in the order they run. */
export const enemySystems = [updateEnemies, spawnEnemies] as const;

/** Installs the enemy systems and the shell collision test on the world, once. */
export function registerEnemySystems(): void {
  for (const system of enemySystems) {
    if (!systems.includes(system)) systems.push(system);
  }
  if (!shellTargets.includes(resolveShellHits)) shellTargets.push(resolveShellHits);
}

registerEnemySystems();
