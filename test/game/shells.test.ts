import { describe, expect, it } from 'vitest';
import {
  SHELL_LIFE_TICKS,
  SHELL_RANGE_UNITS,
  SHELL_SPEED_UNITS_PER_TICK,
  WORLD_SIZE,
} from '../../src/data/constants';
import { firePlayerShell, updateShells } from '../../src/game/shells';
import type { GameEvent, Obstacle, Shell, World } from '../../src/game/types';

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

const obstacle = (kind: Obstacle['kind'], z: number): Obstacle => ({
  kind,
  pos: { x: 0, z },
  heading: 0,
  radius: 960,
});

/** Runs ticks until an event comes back, so a test can say what stopped a shell. */
function runUntilEvent(world: World, maxTicks = 64): { events: GameEvent[]; ticks: number } {
  for (let ticks = 1; ticks <= maxTicks; ticks += 1) {
    const events = updateShells(world);
    if (events.length > 0) return { events, ticks };
  }
  return { events: [], ticks: maxTicks };
}

describe('firePlayerShell', () => {
  it('puts a shell at the player, pointed where the tank is pointed', () => {
    const world = makeWorld();
    world.player.pos = { x: 700, z: -300 };
    world.player.heading = 1.25;
    const events = firePlayerShell(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'playerFired' }]);
    expect(world.shells).toHaveLength(1);
    expect(world.shells[0]).toMatchObject({
      owner: 'player',
      pos: { x: 700, z: -300 },
      y: 0,
      heading: 1.25,
      ticksLeft: SHELL_LIFE_TICKS,
    });
  });

  it('allows only one player shell in flight', () => {
    const world = makeWorld();
    firePlayerShell(world);
    expect(firePlayerShell(world)).toEqual([]);
    expect(world.shells).toHaveLength(1);
  });

  it('lets the player reload as soon as the shell is gone', () => {
    const world = makeWorld();
    firePlayerShell(world);
    world.shells = [];
    expect(firePlayerShell(world)).toEqual<GameEvent[]>([{ type: 'playerFired' }]);
  });

  it('ignores an enemy shell when deciding whether the cannon is loaded', () => {
    const world = makeWorld();
    const enemyShell: Shell = {
      id: 9,
      owner: 'enemy',
      pos: { x: 0, z: 0 },
      y: 0,
      heading: 0,
      ticksLeft: 10,
    };
    world.shells = [enemyShell];
    expect(firePlayerShell(world)).toEqual<GameEvent[]>([{ type: 'playerFired' }]);
    expect(world.shells).toHaveLength(2);
  });

  it('gives each shell its own id', () => {
    const world = makeWorld();
    firePlayerShell(world);
    const first = world.shells[0]!.id;
    world.shells = [];
    firePlayerShell(world);
    expect(world.shells[0]!.id).not.toBe(first);
  });

  it('does not fire while the player is dead', () => {
    const world = makeWorld();
    world.player.alive = false;
    expect(firePlayerShell(world)).toEqual([]);
    expect(world.shells).toEqual([]);
  });
});

describe('updateShells', () => {
  it('flies a tick of sub-steps along the heading', () => {
    const world = makeWorld();
    firePlayerShell(world);
    expect(updateShells(world)).toEqual([]);
    expect(world.shells[0]!.pos).toEqual({ x: 0, z: SHELL_SPEED_UNITS_PER_TICK });
    expect(world.shells[0]!.ticksLeft).toBe(SHELL_LIFE_TICKS - 1);
  });

  it('runs out of life a little past the far spawn distance', () => {
    const world = makeWorld();
    firePlayerShell(world);
    const { events, ticks } = runUntilEvent(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'shellExpired' }]);
    expect(ticks).toBe(Math.ceil(SHELL_LIFE_TICKS));
    expect(world.shells).toEqual([]);
  });

  it('travels its full range before expiring', () => {
    const world = makeWorld();
    firePlayerShell(world);
    let travelled = 0;
    for (let tick = 0; tick < Math.ceil(SHELL_LIFE_TICKS); tick += 1) {
      const shell = world.shells[0];
      if (shell) travelled = shell.pos.z;
      updateShells(world);
    }
    expect(travelled).toBeLessThan(SHELL_RANGE_UNITS);
    expect(travelled).toBeGreaterThan(SHELL_RANGE_UNITS - SHELL_SPEED_UNITS_PER_TICK);
  });

  it('bursts on a tall box and leaves the field', () => {
    const world = makeWorld([obstacle('box', 5000)]);
    firePlayerShell(world);
    const { events } = runUntilEvent(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'shellHitObstacle' }]);
    expect(world.shells).toEqual([]);
  });

  it('flies straight over a short box', () => {
    const world = makeWorld([obstacle('boxShort', 5000)]);
    firePlayerShell(world);
    const { events } = runUntilEvent(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'shellExpired' }]);
  });

  it('cannot tunnel through an obstacle at any range', () => {
    // A whole tick's flight is four times the sub-step, and wider than a
    // pyramid, so without sub-stepping the shell would skip straight past.
    for (let z = 300; z < 8000; z += 37) {
      const world = makeWorld([obstacle('pyramid', z)]);
      firePlayerShell(world);
      const { events } = runUntilEvent(world);
      expect(events, `pyramid at ${z}`).toEqual<GameEvent[]>([{ type: 'shellHitObstacle' }]);
    }
  });

  it('flies enemy shells too', () => {
    const world = makeWorld([obstacle('box', 5000)]);
    world.shells = [
      { id: 1, owner: 'enemy', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 10 },
    ];
    const { events } = runUntilEvent(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'shellHitObstacle' }]);
  });

  it('wraps across the edge of the playfield', () => {
    const world = makeWorld();
    firePlayerShell(world);
    world.shells[0]!.pos = { x: 0, z: WORLD_SIZE / 2 - SHELL_SPEED_UNITS_PER_TICK };
    updateShells(world);
    expect(world.shells[0]!.pos.z).toBeCloseTo(-WORLD_SIZE / 2, 6);
  });

  it('reports one event per shell that ends', () => {
    const world = makeWorld([obstacle('box', 1000)]);
    world.shells = [
      { id: 1, owner: 'player', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 10 },
      { id: 2, owner: 'enemy', pos: { x: 0, z: 0 }, y: 0, heading: 0, ticksLeft: 0.25 },
    ];
    const events = updateShells(world);
    expect(events).toEqual<GameEvent[]>([{ type: 'shellHitObstacle' }, { type: 'shellExpired' }]);
    expect(world.shells).toEqual([]);
  });
});
