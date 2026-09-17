import { afterEach, describe, expect, it } from 'vitest';
import {
  DEBRIS_PIECES,
  DEFAULT_OPTIONS,
  ENEMY_EXPERT_SCORE,
  ENEMY_IN_RANGE_UNITS,
  MISSILE_HITTABLE_BELOW,
  RADAR_SWEEP_TICKS_PER_REV,
  SAUCER_DEATH_TICKS,
  SAUCER_MIN_SCORE,
  SHELL_LIFE_TICKS,
  SHELL_STEP_UNITS,
} from '../../src/data/constants';
import { createRng } from '../../src/engine/rng';
import { octagonalDistance } from '../../src/game/collision';
import {
  enemySystems,
  registerEnemySystems,
  resolveShellHits,
  updateEnemies,
} from '../../src/game/enemies';
import { pointsFor } from '../../src/game/score';
import type { Enemy, EnemyKind, GameEvent, Shell } from '../../src/game/types';
import { createWorld, systems, updateWorld } from '../../src/game/world';
import { internalState } from '../../src/game/worldState';
import { makeWorld } from './fixtures';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

const target = (kind: EnemyKind, y = 0): Enemy => ({
  id: 1,
  kind,
  pos: { x: 0, z: 3000 },
  heading: 0,
  y,
  alive: true,
  state: 'approach',
  timer: 10,
});

/** A shell of the given owner, right on top of the target at (0, 3000). */
const shellOn = (owner: Shell['owner'], pos = { x: 0, z: 3000 }): Shell => ({
  id: 1,
  owner,
  pos,
  y: 0,
  heading: 0,
  ticksLeft: SHELL_LIFE_TICKS,
});

/** Runs the whole world, enemy systems included, and collects every event. */
function play(ticks: number, seed = 1, input: InputState = NEUTRAL_INPUT) {
  systems.length = 0;
  registerEnemySystems();
  const rng = createRng(seed);
  const world = createWorld(createRng(seed));
  const events: GameEvent[] = [];
  const liveUnits: number[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    events.push(...updateWorld(world, input, rng));
    liveUnits.push(world.enemies.filter((enemy) => enemy.alive && enemy.kind !== 'saucer').length);
  }
  return { world, events, liveUnits };
}

afterEach(() => {
  systems.length = 0;
});

describe('registerEnemySystems', () => {
  it('installs the enemies and the spawner, in that order, once', () => {
    systems.length = 0;
    registerEnemySystems();
    registerEnemySystems();
    expect(systems).toEqual([...enemySystems]);
  });

  it('is already installed by importing the module', () => {
    // The import at the top of this file did it, before anything cleared the list.
    expect(enemySystems).toHaveLength(2);
  });
});

describe('resolveShellHits', () => {
  it('destroys the unit a player shell reaches, scores it and scatters it', () => {
    const world = makeWorld();
    const tank = target('tank');
    world.enemies = [tank];
    world.shells = [shellOn('player')];

    const events = resolveShellHits(world, createRng(1));

    expect(events).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'tank',
      points: 1000,
    });
    expect(world.score).toBe(1000);
    expect(world.enemies).toEqual([]);
    expect(world.debris).toHaveLength(DEBRIS_PIECES);
    expect(world.shells).toEqual([]);
  });

  it('pays the ROM rate for every kind', () => {
    for (const kind of ['tank', 'supertank', 'missile', 'saucer'] as const) {
      const world = makeWorld();
      world.enemies = [target(kind)];
      world.shells = [shellOn('player')];
      resolveShellHits(world, createRng(1));
      expect(world.score, kind).toBe(pointsFor(kind));
    }
  });

  it('cannot touch a missile that is still high up', () => {
    const world = makeWorld();
    const high = target('missile', MISSILE_HITTABLE_BELOW);
    world.enemies = [high];
    world.shells = [shellOn('player')];
    expect(resolveShellHits(world, createRng(1))).toEqual([]);
    expect(high.alive).toBe(true);
    expect(world.shells).toHaveLength(1);

    high.y = MISSILE_HITTABLE_BELOW - 1;
    expect(resolveShellHits(world, createRng(1))).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'missile',
      points: 2000,
    });
  });

  it('catches a shell that flew past the enemy inside one tick', () => {
    // A tick of flight is four sub-steps of 256 units - wider than any hit radius -
    // so the shell has to be tested where it passed, not only where it stopped.
    const world = makeWorld();
    const tank = target('tank');
    world.enemies = [tank];
    world.shells = [shellOn('player', { x: 0, z: 3000 + 3 * SHELL_STEP_UNITS })];

    expect(resolveShellHits(world, createRng(1))).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'tank',
      points: 1000,
    });
  });

  it('pays nothing when the enemy shoots the saucer down', () => {
    const world = makeWorld();
    const saucer = target('saucer');
    world.enemies = [saucer];
    world.shells = [shellOn('enemy')];

    const events = resolveShellHits(world, createRng(1));

    expect(events).toEqual<GameEvent[]>([{ type: 'enemyDestroyed', kind: 'saucer', points: 0 }]);
    expect(world.score).toBe(0);
    // The saucer stays on the field for its flare and fade.
    expect(world.enemies).toEqual([saucer]);
    expect(saucer.alive).toBe(false);
    expect(saucer.timer).toBe(SAUCER_DEATH_TICKS);
  });

  it('kills the player with an enemy shell, and counts it for the difficulty ramp', () => {
    const world = makeWorld();
    world.enemies = [target('supertank')];
    world.shells = [shellOn('enemy', { x: 0, z: 0 })];

    const events = resolveShellHits(world, createRng(1));

    expect(events).toEqual<GameEvent[]>([{ type: 'playerDestroyed', by: 'supertank' }]);
    expect(world.player.alive).toBe(false);
    expect(internalState(world).playerDeaths).toBe(1);
    expect(internalState(world).nextUnitOverride).toBe('tank');
    expect(world.shells).toEqual([]);
  });

  it('lets the two shells fly straight through each other', () => {
    // There is no projectile-versus-projectile test anywhere in the ROM.
    const world = makeWorld();
    world.enemies = [target('tank', 0)];
    world.enemies[0]!.pos = { x: 0, z: 20000 };
    world.shells = [shellOn('player', { x: 0, z: 1000 }), shellOn('enemy', { x: 0, z: 1000 })];

    expect(resolveShellHits(world, createRng(1))).toEqual([]);
    expect(world.shells).toHaveLength(2);
  });

  it('awards the bonus tank exactly once as the score crosses the threshold', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.bonusThreshold - pointsFor('tank');
    world.nextBonusAt = DEFAULT_OPTIONS.bonusThreshold;
    world.lives = 3;

    world.enemies = [target('tank')];
    world.shells = [shellOn('player')];
    expect(resolveShellHits(world, createRng(1))).toContainEqual<GameEvent>({ type: 'extraLife' });
    expect(world.lives).toBe(4);

    world.enemies = [target('tank')];
    world.shells = [shellOn('player')];
    const again = resolveShellHits(world, createRng(1));
    expect(again.some((event) => event.type === 'extraLife')).toBe(false);
    expect(world.lives).toBe(4);
  });
});

describe('updateEnemies', () => {
  it('pings the radar once per sweep revolution as it passes the enemy', () => {
    systems.length = 0;
    registerEnemySystems();
    const world = makeWorld();
    // A score that keeps the tank attacking, so it spends these ticks pivoting
    // towards the player and its bearing - the thing being measured - holds still.
    world.score = ENEMY_EXPERT_SCORE;
    world.enemies = [target('tank')];

    const pings: number[] = [];
    for (let tick = 0; tick < 100; tick += 1) {
      const events = updateWorld(world, NEUTRAL_INPUT, createRng(1));
      if (events.some((event) => event.type === 'radarPing')) pings.push(world.tick);
    }

    // One flash per revolution: the blip is not a steady light.
    expect(pings.length).toBeGreaterThanOrEqual(4);
    for (const [index, tick] of pings.entries()) {
      if (index === 0) continue;
      const gap = tick - pings[index - 1]!;
      expect(gap).toBeGreaterThanOrEqual(Math.floor(RADAR_SWEEP_TICKS_PER_REV));
      expect(gap).toBeLessThanOrEqual(Math.ceil(RADAR_SWEEP_TICKS_PER_REV));
    }
  });

  it('says nothing about an enemy that is out of radar range', () => {
    systems.length = 0;
    const world = makeWorld();
    const far = target('tank');
    far.pos = { x: 24000, z: 24000 };
    world.enemies = [far];
    let pings = 0;
    for (let tick = 0; tick < 2 * Math.round(RADAR_SWEEP_TICKS_PER_REV); tick += 1) {
      // The sweep still turns; the enemy is simply beyond the radar's reach.
      updateWorld(world, NEUTRAL_INPUT, createRng(1));
      pings += updateEnemies(world, NEUTRAL_INPUT, createRng(1)).filter(
        (event) => event.type === 'radarPing',
      ).length;
    }
    expect(pings).toBe(0);
    expect(octagonalDistance(world.player.pos, far.pos)).toBeGreaterThan(ENEMY_IN_RANGE_UNITS);
  });
});

describe('the enemy systems in the world', () => {
  it('keeps one unit on the field, and never two', () => {
    const { liveUnits, events } = play(400);
    expect(Math.max(...liveUnits)).toBe(1);
    expect(events.filter((event) => event.type === 'enemySpawned').length).toBeGreaterThan(0);
  });

  it('replays identically from the same seed', () => {
    const a = play(300, 99);
    const b = play(300, 99);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(a.events).toEqual(b.events);
  });

  it('lets a saucer share the field with a unit once the score allows', () => {
    systems.length = 0;
    registerEnemySystems();
    const rng = createRng(5);
    const world = createWorld(createRng(5));
    world.score = SAUCER_MIN_SCORE;
    let sawBoth = false;
    for (let tick = 0; tick < 300 && !sawBoth; tick += 1) {
      updateWorld(world, NEUTRAL_INPUT, rng);
      const saucers = world.enemies.filter((enemy) => enemy.kind === 'saucer');
      const units = world.enemies.filter((enemy) => enemy.kind !== 'saucer' && enemy.alive);
      sawBoth = saucers.length === 1 && units.length === 1;
    }
    expect(sawBoth).toBe(true);
  });

  it('keeps the score a multiple of 1000 however long it runs', () => {
    const { world } = play(600, 7, { ...NEUTRAL_INPUT, fire: true });
    expect(world.score % 1000).toBe(0);
  });
});
