import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  ENEMY_IN_RANGE_UNITS,
  ENEMY_RESPAWN_TIMOUT,
  ENEMY_SPAWN_ANGLE_MASK,
  ENEMY_SPAWN_ANGLE_MASKS,
  ENEMY_SPAWN_FAR_UNITS,
  ENEMY_SPAWN_HEADING_SCATTER,
  ENEMY_SPAWN_NEAR_UNITS,
  MISSILE_START_HEIGHT,
  MISSILE_TIMEOUT_TIMOUT,
  SUPERTANK_AFTER_MISSILES,
  SUPERTANK_COUNTER_MAX,
  TANGLE_UNIT_RADIANS,
  TICKS_PER_TIMOUT,
} from '../../src/data/constants';
import { wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { octagonalDistance } from '../../src/game/collision';
import { spawnExplosion, updateDebris } from '../../src/game/explosions';
import { updateSpawner } from '../../src/game/spawn';
import type { Enemy, EnemyKind, GameEvent, World } from '../../src/game/types';
import { enemyBrain, internalState } from '../../src/game/worldState';
import { makeWorld } from './fixtures';

const STALL_TICKS = MISSILE_TIMEOUT_TIMOUT * TICKS_PER_TIMOUT;

function unit(kind: EnemyKind, z = 6000): Enemy {
  return {
    id: 1,
    kind,
    pos: { x: 0, z },
    heading: Math.PI,
    y: 0,
    alive: true,
    state: 'approach',
    timer: 10,
  };
}

/** Spawns one unit into an empty world and says what it is. */
function spawnOne(world: World, seed: number): Enemy {
  world.enemies = [];
  internalState(world).nextUnitAt = 0;
  updateSpawner(world, createRng(seed));
  const spawned = world.enemies.at(-1);
  if (!spawned) throw new Error('nothing spawned');
  return spawned;
}

describe('updateSpawner', () => {
  it('keeps exactly one unit on the field', () => {
    const world = makeWorld();
    const events = updateSpawner(world, createRng(1));
    expect(events).toEqual<GameEvent[]>([{ type: 'enemySpawned', kind: 'tank' }]);
    expect(world.enemies).toHaveLength(1);

    // With one alive it does nothing at all.
    expect(updateSpawner(world, createRng(1))).toEqual([]);
    expect(world.enemies).toHaveLength(1);
  });

  it('gives the arrival its first decision on the next tick', () => {
    const world = makeWorld();
    updateSpawner(world, createRng(1));
    expect(world.enemies[0]!.timer).toBe(ENEMY_RESPAWN_TIMOUT);
  });

  it('waits for the last chunk of the dead unit to land, then replaces it', () => {
    const world = makeWorld();
    const dead = unit('tank');
    spawnExplosion(world, dead, createRng(1));
    // The enemy pass flies the debris on the same tick the shell landed, so the
    // test has to as well or the booked tick will not line up.
    updateDebris(world);
    const landsAt = internalState(world).nextUnitAt;
    expect(landsAt).toBeGreaterThan(1);

    while (world.tick < landsAt) {
      expect(updateSpawner(world, createRng(1))).toEqual([]);
      expect(world.debris.length).toBeGreaterThan(0);
      world.tick += 1;
      updateDebris(world);
    }

    expect(world.debris).toEqual([]);
    expect(updateSpawner(world, createRng(1))).toEqual<GameEvent[]>([
      { type: 'enemySpawned', kind: 'tank' },
    ]);
  });

  it('sends nothing while the player is dead', () => {
    const world = makeWorld();
    world.player.alive = false;
    expect(updateSpawner(world, createRng(1))).toEqual([]);
    expect(world.enemies).toEqual([]);
  });

  it('sends only tanks until the score reaches the missile threshold', () => {
    const world = makeWorld();
    const kinds = new Set<EnemyKind>();
    for (let seed = 1; seed <= 40; seed += 1) kinds.add(spawnOne(world, seed).kind);
    expect([...kinds]).toEqual(['tank']);
  });

  it('mixes in missiles once the score allows, and announces them', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.missileThreshold;
    const kinds = new Set<EnemyKind>();
    const events: GameEvent[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      world.enemies = [];
      internalState(world).nextUnitAt = 0;
      internalState(world).nextUnitOverride = null;
      events.push(...updateSpawner(world, createRng(seed)));
      kinds.add(world.enemies.at(-1)!.kind);
    }
    expect(kinds.has('missile')).toBe(true);
    expect(events).toContainEqual<GameEvent>({ type: 'missileLaunched' });
    expect(internalState(world).missilesLaunched).toBeGreaterThan(0);
  });

  it('releases the missile high up, far off and near the player view direction', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.missileThreshold;
    let missile: Enemy | null = null;
    for (let seed = 1; seed <= 40 && !missile; seed += 1) {
      const spawned = spawnOne(world, seed);
      internalState(world).nextUnitOverride = null;
      if (spawned.kind === 'missile') missile = spawned;
    }
    expect(missile).not.toBeNull();
    expect(missile!.y).toBe(MISSILE_START_HEIGHT);
    expect(octagonalDistance(world.player.pos, missile!.pos)).toBeGreaterThan(
      ENEMY_SPAWN_NEAR_UNITS,
    );
    const offView = Math.abs(
      wrapAngle(Math.atan2(missile!.pos.x, missile!.pos.z) - world.player.heading),
    );
    expect(offView).toBeLessThanOrEqual((ENEMY_SPAWN_ANGLE_MASK + 1) * TANGLE_UNIT_RADIANS);
  });

  it('swaps the supertank in after the sixth missile, and back out 123 later', () => {
    // GetTankType reads a counter that starts at $FF, so five launches still read 4.
    const world = makeWorld();
    internalState(world).missilesLaunched = SUPERTANK_AFTER_MISSILES;
    expect(spawnOne(world, 1).kind).toBe('tank');
    internalState(world).missilesLaunched = SUPERTANK_AFTER_MISSILES + 1;
    expect(spawnOne(world, 1).kind).toBe('supertank');
    internalState(world).missilesLaunched = SUPERTANK_COUNTER_MAX + 1;
    expect(spawnOne(world, 1).kind).toBe('supertank');
    internalState(world).missilesLaunched = SUPERTANK_COUNTER_MAX + 2;
    expect(spawnOne(world, 1).kind).toBe('tank');
  });

  it('honours the forced tank after a missile has killed the player', () => {
    const world = makeWorld();
    world.score = 50000; // missiles are well in play
    internalState(world).nextUnitOverride = 'tank';
    expect(spawnOne(world, 3).kind).not.toBe('missile');
    expect(internalState(world).nextUnitOverride).toBeNull();
  });

  it('arrives at one of the two ROM distances, inside the ladder window', () => {
    const world = makeWorld();
    for (let seed = 1; seed <= 20; seed += 1) {
      const spawned = spawnOne(world, seed);
      const distance = octagonalDistance(world.player.pos, spawned.pos);
      const nearest = Math.min(
        Math.abs(distance - ENEMY_SPAWN_NEAR_UNITS),
        Math.abs(distance - ENEMY_SPAWN_FAR_UNITS),
      );
      // The octagonal metric reads a diagonal long, so allow its 6 per cent.
      expect(nearest / distance).toBeLessThan(0.07);

      const bearing = Math.atan2(spawned.pos.x, spawned.pos.z);
      const window = (ENEMY_SPAWN_ANGLE_MASKS[1]! + 1) * TANGLE_UNIT_RADIANS;
      expect(Math.abs(wrapAngle(bearing - world.player.heading))).toBeLessThanOrEqual(window);
      // It no longer turns up already lined up, but it means to attack: the goal
      // is the bearing back at the player, and the hull is within the scatter of it.
      const facing = wrapAngle(spawned.heading - (bearing + Math.PI));
      expect(Math.abs(facing)).toBeLessThanOrEqual(
        ENEMY_SPAWN_HEADING_SCATTER * TANGLE_UNIT_RADIANS + 1e-9,
      );
      expect(Math.abs(wrapAngle(enemyBrain(spawned).goal - (bearing + Math.PI)))).toBeLessThan(
        1e-9,
      );
    }
  });

  it('opens the arrival window up as the player gets ahead', () => {
    const behind = makeWorld();
    const ahead = makeWorld();
    ahead.score = 20000;

    const spread = (world: World): number => {
      let widest = 0;
      for (let seed = 1; seed <= 60; seed += 1) {
        const spawned = spawnOne(world, seed);
        const bearing = Math.atan2(spawned.pos.x, spawned.pos.z);
        widest = Math.max(widest, Math.abs(wrapAngle(bearing - world.player.heading)));
      }
      return widest;
    };

    expect(spread(ahead)).toBeGreaterThan(spread(behind));
  });

  it('replaces a missile that has flown away and stayed away, with a tank', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.missileThreshold;
    const missile = unit('missile', 30000);
    world.enemies = [missile];
    enemyBrain(missile).outOfRangeTicks = STALL_TICKS;

    const events = updateSpawner(world, createRng(1));
    expect(world.enemies).not.toContain(missile);
    expect(events).toEqual<GameEvent[]>([{ type: 'enemySpawned', kind: 'tank' }]);
    // Withdrawn, not destroyed: no debris and no points.
    expect(world.debris).toEqual([]);
    expect(world.score).toBe(DEFAULT_OPTIONS.missileThreshold);
  });

  it('answers a tank the player has been dodging for a minute with a missile', () => {
    const world = makeWorld();
    const tank = unit('tank');
    world.enemies = [tank];
    enemyBrain(tank).aliveTicks = STALL_TICKS;

    const events = updateSpawner(world, createRng(1));
    expect(world.enemies).not.toContain(tank);
    // A missile arrives whatever the score is - this one is still on zero.
    expect(events).toContainEqual<GameEvent>({ type: 'enemySpawned', kind: 'missile' });
  });

  it('keeps every arrival at least half the radar range away', () => {
    const world = makeWorld();
    for (let seed = 1; seed <= 40; seed += 1) {
      const spawned = spawnOne(world, seed);
      const distance = octagonalDistance(world.player.pos, spawned.pos);
      expect(distance).toBeGreaterThanOrEqual(ENEMY_IN_RANGE_UNITS / 2);
    }
  });

  it('lands the arrival off its aim, so it has to swing round before it can shoot', () => {
    const world = makeWorld();
    let widest = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const spawned = spawnOne(world, seed);
      if (spawned.kind === 'missile') continue;
      const bearing = Math.atan2(
        spawned.pos.x - world.player.pos.x,
        spawned.pos.z - world.player.pos.z,
      );
      widest = Math.max(widest, Math.abs(wrapAngle(spawned.heading - (bearing + Math.PI))));
    }
    // Well past the 2 TANGLE units the tank is allowed to fire from.
    expect(widest).toBeGreaterThan(ENEMY_SPAWN_HEADING_SCATTER * TANGLE_UNIT_RADIANS * 0.5);
  });

  it('leaves the saucer out of the one-unit rule', () => {
    const world = makeWorld();
    world.enemies = [{ ...unit('saucer'), state: 'wander' }];
    expect(updateSpawner(world, createRng(1))).toEqual<GameEvent[]>([
      { type: 'enemySpawned', kind: 'tank' },
    ]);
    expect(world.enemies).toHaveLength(2);
  });
});
