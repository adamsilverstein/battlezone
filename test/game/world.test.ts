import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  MOVE_STEP_UNITS,
  OBSTACLE_COUNT,
  PLAYER_OBSTACLE_RADIUS,
  RADAR_SWEEP_PER_TICK,
  RADAR_SWEEP_TICKS_PER_REV,
  SHELL_STEP_UNITS,
} from '../../src/data/constants';
import { TAU, wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { PLAYER_START } from '../../src/game/player';
import type { Enemy, GameEvent, Rng, World } from '../../src/game/types';
import { createEmptyWorld, createWorld, systems, updateWorld } from '../../src/game/world';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

const SWEEP_STEP = (RADAR_SWEEP_PER_TICK / 256) * TAU;

const sticks = (leftTread: -1 | 0 | 1, rightTread: -1 | 0 | 1): InputState => ({
  ...NEUTRAL_INPUT,
  leftTread,
  rightTread,
});

const enemyAt = (x: number, z: number): Enemy => ({
  id: 1,
  kind: 'tank',
  pos: { x, z },
  heading: 0,
  y: 0,
  alive: true,
  state: 'idle',
  timer: 0,
});

afterEach(() => {
  systems.length = 0;
});

describe('createWorld', () => {
  it('opens on the fixed battlefield with the player at the start', () => {
    const world = createWorld(createRng(1));
    expect(world.tick).toBe(0);
    expect(world.obstacles).toHaveLength(OBSTACLE_COUNT);
    expect(world.player.pos).toEqual(PLAYER_START);
    expect(world.player.heading).toBe(0);
    expect(world.player.alive).toBe(true);
    expect(world.enemies).toEqual([]);
    expect(world.shells).toEqual([]);
    expect(world.debris).toEqual([]);
    expect(world.radarAngle).toBe(0);
    expect(world.score).toBe(0);
  });

  it('starts with the DIP default lives and bonus, or whatever it is given', () => {
    expect(createWorld(createRng(1)).lives).toBe(DEFAULT_OPTIONS.lives);
    expect(createWorld(createRng(1)).nextBonusAt).toBe(DEFAULT_OPTIONS.bonusThreshold);
    expect(createWorld(createRng(1), { lives: 5 }).lives).toBe(5);
  });

  it('does not share the obstacle list between worlds', () => {
    const a = createWorld(createRng(1));
    const b = createWorld(createRng(1));
    expect(a.obstacles).not.toBe(b.obstacles);
    expect(a.obstacles).toEqual(b.obstacles);
  });
});

describe('createEmptyWorld', () => {
  it('is a world with no enemies, so the boot code keeps working', () => {
    const world = createEmptyWorld();
    expect(world.enemies).toEqual([]);
    expect(world.obstacles).toHaveLength(OBSTACLE_COUNT);
  });
});

describe('updateWorld', () => {
  it('advances the tick and drives the player', () => {
    const world = createWorld(createRng(1));
    updateWorld(world, sticks(1, 1), createRng(1));
    expect(world.tick).toBe(1);
    expect(world.player.pos.z).toBeCloseTo(2 * MOVE_STEP_UNITS, 9);
  });

  it('fires while the trigger is held, one shell at a time', () => {
    const world = createWorld(createRng(1));
    const fire: InputState = { ...NEUTRAL_INPUT, fire: true };
    expect(updateWorld(world, fire, createRng(1))).toEqual<GameEvent[]>([{ type: 'playerFired' }]);
    expect(updateWorld(world, fire, createRng(1))).toEqual([]);
    expect(world.shells).toHaveLength(1);
  });

  it('sweeps the radar and wraps it round', () => {
    const world = createWorld(createRng(1));
    updateWorld(world, NEUTRAL_INPUT, createRng(1));
    expect(world.radarAngle).toBeCloseTo(SWEEP_STEP, 12);
    for (let tick = 1; tick < 2 * RADAR_SWEEP_TICKS_PER_REV; tick += 1) {
      updateWorld(world, NEUTRAL_INPUT, createRng(1));
    }
    expect(world.radarAngle).toBeCloseTo(wrapAngle(world.tick * SWEEP_STEP), 9);
    expect(Math.abs(world.radarAngle)).toBeLessThanOrEqual(Math.PI);
  });

  it('runs the registered enemy systems in order, after the shells', () => {
    const calls: string[] = [];
    const world = createWorld(createRng(1));
    systems.push((w, input, rng) => {
      calls.push(`first ${w.tick} ${input.leftTread} ${typeof rng.next()}`);
      return [{ type: 'enemySpawned', kind: 'tank' }];
    });
    systems.push(() => {
      calls.push('second');
      return [];
    });
    const events = updateWorld(world, sticks(1, 1), createRng(1));
    expect(calls).toEqual(['first 1 1 number', 'second']);
    expect(events).toEqual<GameEvent[]>([{ type: 'enemySpawned', kind: 'tank' }]);
  });

  it('reports the player, then the shells, then the systems', () => {
    const world = createWorld(createRng(1));
    world.obstacles = [{ kind: 'boxShort', pos: { x: 0, z: 1200 }, heading: 0, radius: 960 }];
    world.shells = [
      { id: 1, owner: 'enemy', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 0.25 },
    ];
    systems.push(() => [{ type: 'saucerAppeared' }]);
    expect(updateWorld(world, sticks(1, 1), createRng(1))).toEqual<GameEvent[]>([
      { type: 'motionBlocked' },
      { type: 'shellExpired', owner: 'enemy', pos: { x: 0, z: SHELL_STEP_UNITS } },
      { type: 'saucerAppeared' },
    ]);
  });
});

describe('the real battlefield', () => {
  it('stops the player short of the short box due north of the start', () => {
    // PTBLX1/PTBLY1 entry 1 is a short box at ($0000, $4000), straight ahead.
    const world = createWorld(createRng(1));
    let blocked = 0;
    for (let tick = 0; tick < 200 && blocked === 0; tick += 1) {
      const events = updateWorld(world, sticks(1, 1), createRng(1));
      if (events.some((e) => e.type === 'motionBlocked')) blocked = tick + 1;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(world.player.pos.z).toBeLessThan(0x4000);
    expect(0x4000 - world.player.pos.z).toBeGreaterThanOrEqual(PLAYER_OBSTACLE_RADIUS);
  });

  it('lets a shell fly straight over that same short box', () => {
    const world = createWorld(createRng(1));
    const fire: InputState = { ...NEUTRAL_INPUT, fire: true };
    let passed = false;
    for (let tick = 0; tick < 40 && !passed; tick += 1) {
      const events = updateWorld(world, tick === 0 ? fire : NEUTRAL_INPUT, createRng(1));
      expect(events.some((e) => e.type === 'shellHitObstacle')).toBe(false);
      const shell = world.shells[0];
      expect(shell, `tick ${tick}`).toBeDefined();
      passed = (shell?.pos.z ?? 0) > 0x4000 + PLAYER_OBSTACLE_RADIUS;
    }
    expect(passed).toBe(true);
  });
});

describe('updateWorld range flags', () => {
  it('raises the in-range alert once, and drops it silently', () => {
    const world = createWorld(createRng(1));
    world.enemies = [enemyAt(0, 20000)];
    expect(updateWorld(world, NEUTRAL_INPUT, createRng(1))).toEqual<GameEvent[]>([
      { type: 'enemyInRange' },
    ]);
    expect(world.enemyInRange).toBe(true);
    expect(updateWorld(world, NEUTRAL_INPUT, createRng(1))).toEqual([]);

    // Out past the radar's reach: the octagonal distance on the diagonal.
    world.enemies = [enemyAt(25000, 25000)];
    expect(updateWorld(world, NEUTRAL_INPUT, createRng(1))).toEqual([]);
    expect(world.enemyInRange).toBe(false);
  });

  it('ignores dead enemies', () => {
    const world = createWorld(createRng(1));
    world.enemies = [{ ...enemyAt(0, 5000), alive: false }];
    updateWorld(world, NEUTRAL_INPUT, createRng(1));
    expect(world.enemyInRange).toBe(false);
    expect(world.targetInSights).toBe(false);
  });

  it('locks the reticle only when the enemy is nearly dead ahead', () => {
    const world = createWorld(createRng(1));
    world.enemies = [enemyAt(0, 5000)];
    updateWorld(world, NEUTRAL_INPUT, createRng(1));
    expect(world.targetInSights).toBe(true);

    world.enemies = [enemyAt(5000, 5000)];
    updateWorld(world, NEUTRAL_INPUT, createRng(1));
    expect(world.targetInSights).toBe(false);
  });
});

describe('determinism', () => {
  /** A scripted drive: turn, charge, fire, reverse, repeat. */
  function scripted(tick: number): InputState {
    const phase = tick % 16;
    const left = phase < 4 ? 1 : phase < 8 ? -1 : phase < 12 ? 1 : 0;
    const right = phase < 4 ? -1 : phase < 8 ? -1 : phase < 12 ? 1 : 1;
    return { ...NEUTRAL_INPUT, leftTread: left, rightTread: right, fire: phase % 5 === 0 };
  }

  /** Stands in for the enemy systems task 6 registers, and draws on the Rng. */
  function wanderingEnemy(world: World, _input: InputState, rng: Rng) {
    const enemy = world.enemies[0];
    if (!enemy) {
      world.enemies.push(enemyAt(rng.int(10000), rng.int(10000)));
      return [{ type: 'enemySpawned', kind: 'tank' } as const];
    }
    enemy.pos.x += rng.int(200) - 100;
    enemy.pos.z += rng.int(200) - 100;
    return [];
  }

  function run(seed: number, ticks: number): { world: World; events: GameEvent[] } {
    systems.length = 0;
    systems.push(wanderingEnemy);
    const rng = createRng(seed);
    const world = createWorld(createRng(seed));
    const events: GameEvent[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      events.push(...updateWorld(world, scripted(tick), rng));
    }
    return { world, events };
  }

  it('replays identically from the same seed and inputs', () => {
    const a = run(1234, 300);
    const b = run(1234, 300);
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
    expect(a.events).toEqual(b.events);
  });

  it('diverges on a different seed', () => {
    const a = run(1234, 300);
    const c = run(4321, 300);
    expect(JSON.stringify(a.world)).not.toBe(JSON.stringify(c.world));
  });
});
