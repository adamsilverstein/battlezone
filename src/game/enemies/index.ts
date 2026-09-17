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
 * test anywhere in the ROM (docs/reference/original-game.md section 3).  Obstacles
 * are `updateShells`' business and are owner-agnostic, so an enemy shell is stopped
 * by a pyramid exactly as the player's is.
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

import {
  MISSILE_HITTABLE_BELOW,
  SAUCER_DEATH_TICKS,
  SHELL_STEPS_PER_TICK,
  SHELL_STEP_UNITS,
} from '../../data/constants';
import { wrapAngle } from '../../engine/math';
import type { InputState } from '../../input/types';
import {
  SAUCER_HIT_RADIUS,
  bearingTo,
  isEnemyInRange,
  nearestEnemyUnit,
  octagonalDistance,
  shellHitsUnit,
  wrapCoordinate,
} from '../collision';
import { spawnExplosion, updateDebris } from '../explosions';
import { addScore, pointsFor } from '../score';
import { updateSpawner } from '../spawn';
import type { Enemy, GameEvent, Rng, Shell, Vec2, World } from '../types';
import { RADAR_SWEEP_RADIANS, systems } from '../world';
import { internalState } from '../worldState';
import { updateMissile } from './missile';
import { updateSaucer } from './saucer';
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

/** The saucer on the field, alive or fading, or null. */
function findSaucer(world: World): Enemy | null {
  return world.enemies.find((enemy) => enemy.kind === 'saucer') ?? null;
}

/** Whether the player's shell can touch this unit at all. */
function hittable(enemy: Enemy): boolean {
  return enemy.kind !== 'missile' || enemy.y < MISSILE_HITTABLE_BELOW;
}

/**
 * The `SHELL_STEPS_PER_TICK` positions the shell passed through this tick, oldest
 * first, reconstructed by walking back along its heading.
 *
 * `MAIN` runs `COLCHK` and `QWIKCK` once per sub-step, not once per tick, and it has
 * to: a tick of flight is 1024 units and the widest tank hit radius is about 416, so
 * a shell tested only where it ended up would fly straight through anything it
 * passed on the way (BZONE.MAC.txt:1163-1173).  `updateShells` already sub-steps the
 * obstacle test; this gives the enemy test the same four chances.
 */
function sweptPositions(shell: Shell): Vec2[] {
  const stepX = SHELL_STEP_UNITS * Math.sin(shell.heading);
  const stepZ = SHELL_STEP_UNITS * Math.cos(shell.heading);
  const positions: Vec2[] = [];
  for (let back = SHELL_STEPS_PER_TICK - 1; back >= 0; back -= 1) {
    positions.push({
      x: wrapCoordinate(shell.pos.x - back * stepX),
      z: wrapCoordinate(shell.pos.z - back * stepZ),
    });
  }
  return positions;
}

/** Whether the shell passed within a vehicle's hit radius at any sub-step. */
function sweptHitsUnit(
  shell: Shell,
  target: { pos: Vec2; heading: number },
  fat: boolean,
): boolean {
  return sweptPositions(shell).some((pos) =>
    shellHitsUnit({ pos, heading: shell.heading }, target, fat),
  );
}

/** Whether the shell passed within the saucer's flat hit radius at any sub-step. */
function sweptHitsSaucer(shell: Shell, saucer: Enemy): boolean {
  return sweptPositions(shell).some(
    (pos) => octagonalDistance(pos, saucer.pos) < SAUCER_HIT_RADIUS,
  );
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
    unit && hittable(unit) && sweptHitsUnit(shell, unit, unit.kind === 'missile')
      ? unit
      : saucer?.alive && sweptHitsSaucer(shell, saucer)
        ? saucer
        : null;
  if (!target) return null;

  destroy(world, target, rng);
  const points = pointsFor(target.kind);
  return [{ type: 'enemyDestroyed', kind: target.kind, points }, ...addScore(world, points)];
}

/** An enemy shell against the player, then the saucer it may hit by accident. */
function enemyShellHits(world: World, shell: Shell, rng: Rng): GameEvent[] | null {
  if (world.player.alive && sweptHitsUnit(shell, world.player, false)) {
    const state = internalState(world);
    world.player.alive = false;
    state.playerDeaths += 1;
    // The ROM sends a tank after a kill rather than pressing the advantage.
    state.nextUnitOverride = 'tank';
    return [{ type: 'playerDestroyed', by: nearestEnemyUnit(world)?.kind ?? 'tank' }];
  }

  const saucer = findSaucer(world);
  if (saucer?.alive && sweptHitsSaucer(shell, saucer)) {
    destroy(world, saucer, rng);
    // The enemy's own kill: the player is not paid for it.
    return [{ type: 'enemyDestroyed', kind: 'saucer', points: 0 }];
  }
  return null;
}

/**
 * Resolves every shell in flight against the units, the saucer and the player, and
 * takes the ones that struck home off the field.
 *
 * The task brief's signature for this is `(world)`; it takes the `Rng` as well
 * because a hit scatters debris, and `spawnExplosion` needs a source of chance.
 * Nothing in `src/game` is allowed to reach for `Math.random`, so it has to be
 * passed in.
 */
export function resolveShellHits(world: World, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  const flying: Shell[] = [];

  for (const shell of world.shells) {
    const hit =
      shell.owner === 'player'
        ? playerShellHits(world, shell, rng)
        : enemyShellHits(world, shell, rng);
    if (hit) events.push(...hit);
    else flying.push(shell);
  }

  world.shells = flying;
  return events;
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

  events.push(...updateSaucer(world, rng));
  events.push(...resolveShellHits(world, rng));
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

/** Installs the enemy systems on the world, once. */
export function registerEnemySystems(): void {
  for (const system of enemySystems) {
    if (!systems.includes(system)) systems.push(system);
  }
}

registerEnemySystems();
