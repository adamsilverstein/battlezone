import { describe, expect, it } from 'vitest';
import {
  DEBRIS_PIECES,
  DEFAULT_OPTIONS,
  MISSILE_CLIMB_PER_TICK,
  MISSILE_LEVITATE_TOP,
  MISSILE_SPEED_MULTIPLIER,
  MISSILE_START_HEIGHT,
  MISSILE_SWOOP_TDIST_MIN,
  MISSILE_WEAVE_SIGN_TICKS,
  MOVE_STEP_UNITS,
  OBSTACLE_TANK_RADIUS,
  SCORE_UNIT,
  TANGLE_UNIT_RADIANS,
  TANK_MISSILE_RADIUS,
  TDIST_UNIT,
} from '../../src/data/constants';
import { TAU, wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { straightInDistance, updateMissile } from '../../src/game/enemies/missile';
import type { Enemy, GameEvent, Obstacle, World } from '../../src/game/types';
import { enemyBrain, internalState } from '../../src/game/worldState';
import { makeWorld } from './fixtures';

/**
 * How far out the missile gives up weaving on a fresh game, in world units.  On the
 * default 10000 missile threshold that is `TDIST` 10 + 25 = 35, read straight off
 * the ROM's BCD tables rather than recomputed from them here.
 */
const STRAIGHT_IN_UNITS = 35 * TDIST_UNIT;

/** A missile inbound down the +Z axis at the player at the origin. */
function inbound(options: { z?: number; y?: number; heading?: number } = {}) {
  const world = makeWorld();
  const enemy: Enemy = {
    id: 1,
    kind: 'missile',
    pos: { x: 0, z: options.z ?? 4000 },
    heading: options.heading ?? Math.PI,
    y: options.y ?? 0,
    alive: true,
    state: 'swoop',
    timer: 0,
  };
  world.enemies = [enemy];
  enemyBrain(enemy).goal = Math.PI;
  return { world, enemy, brain: enemyBrain(enemy) };
}

function run(world: World, enemy: Enemy, ticks: number, seed = 1): GameEvent[] {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    world.tick += 1;
    events.push(...updateMissile(world, enemy, rng));
  }
  return events;
}

describe('straightInDistance', () => {
  it('reads the swoop bias as the BCD 25000 points it is, not as 37', () => {
    const world = makeWorld();
    expect(straightInDistance(world)).toBe(STRAIGHT_IN_UNITS);
    expect(straightInDistance(world)).toBe(8960);
  });

  it('shrinks to the floor by the time the score reaches the threshold plus 25000', () => {
    const world = makeWorld();
    world.score = DEFAULT_OPTIONS.missileThreshold + 25 * SCORE_UNIT;
    expect(straightInDistance(world)).toBe(MISSILE_SWOOP_TDIST_MIN * TDIST_UNIT);

    // And it is still above the floor just before that: a mid-game missile drives
    // straight in from further out than a late-game one.
    world.score = DEFAULT_OPTIONS.missileThreshold;
    expect(straightInDistance(world)).toBeGreaterThan(MISSILE_SWOOP_TDIST_MIN * TDIST_UNIT);
    expect(straightInDistance(world)).toBeLessThan(STRAIGHT_IN_UNITS);
  });
});

describe('updateMissile', () => {
  it('drives straight in at four times the player step once it is close', () => {
    // Inside the straight-in threshold the flight heading is the goal exactly.
    const { world, enemy } = inbound({ z: 4000 });
    run(world, enemy, 1);
    expect(enemy.heading).toBeCloseTo(Math.PI, 9);
    expect(4000 - enemy.pos.z).toBeCloseTo(MISSILE_SPEED_MULTIPLIER * MOVE_STEP_UNITS, 6);
  });

  it('sinks towards the ground while it is clear of everything', () => {
    const { world, enemy } = inbound({ y: MISSILE_START_HEIGHT });
    run(world, enemy, 1);
    expect(enemy.y).toBe(MISSILE_START_HEIGHT - MISSILE_CLIMB_PER_TICK);

    run(world, enemy, 100);
    expect(enemy.y).toBe(0);
  });

  it('weaves while it is far out and stops weaving as it closes', () => {
    const far = inbound({ z: STRAIGHT_IN_UNITS + 4000 });
    far.world.tick = 8; // mid-swerve: FRAME & 0x1F is well off zero
    run(far.world, far.enemy, 1);
    expect(Math.abs(wrapAngle(far.enemy.heading - far.brain.goal))).toBeGreaterThan(0);
    expect(far.enemy.state).toBe('weave');

    const near = inbound({ z: STRAIGHT_IN_UNITS - 4000 });
    near.world.tick = 8;
    run(near.world, near.enemy, 1);
    expect(near.enemy.heading).toBeCloseTo(near.brain.goal, 9);
    expect(near.enemy.state).toBe('swoop');
  });

  it('swerves each way in turn, and never more than 0x1F units off its goal', () => {
    const { world, enemy, brain } = inbound({ z: STRAIGHT_IN_UNITS + 20000 });
    const swerves: number[] = [];
    for (let tick = 1; tick <= 2 * MISSILE_WEAVE_SIGN_TICKS; tick += 1) {
      world.tick = tick;
      updateMissile(world, enemy, createRng(1));
      swerves.push(wrapAngle(enemy.heading - brain.goal));
    }
    expect(Math.max(...swerves)).toBeGreaterThan(0);
    expect(Math.min(...swerves)).toBeLessThan(0);
    for (const swerve of swerves) {
      expect(Math.abs(swerve)).toBeLessThanOrEqual(0x1f * TANGLE_UNIT_RADIANS + 1e-9);
    }
  });

  it('keeps out from behind the player, swinging its approach round the front', () => {
    // Flying the same way the player faces means coming at them from behind.
    const { world, enemy, brain } = inbound({ z: -20000, heading: 0 });
    brain.goal = 0;
    world.player.heading = 0;
    const opening = Math.abs(wrapAngle(brain.goal - world.player.heading));

    run(world, enemy, 20);

    expect(Math.abs(wrapAngle(brain.goal - world.player.heading))).toBeGreaterThan(opening);
  });

  it('homes on the player once it is coming at their front', () => {
    const { world, enemy, brain } = inbound({ z: 20000 });
    world.player.heading = 0;
    enemy.pos.x = 20000;
    brain.goal = Math.PI;
    const opening = Math.abs(wrapAngle(brain.goal - (Math.PI + TAU / 8)));

    run(world, enemy, 10);

    // The goal has moved towards the true bearing, which is 225 degrees round.
    expect(Math.abs(wrapAngle(brain.goal - (Math.PI + TAU / 8)))).toBeLessThan(opening);
  });

  it('levitates over an obstacle in its path instead of stopping at it', () => {
    const wall: Obstacle = {
      kind: 'box',
      pos: { x: 0, z: 2000 },
      heading: 0,
      radius: OBSTACLE_TANK_RADIUS.box,
    };
    const { world, enemy } = inbound({ z: 3200 });
    world.obstacles = [wall];

    let hopped = 0;
    for (let tick = 1; tick <= 12 && hopped === 0; tick += 1) {
      world.tick = tick;
      updateMissile(world, enemy, createRng(1));
      if (enemy.state === 'hop') hopped = tick;
    }

    expect(hopped).toBeGreaterThan(0);
    // The tick that finds the obstacle backs the move out; the climb is the next one.
    expect(enemy.y).toBe(0);
    run(world, enemy, 1);
    expect(enemy.y).toBe(MISSILE_CLIMB_PER_TICK);

    // It climbs while it is blocked, and only up to TOP.
    run(world, enemy, 20);
    expect(enemy.y).toBeLessThanOrEqual(MISSILE_LEVITATE_TOP + MISSILE_CLIMB_PER_TICK);
    // And it does get past: the box does not hide the player from it.
    expect(enemy.pos.z).toBeLessThan(2000);
  });

  it('kills the player and itself when it rams them', () => {
    const { world, enemy } = inbound({ z: TANK_MISSILE_RADIUS + 100 });

    const events = run(world, enemy, 1);

    expect(events).toContainEqual<GameEvent>({ type: 'playerDestroyed', by: 'missile' });
    expect(world.player.alive).toBe(false);
    expect(enemy.alive).toBe(false);
    expect(world.debris).toHaveLength(DEBRIS_PIECES);
    // Ramming scores the player nothing, and the enemy counts the kill.
    expect(world.score).toBe(0);
    expect(events.some((event) => event.type === 'enemyDestroyed')).toBe(false);
    expect(internalState(world).playerDeaths).toBe(1);
    // The next unit is a tank, "so we don't missile-spam the poor player".
    expect(internalState(world).nextUnitOverride).toBe('tank');
  });

  it('leaves a dead player alone', () => {
    const { world, enemy } = inbound({ z: TANK_MISSILE_RADIUS + 100 });
    world.player.alive = false;
    const events = run(world, enemy, 1);
    expect(events).toEqual([]);
    expect(enemy.alive).toBe(true);
  });

  it('counts the ticks it spends outside radar range, for the spawner', () => {
    // Out past the radar's reach, which on the diagonal is inside the playfield.
    const { world, enemy, brain } = inbound({ z: 30000 });
    enemy.pos.x = 30000;
    run(world, enemy, 3);
    expect(brain.outOfRangeTicks).toBe(3);

    const near = inbound({ z: 4000 });
    run(near.world, near.enemy, 3);
    expect(near.brain.outOfRangeTicks).toBe(0);
  });
});
