import { afterEach, describe, expect, it } from 'vitest';
import {
  DEBRIS_PIECES,
  DEFAULT_OPTIONS,
  ENEMY_EXPERT_SCORE,
  ENEMY_IN_RANGE_UNITS,
  MISSILE_HITTABLE_BELOW,
  MISSILE_TIMEOUT_TIMOUT,
  OBSTACLE_TANK_RADIUS,
  RADAR_SWEEP_TICKS_PER_REV,
  SAUCER_DEATH_TICKS,
  SAUCER_MIN_SCORE,
  SHELL_LIFE_TICKS,
  SHELL_STEP_UNITS,
  TICKS_PER_TIMOUT,
} from '../../src/data/constants';
import { createRng } from '../../src/engine/rng';
import { octagonalDistance } from '../../src/game/collision';
import {
  enemySystems,
  fireEnemyShell,
  registerEnemySystems,
  updateEnemies,
} from '../../src/game/enemies';
import { pointsFor } from '../../src/game/score';
import { shellTargets, updateShells } from '../../src/game/shells';
import { updateSpawner } from '../../src/game/spawn';
import type { Enemy, EnemyKind, GameEvent, Shell, World } from '../../src/game/types';
import { createWorld, systems, updateWorld } from '../../src/game/world';
import { enemyBrain, internalState } from '../../src/game/worldState';
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
  shellTargets.length = 0;
});

describe('registerEnemySystems', () => {
  it('installs the enemies and the spawner, in that order, once', () => {
    systems.length = 0;
    shellTargets.length = 0;
    registerEnemySystems();
    registerEnemySystems();
    expect(systems).toEqual([...enemySystems]);
    // And the shell collision test, which updateShells runs on every sub-step.
    expect(shellTargets).toHaveLength(1);
  });
});

describe('resolveShellHits, through the sub-steps of a shell in flight', () => {
  /** A shell just short of the target at (0, 3000), flown one tick of sub-steps. */
  function fire(world: World, owner: Shell['owner'], from = 2800, seed = 1): GameEvent[] {
    registerEnemySystems();
    world.shells = [shellOn(owner, { x: 0, z: from })];
    return updateShells(world, createRng(seed));
  }

  it('destroys the unit a player shell reaches, scores it and scatters it', () => {
    const world = makeWorld();
    world.enemies = [target('tank')];

    const events = fire(world, 'player');

    expect(events).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'tank',
      points: 1000,
    });
    expect(world.score).toBe(1000);
    expect(world.enemies).toEqual([]);
    expect(world.debris).toHaveLength(DEBRIS_PIECES);
    // The spent shell comes off the field, and does not burst on anything else.
    expect(world.shells).toEqual([]);
    expect(events.some((event) => event.type === 'shellHitObstacle')).toBe(false);
  });

  it('pays the ROM rate for every kind', () => {
    for (const kind of ['tank', 'supertank', 'missile', 'saucer'] as const) {
      const world = makeWorld();
      world.enemies = [target(kind)];
      fire(world, 'player');
      expect(world.score, kind).toBe(pointsFor(kind));
    }
  });

  it('cannot touch a missile that is still high up', () => {
    const world = makeWorld();
    const high = target('missile', MISSILE_HITTABLE_BELOW);
    world.enemies = [high];

    expect(fire(world, 'player')).toEqual([]);
    expect(high.alive).toBe(true);
    expect(world.shells).toHaveLength(1);

    high.y = MISSILE_HITTABLE_BELOW - 1;
    expect(fire(world, 'player')).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'missile',
      points: 2000,
    });
  });

  it('kills the tank it passed even though it would burst on a pyramid later', () => {
    // CheckProjColl tests the unit, then the saucer, then the obstacle, and it does
    // all three on every sub-step: the tank is reached first, so the tank dies.
    const world = makeWorld();
    world.enemies = [target('tank')];
    world.obstacles = [
      {
        kind: 'box',
        pos: { x: 0, z: 3000 + 2 * SHELL_STEP_UNITS },
        heading: 0,
        radius: OBSTACLE_TANK_RADIUS.box,
      },
    ];

    const events = fire(world, 'player');

    expect(events).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'tank',
      points: 1000,
    });
    expect(events.some((event) => event.type === 'shellHitObstacle')).toBe(false);
  });

  it('catches a tank the shell passed mid-tick and left far behind', () => {
    // Four sub-steps of 256 units carry the shell well past the widest hit radius,
    // so a once-a-tick test would have missed this one entirely.
    const world = makeWorld();
    world.enemies = [target('tank')];

    const events = fire(world, 'player', 3000 - 2 * SHELL_STEP_UNITS + 100);

    expect(events).toContainEqual<GameEvent>({
      type: 'enemyDestroyed',
      kind: 'tank',
      points: 1000,
    });
  });

  it('never reaches back behind the firer', () => {
    // An enemy shell leaves the tank and flies forwards; a saucer sitting behind the
    // tank that fired is in no danger from it.
    const world = makeWorld();
    const shooter: Enemy = { ...target('tank'), pos: { x: 0, z: 0 }, heading: 0 };
    const saucer: Enemy = { ...target('saucer'), pos: { x: 0, z: -700 } };
    world.enemies = [shooter, saucer];
    registerEnemySystems();
    fireEnemyShell(world, shooter);

    const events = updateShells(world, createRng(1));

    expect(events).toEqual([]);
    expect(saucer.alive).toBe(true);
    expect(world.shells).toHaveLength(1);
  });

  it('pays nothing when the enemy shoots the saucer down', () => {
    const world = makeWorld();
    const saucer = target('saucer');
    world.enemies = [saucer];

    const events = fire(world, 'enemy');

    expect(events).toEqual<GameEvent[]>([{ type: 'enemyDestroyed', kind: 'saucer', points: 0 }]);
    expect(world.score).toBe(0);
    // The saucer stays on the field for its flare and fade.
    expect(world.enemies).toEqual([saucer]);
    expect(saucer.alive).toBe(false);
    expect(saucer.timer).toBe(SAUCER_DEATH_TICKS);
  });

  it('kills the player with an enemy shell, and names the unit that fired it', () => {
    const world = makeWorld();
    const shooter: Enemy = { ...target('supertank'), pos: { x: 0, z: 1200 }, heading: Math.PI };
    world.enemies = [shooter];
    registerEnemySystems();
    fireEnemyShell(world, shooter);
    // By the time it lands the supertank is scrap and a tank has taken its place,
    // so the kind has to have travelled with the shell.
    world.enemies = [target('tank')];

    const events = updateShells(world, createRng(1));

    expect(events).toEqual<GameEvent[]>([{ type: 'playerDestroyed', by: 'supertank' }]);
    expect(world.player.alive).toBe(false);
    expect(internalState(world).playerDeaths).toBe(1);
    expect(internalState(world).nextUnitOverride).toBe('tank');
    expect(world.shells).toEqual([]);
  });

  it('gives the surviving unit a fresh stall clock when a shell lands', () => {
    // A landed shell clears TIMOUT, so the spawner stops counting the player as
    // having evaded this tank.
    const world = makeWorld();
    const tank = target('tank');
    world.enemies = [tank];
    enemyBrain(tank).aliveTicks = 900;
    registerEnemySystems();
    world.shells = [shellOn('enemy', { x: 0, z: -SHELL_STEP_UNITS })];

    updateShells(world, createRng(1));

    expect(world.player.alive).toBe(false);
    expect(enemyBrain(tank).aliveTicks).toBe(0);
  });

  it('lets the two shells fly straight through each other', () => {
    // There is no projectile-versus-projectile test anywhere in the ROM.
    const world = makeWorld();
    world.enemies = [{ ...target('tank'), pos: { x: 0, z: 20000 } }];
    registerEnemySystems();
    world.shells = [
      shellOn('player', { x: 0, z: 1000 }),
      { ...shellOn('enemy', { x: 0, z: 1000 + 4 * SHELL_STEP_UNITS }), heading: Math.PI },
    ];

    expect(updateShells(world, createRng(1))).toEqual([]);
    expect(world.shells).toHaveLength(2);
  });

  it('awards the bonus tank exactly once as the score crosses the threshold', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.bonusThreshold - pointsFor('tank');
    world.nextBonusAt = DEFAULT_OPTIONS.bonusThreshold;
    world.lives = 3;

    world.enemies = [target('tank')];
    expect(fire(world, 'player')).toContainEqual<GameEvent>({ type: 'extraLife' });
    expect(world.lives).toBe(4);

    world.enemies = [target('tank')];
    const again = fire(world, 'player');
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
  it('puts the next unit up on the very tick the last chunk lands', () => {
    systems.length = 0;
    registerEnemySystems();
    const rng = createRng(3);
    const world = createWorld(createRng(3));
    // One tank, and a shell of the player's already on top of it.
    updateWorld(world, NEUTRAL_INPUT, rng);
    const doomed = world.enemies[0]!;
    world.shells = [shellOn('player', { ...doomed.pos })];

    let clearedAt = 0;
    let arrivedAt = 0;
    for (let tick = 0; tick < 200 && arrivedAt === 0; tick += 1) {
      const events = updateWorld(world, NEUTRAL_INPUT, rng);
      if (clearedAt === 0 && world.debris.length === 0 && world.tick > 1) clearedAt = world.tick;
      if (events.some((event) => event.type === 'enemySpawned')) arrivedAt = world.tick;
    }

    expect(clearedAt).toBeGreaterThan(1);
    expect(arrivedAt).toBe(clearedAt);
  });

  it('re-arms the in-range warning for each new arrival', () => {
    const world = makeWorld();
    const stalled = target('tank');
    world.enemies = [stalled];
    world.enemyInRange = true;
    enemyBrain(stalled).aliveTicks = MISSILE_TIMEOUT_TIMOUT * TICKS_PER_TIMOUT;

    updateSpawner(world, createRng(1));

    expect(world.enemies).not.toContain(stalled);
    expect(world.enemyInRange).toBe(false);
  });

  it('sweeps up a missile that destroyed itself on the player', () => {
    const world = makeWorld();
    const missile = target('missile');
    missile.pos = { x: 0, z: 700 };
    missile.heading = Math.PI;
    world.enemies = [missile];

    const events = updateEnemies(world, NEUTRAL_INPUT, createRng(1));

    expect(events).toContainEqual<GameEvent>({ type: 'playerDestroyed', by: 'missile' });
    expect(world.enemies).toEqual([]);
    expect(world.debris.length).toBeGreaterThan(0);
  });

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
