import { describe, expect, it } from 'vitest';
import {
  ENEMY_ACTION_AFTER_COLLISION,
  ENEMY_FIRE_GRACE_TICKS,
  ENEMY_FTIMER_MAX,
  ENEMY_STOP_CLOSING_UNITS,
  MOVE_STEP_UNITS,
  OBSTACLE_TANK_RADIUS,
  ROOKIE_FIRE_MAX_SCORE,
  ROOKIE_FIRE_MAX_TDIST,
  TANGLE_UNIT_RADIANS,
  TANK_TANK_RADIUS,
  TDIST_UNIT,
  TICK_HZ,
} from '../../src/data/constants';
import { wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { bearingTo, octagonalDistance } from '../../src/game/collision';
import { TURN_STEP_RADIANS } from '../../src/game/player';
import { aggressionTier, fireEnemyShell, updateTank } from '../../src/game/enemies/tank';
import type { Enemy, GameEvent, Obstacle, World } from '../../src/game/types';
import { enemyBrain, internalState } from '../../src/game/worldState';
import { makeWorld } from './fixtures';

/**
 * A tank up the +Z axis from the player at the origin, facing away from them and
 * past its firing grace period.
 */
function battle(options: { x?: number; z?: number; heading?: number; score?: number } = {}) {
  const world = makeWorld();
  // Two units of skill: the ladder attacks, and the beginner handicap is lifted.
  world.score = options.score ?? ROOKIE_FIRE_MAX_SCORE;
  const enemy: Enemy = {
    id: 1,
    kind: 'tank',
    pos: { x: options.x ?? 0, z: options.z ?? 5000 },
    heading: options.heading ?? 0,
    y: 0,
    alive: true,
    state: 'approach',
    timer: 0,
  };
  world.enemies = [enemy];
  const brain = enemyBrain(enemy);
  brain.ftimer = ENEMY_FIRE_GRACE_TICKS;
  return { world, enemy, brain };
}

/** How far off the bearing to the player the tank is pointing. */
function aimError(world: World, enemy: Enemy): number {
  return Math.abs(wrapAngle(bearingTo(enemy.pos, world.player.pos) - enemy.heading));
}

function run(world: World, enemy: Enemy, ticks: number, seed = 1): GameEvent[] {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) events.push(...updateTank(world, enemy, rng));
  return events;
}

describe('aggressionTier', () => {
  it('climbs as the player scores and falls back as the enemy kills them', () => {
    const world = makeWorld();
    expect(aggressionTier(world)).toBe(1);

    world.score = 3000;
    expect(aggressionTier(world)).toBe(2);
    world.score = 9000;
    expect(aggressionTier(world)).toBe(3);

    internalState(world).playerDeaths = 4;
    expect(aggressionTier(world)).toBe(2);
    internalState(world).playerDeaths = 9;
    expect(aggressionTier(world)).toBe(1);
    internalState(world).playerDeaths = 12;
    expect(aggressionTier(world)).toBe(0);
  });

  it('is at its meanest past 100000 however many times it has won', () => {
    const world = makeWorld();
    world.score = 100000;
    internalState(world).playerDeaths = 200;
    expect(aggressionTier(world)).toBe(3);
  });
});

describe('updateTank', () => {
  it('turns towards the player and fires once it is lined up', () => {
    const { world, enemy } = battle();
    const opening = aimError(world, enemy);

    const events = run(world, enemy, 200);

    expect(aimError(world, enemy)).toBeLessThan(opening);
    expect(events).toContainEqual<GameEvent>({ type: 'enemyFired' });
    expect(world.shells.some((shell) => shell.owner === 'enemy')).toBe(true);
    expect(enemy.state).toMatch(/align|fire|approach/);
  });

  it('pivots two steps a tick while it is badly off target', () => {
    const { world, enemy, brain } = battle({ heading: 0 });
    brain.goal = Math.PI / 2;
    enemy.timer = 40; // no re-decision, so the goal stands

    updateTank(world, enemy, createRng(1));
    expect(enemy.heading).toBeCloseTo(2 * TURN_STEP_RADIANS, 9);
  });

  it('closes on the player, but stops short of him', () => {
    const { world, enemy, brain } = battle({ z: ENEMY_STOP_CLOSING_UNITS + 4 * MOVE_STEP_UNITS });
    brain.goal = bearingTo(enemy.pos, world.player.pos);
    enemy.heading = brain.goal;

    run(world, enemy, 40);

    const distance = octagonalDistance(enemy.pos, world.player.pos);
    expect(distance).toBeLessThan(ENEMY_STOP_CLOSING_UNITS + 4 * MOVE_STEP_UNITS);
    expect(distance).toBeGreaterThanOrEqual(TANK_TANK_RADIUS);
  });

  it('backs out of an obstacle it drives into, and stops to think afterwards', () => {
    const wall: Obstacle = {
      kind: 'box',
      pos: { x: 0, z: 4000 },
      heading: 0,
      radius: OBSTACLE_TANK_RADIUS.box,
    };
    const { world, enemy, brain } = battle({
      z: 4000 + OBSTACLE_TANK_RADIUS.box + MOVE_STEP_UNITS,
    });
    world.obstacles = [wall];
    brain.goal = bearingTo(enemy.pos, world.player.pos);
    enemy.heading = brain.goal;
    const started = { ...enemy.pos };

    updateTank(world, enemy, createRng(1));
    expect(enemy.state).toBe('retreat');
    expect(enemy.timer).toBe(ENEMY_ACTION_AFTER_COLLISION);
    expect(enemy.pos).toEqual(started);

    // It reverses and turns while it backs out, away from the player.
    updateTank(world, enemy, createRng(1));
    expect(octagonalDistance(enemy.pos, world.player.pos)).toBeGreaterThan(
      octagonalDistance(started, world.player.pos),
    );
    expect(enemy.heading).not.toBe(brain.goal);
  });

  it('does not back off after bumping the player', () => {
    const { world, enemy, brain } = battle({ z: TANK_TANK_RADIUS - 1 });
    brain.goal = bearingTo(enemy.pos, world.player.pos);
    enemy.heading = brain.goal;
    run(world, enemy, 5);
    expect(enemy.state).not.toBe('retreat');
  });

  it('holds its fire for the first two seconds of its life', () => {
    const { world, enemy, brain } = battle();
    brain.ftimer = 0;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;

    const early = run(world, enemy, ENEMY_FIRE_GRACE_TICKS - 2);
    expect(early.some((event) => event.type === 'enemyFired')).toBe(false);

    const later = run(world, enemy, 4);
    expect(later).toContainEqual<GameEvent>({ type: 'enemyFired' });
  });

  it('gives the arrival a full three seconds before its cannon is live', () => {
    const { world, enemy, brain } = battle({ score: 50000 });
    brain.ftimer = 0;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;

    // The deviation is quoted in seconds, so pin the seconds and the tick the
    // cannon comes live on: `ageEnemy` runs first, so tick `grace` is the earliest
    // that may fire and everything before it must be silent.
    expect(ENEMY_FIRE_GRACE_TICKS / TICK_HZ).toBeGreaterThanOrEqual(3);

    const early = run(world, enemy, ENEMY_FIRE_GRACE_TICKS - 1);
    expect(early.some((event) => event.type === 'enemyFired')).toBe(false);

    expect(run(world, enemy, 1)).toContainEqual<GameEvent>({ type: 'enemyFired' });
  });

  it('keeps the beginner handicap on well past the first few kills', () => {
    // Five thousand points - several tanks in - and it still will not shoot the
    // player in the back.
    const { world, enemy, brain } = battle({ z: -6000, score: 5000 });
    world.player.heading = 0;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;
    expect(run(world, enemy, 30).some((event) => event.type === 'enemyFired')).toBe(false);
  });

  it('only shoots a beginner from in front and from close range', () => {
    // Score under 2000: the enemy lines up behind the player and holds its fire.
    const { world, enemy, brain } = battle({ z: -6000, score: 1000 });
    world.player.heading = 0;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;
    expect(run(world, enemy, 30).some((event) => event.type === 'enemyFired')).toBe(false);

    // Close in front of the player, it shoots.
    const near = battle({ z: ROOKIE_FIRE_MAX_TDIST * TDIST_UNIT - 1000, score: 1000 });
    near.enemy.heading = bearingTo(near.enemy.pos, near.world.player.pos);
    near.brain.goal = near.enemy.heading;
    expect(run(near.world, near.enemy, 30)).toContainEqual<GameEvent>({ type: 'enemyFired' });
  });

  it('drops the handicap once it has been alive long enough', () => {
    const { world, enemy, brain } = battle({ z: -6000, score: 1000 });
    brain.ftimer = ENEMY_FTIMER_MAX;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;
    expect(run(world, enemy, 10)).toContainEqual<GameEvent>({ type: 'enemyFired' });
  });

  it('never shoots at a dead player', () => {
    const { world, enemy, brain } = battle();
    world.player.alive = false;
    enemy.heading = bearingTo(enemy.pos, world.player.pos);
    brain.goal = enemy.heading;
    expect(run(world, enemy, 30).some((event) => event.type === 'enemyFired')).toBe(false);
  });

  it('circles the player instead of charging when it is level on points', () => {
    // Skill zero is "evade": the goal comes out 90 degrees off the bearing to the
    // player.  The ladder tosses a coin for attacking first, so try a few seeds.
    let circled = false;
    for (let seed = 1; seed < 30 && !circled; seed += 1) {
      const { world, enemy } = battle({ score: 0 });
      updateTank(world, enemy, createRng(seed));
      if (enemy.state !== 'circle') continue;
      circled = true;
      const bearing = bearingTo(enemy.pos, world.player.pos);
      expect(Math.abs(wrapAngle(enemyBrain(enemy).goal - bearing))).toBeCloseTo(Math.PI / 2, 9);
    }
    expect(circled).toBe(true);
  });
});

describe('fireEnemyShell', () => {
  it('puts one shell in the air from the tank, pointing where it points', () => {
    const { world, enemy } = battle();
    enemy.heading = 1.25;
    expect(fireEnemyShell(world, enemy)).toEqual<GameEvent[]>([{ type: 'enemyFired' }]);
    expect(world.shells).toHaveLength(1);
    expect(world.shells[0]).toMatchObject({
      owner: 'enemy',
      pos: enemy.pos,
      heading: 1.25,
      y: 0,
    });
  });

  it('refuses while the enemy already has a shell in flight', () => {
    const { world, enemy } = battle();
    fireEnemyShell(world, enemy);
    expect(fireEnemyShell(world, enemy)).toEqual([]);
    expect(world.shells).toHaveLength(1);
  });

  it('fires happily while a player shell is in the air', () => {
    const { world, enemy } = battle();
    world.shells.push({
      id: 99,
      owner: 'player',
      pos: { x: 0, z: 0 },
      y: 0,
      heading: 0,
      ticksLeft: 10,
    });
    expect(fireEnemyShell(world, enemy)).toEqual<GameEvent[]>([{ type: 'enemyFired' }]);
    expect(world.shells).toHaveLength(2);
  });

  it('aims within a couple of degrees, not roughly', () => {
    // FIREIT refuses while the heading error is 2 TANGLE units or more.
    const { world, enemy, brain } = battle();
    brain.goal = enemy.heading;
    enemy.heading = bearingTo(enemy.pos, world.player.pos) + 3 * TANGLE_UNIT_RADIANS;
    enemy.timer = 100;
    expect(run(world, enemy, 1).some((event) => event.type === 'enemyFired')).toBe(false);
  });
});
