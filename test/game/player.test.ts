import { describe, expect, it } from 'vitest';
import {
  MOVE_STEP_UNITS,
  PLAYER_OBSTACLE_RADIUS,
  TURN_STEP_DEGREES,
  WORLD_SIZE,
} from '../../src/data/constants';
import { TAU } from '../../src/engine/math';
import { PLAYER_START, resetPlayer, updatePlayer } from '../../src/game/player';
import type { GameEvent, Obstacle, World } from '../../src/game/types';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

const TURN_STEP = (TURN_STEP_DEGREES / 360) * TAU;

/** A bare world: just a player and whatever obstacles the test cares about. */
function makeWorld(obstacles: Obstacle[] = []): World {
  return {
    tick: 0,
    player: { pos: { x: 0, z: 0 }, heading: 0, moving: false, turning: false, alive: true },
    enemies: [],
    shells: [],
    obstacles,
    debris: [],
    radarAngle: 0,
    enemyInRange: false,
    targetInSights: false,
    score: 0,
    lives: 3,
    nextBonusAt: null,
  };
}

const sticks = (leftTread: -1 | 0 | 1, rightTread: -1 | 0 | 1): InputState => ({
  ...NEUTRAL_INPUT,
  leftTread,
  rightTread,
});

describe('updatePlayer tread kinematics', () => {
  it('drives forward along the heading with both sticks forward', () => {
    const world = makeWorld();
    const events = updatePlayer(world, sticks(1, 1));
    expect(world.player.pos).toEqual({ x: 0, z: 2 * MOVE_STEP_UNITS });
    expect(world.player.heading).toBe(0);
    expect(world.player.moving).toBe(true);
    expect(world.player.turning).toBe(false);
    expect(events).toEqual([]);
  });

  it('reverses at the same speed with both sticks back', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(-1, -1));
    expect(world.player.pos).toEqual({ x: 0, z: -2 * MOVE_STEP_UNITS });
  });

  it('drives along whatever heading it is pointed at', () => {
    const world = makeWorld();
    world.player.heading = Math.PI / 2; // +X, a quarter turn clockwise from +Z.
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos.x).toBeCloseTo(2 * MOVE_STEP_UNITS, 9);
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
    expect(world.player.pos.x).toBeCloseTo(MOVE_STEP_UNITS * Math.sin(TURN_STEP), 9);
    expect(world.player.pos.z).toBeCloseTo(MOVE_STEP_UNITS * Math.cos(TURN_STEP), 9);
    expect(world.player.moving).toBe(true);
    expect(world.player.turning).toBe(true);
  });

  it('curves the other way on the right stick alone', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(0, 1));
    expect(world.player.heading).toBeCloseTo(-TURN_STEP, 12);
    expect(world.player.pos.x).toBeCloseTo(MOVE_STEP_UNITS * Math.sin(-TURN_STEP), 9);
  });

  it('reverses in an arc on one stick back', () => {
    const world = makeWorld();
    updatePlayer(world, sticks(-1, 0));
    expect(world.player.heading).toBeCloseTo(-TURN_STEP, 12);
    expect(world.player.pos.z).toBeCloseTo(-MOVE_STEP_UNITS * Math.cos(TURN_STEP), 9);

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
    world.player.pos = { x: 0, z: WORLD_SIZE / 2 - MOVE_STEP_UNITS };
    updatePlayer(world, sticks(1, 1));
    expect(world.player.pos.z).toBeCloseTo(-WORLD_SIZE / 2 + MOVE_STEP_UNITS, 6);
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
      PLAYER_OBSTACLE_RADIUS + 2 * MOVE_STEP_UNITS + 1,
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
