import { describe, expect, it } from 'vitest';
import {
  MOVE_STEP_UNITS,
  PLAYER_MOVE_STEP_UNITS,
  PLAYER_OBSTACLE_RADIUS,
  PLAYER_SPEED_MULTIPLIER,
  TANK_TANK_RADIUS,
  TURN_STEP_DEGREES,
  WORLD_SIZE,
} from '../../src/data/constants';
import { TAU } from '../../src/engine/math';
import { PLAYER_START, resetPlayer, updatePlayer } from '../../src/game/player';
import { makeWorld, sticks } from './fixtures';
import type { Enemy, GameEvent, Obstacle } from '../../src/game/types';
import { NEUTRAL_INPUT } from '../../src/input/types';

const TURN_STEP = (TURN_STEP_DEGREES / 360) * TAU;

describe('updatePlayer tread kinematics', () => {
  it('drives forward along the heading with both sticks forward', () => {
    const world = makeWorld();
    const events = updatePlayer(world, sticks(1, 1));
    expect(world.player.pos).toEqual({ x: 0, z: 2 * PLAYER_MOVE_STEP_UNITS });
    expect(world.player.heading).toBe(0);
    expect(world.player.moving).toBe(true);
    expect(world.player.turning).toBe(false);
    expect(events).toEqual([]);
  });

  it('drives half again as far as the ROM tank did, and turns no faster', () => {
    // MOVE_STEP_UNITS is the ROM's step and every enemy still moves by it (see
    // the tank, supertank and missile suites), so the player's own step being
    // PLAYER_SPEED_MULTIPLIER times that is the whole of the speed change.
    expect(PLAYER_MOVE_STEP_UNITS).toBeCloseTo(PLAYER_SPEED_MULTIPLIER * MOVE_STEP_UNITS, 9);

    const world = makeWorld();
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos.z).toBeCloseTo(PLAYER_SPEED_MULTIPLIER * 2 * MOVE_STEP_UNITS, 9);

    // The treads translate faster; they do not rotate faster. A pivot is the
    // ROM's two turn steps either way.
    const pivot = makeWorld();
    updatePlayer(pivot, sticks(1, -1));
    expect(pivot.player.heading).toBeCloseTo(2 * TURN_STEP, 12);
  });

  it('reverses at the same speed with both sticks back', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(-1, -1));
    expect(world.player.pos).toEqual({ x: 0, z: -2 * PLAYER_MOVE_STEP_UNITS });
  });

  it('drives along whatever heading it is pointed at', () => {
    const world = makeWorld();
    world.player.heading = Math.PI / 2; // +X, a quarter turn clockwise from +Z.
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos.x).toBeCloseTo(2 * PLAYER_MOVE_STEP_UNITS, 9);
    expect(world.player.pos.z).toBeCloseTo(0, 9);
  });

  it('pivots right in place with the left stick forward and the right back', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(1, -1));
    expect(world.player.heading).toBeCloseTo(2 * TURN_STEP, 12);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
    expect(world.player.turning).toBe(true);
    expect(world.player.moving).toBe(false);
  });

  it('pivots left in place with the left stick back and the right forward', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(-1, 1));
    expect(world.player.heading).toBeCloseTo(-2 * TURN_STEP, 12);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
  });

  it('curves, rather than pivoting, on one stick forward', () => {
    // Left forward with the right centred turns towards the idle side - right -
    // by one step and drives one step, so the tank arcs instead of spinning.
    const world = makeWorld();
    updatePlayer(world, sticks(1, 0));
    expect(world.player.heading).toBeCloseTo(TURN_STEP, 12);
    expect(world.player.pos.x).toBeCloseTo(PLAYER_MOVE_STEP_UNITS * Math.sin(TURN_STEP), 9);
    expect(world.player.pos.z).toBeCloseTo(PLAYER_MOVE_STEP_UNITS * Math.cos(TURN_STEP), 9);
    expect(world.player.moving).toBe(true);
    expect(world.player.turning).toBe(true);
  });

  it('curves the other way on the right stick alone', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(0, 1));
    expect(world.player.heading).toBeCloseTo(-TURN_STEP, 12);
    expect(world.player.pos.x).toBeCloseTo(PLAYER_MOVE_STEP_UNITS * Math.sin(-TURN_STEP), 9);
  });

  it('reverses in an arc on one stick back', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(-1, 0));
    expect(world.player.heading).toBeCloseTo(-TURN_STEP, 12);
    expect(world.player.pos.z).toBeCloseTo(-PLAYER_MOVE_STEP_UNITS * Math.cos(TURN_STEP), 9);

    const other = makeWorld();
    updatePlayer(other, sticks(0, -1));
    expect(other.player.heading).toBeCloseTo(TURN_STEP, 12);
  });

  it('does nothing with both sticks centred', () => {
    const world = makeWorld();
    world.player.moving = true;
    world.player.turning = true;
    expect(updatePlayer(world, NEUTRAL_INPUT)).toEqual([]);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
    expect(world.player.heading).toBe(0);
    expect(world.player.moving).toBe(false);
    expect(world.player.turning).toBe(false);
  });

  it('stays put while dead', () => {
    const world = makeWorld();
    world.player.alive = false;
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
    expect(world.player.moving).toBe(false);
  });

  it('wraps around the edge of the playfield', () => {
    const world = makeWorld();
    world.player.pos = { x: 0, z: WORLD_SIZE / 2 - PLAYER_MOVE_STEP_UNITS };
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos.z).toBeCloseTo(-WORLD_SIZE / 2 + PLAYER_MOVE_STEP_UNITS, 6);
  });
});

describe('updatePlayer obstacle blocking', () => {
  const wall = (): Obstacle[] => [
    { kind: 'boxShort', pos: { x: 0, z: 1200 }, heading: 0, radius: 960 },
  ];

  it('backs the move out and reports it once per contact', () => {
    const world = makeWorld(wall());
    expect(updatePlayer(world, sticks(1, 1))).toEqual<GameEvent[]>([{ type: 'motionBlocked' }]);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });

    // Still held against the obstacle: blocked, but the report does not repeat.
    expect(updatePlayer(world, sticks(1, 1))).toEqual([]);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
  });

  it('reports again after the sticks are released and pushed back', () => {
    const world = makeWorld(wall());
    updatePlayer(world, sticks(1, 1));
    updatePlayer(world, NEUTRAL_INPUT);
    expect(updatePlayer(world, sticks(1, 1))).toEqual<GameEvent[]>([{ type: 'motionBlocked' }]);
  });

  it('can still turn away while blocked', () => {
    const world = makeWorld(wall());
    updatePlayer(world, sticks(1, 1));
    updatePlayer(world, sticks(1, 0));
    expect(world.player.heading).toBeCloseTo(TURN_STEP, 12);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });
  });

  it('is stopped a player radius out, so the obstacle stays in view', () => {
    const far = [{ kind: 'boxShort' as const, pos: { x: 0, z: 4000 }, heading: 0, radius: 960 }];
    const world = makeWorld(far);
    let events: GameEvent[] = [];
    for (let tick = 0; tick < 40 && events.length === 0; tick += 1) {
      events = updatePlayer(world, sticks(1, 1));
    }
    expect(events).toEqual<GameEvent[]>([{ type: 'motionBlocked' }]);
    expect(4000 - world.player.pos.z).toBeGreaterThanOrEqual(PLAYER_OBSTACLE_RADIUS);
    expect(4000 - world.player.pos.z).toBeLessThan(
      PLAYER_OBSTACLE_RADIUS + 2 * PLAYER_MOVE_STEP_UNITS + 1,
    );
  });
});

describe('resetPlayer', () => {
  it('puts the tank back at the start, facing the moon', () => {
    const world = makeWorld();
    world.player.pos = { x: 1234, z: -5678 };
    world.player.heading = 2;
    world.player.alive = false;
    world.player.moving = true;
    resetPlayer(world);
    expect(world.player.pos).toEqual(PLAYER_START);
    expect(world.player.heading).toBe(0);
    expect(world.player.alive).toBe(true);
    expect(world.player.moving).toBe(false);
    expect(world.player.turning).toBe(false);
  });

  it('takes the player shell off the field but leaves the enemy one alone', () => {
    const world = makeWorld();
    world.shells = [
      { id: 1, owner: 'player', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 10 },
      { id: 2, owner: 'enemy', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 10 },
    ];
    resetPlayer(world);
    expect(world.shells.map((s) => s.owner)).toEqual(['enemy']);
  });

  it('re-arms the blocked report', () => {
    const world = makeWorld([
      { kind: 'boxShort', pos: { x: 0, z: 1200 }, heading: 0, radius: 960 },
    ]);
    updatePlayer(world, sticks(1, 1));
    resetPlayer(world);
    expect(updatePlayer(world, sticks(1, 1))).toEqual<GameEvent[]>([{ type: 'motionBlocked' }]);
  });
});

describe('updatePlayer against the enemy', () => {
  const tank = (z: number): Enemy => ({
    id: 1,
    kind: 'tank',
    pos: { x: 0, z },
    heading: Math.PI,
    y: 0,
    alive: true,
    state: 'approach',
    timer: 10,
  });

  it('stops short of a parked enemy tank, and says so once', () => {
    // OBJOBJ runs its $500 tank-versus-tank test for the player as well, so an
    // enemy tank is as solid as an obstacle.
    const world = makeWorld();
    world.enemies = [tank(TANK_TANK_RADIUS + PLAYER_MOVE_STEP_UNITS)];

    const first = updatePlayer(world, sticks(1, 1));
    expect(first).toEqual<GameEvent[]>([{ type: 'motionBlocked' }]);
    expect(world.player.pos).toEqual({ x: 0, z: 0 });

    // The boing plays once per contact, exactly as for an obstacle.
    expect(updatePlayer(world, sticks(1, 1))).toEqual([]);
  });

  it('drives on past a tank that is dead, or one still out of contact', () => {
    const world = makeWorld();
    world.enemies = [{ ...tank(TANK_TANK_RADIUS + PLAYER_MOVE_STEP_UNITS), alive: false }];
    expect(updatePlayer(world, sticks(1, 1))).toEqual([]);
    expect(world.player.pos.z).toBeGreaterThan(0);

    const clear = makeWorld();
    clear.enemies = [tank(TANK_TANK_RADIUS + 4 * PLAYER_MOVE_STEP_UNITS)];
    expect(updatePlayer(clear, sticks(1, 1))).toEqual([]);
    expect(clear.player.pos.z).toBeGreaterThan(0);
  });

  it('is not stopped by the saucer, which OBJOBJ does not know about', () => {
    const world = makeWorld();
    world.enemies = [{ ...tank(TANK_TANK_RADIUS - 1), kind: 'saucer', y: 1024 }];
    expect(updatePlayer(world, sticks(1, 1))).toEqual([]);
    expect(world.player.pos.z).toBeGreaterThan(0);
  });
});
