import { describe, expect, it } from 'vitest';
import { ATTRACT_DRIVE_MASK } from '../../src/data/constants';
import { createRng } from '../../src/engine/rng';
import { attractInput } from '../../src/game/attract';
import type { Enemy, World } from '../../src/game/types';
import { makeWorld } from './fixtures';

const rng = createRng(1);

function enemyAt(x: number, z: number): Enemy {
  return {
    id: 1,
    kind: 'tank',
    pos: { x, z },
    heading: 0,
    y: 0,
    alive: true,
    state: 'approach',
    timer: 0,
  };
}

/** A world with the demo player at the origin facing +Z. */
function demoWorld(enemies: Enemy[] = [], parts: Partial<World> = {}): World {
  return { ...makeWorld(), enemies, ...parts };
}

describe('attractInput', () => {
  it('pivots left towards an enemy off the left shoulder', () => {
    const input = attractInput(demoWorld([enemyAt(-8000, 0)]), 0, rng);

    // Opposite treads are a pivot; left tread back turns left (game/player.ts).
    expect(input.leftTread).toBe(-1);
    expect(input.rightTread).toBe(1);
  });

  it('pivots right towards an enemy off the right shoulder', () => {
    const input = attractInput(demoWorld([enemyAt(8000, 0)]), 0, rng);

    expect(input.leftTread).toBe(1);
    expect(input.rightTread).toBe(-1);
  });

  it('drives at an enemy dead ahead instead of turning', () => {
    const input = attractInput(demoWorld([enemyAt(0, 8000)]), 0, rng);

    expect(input.leftTread).toBe(1);
    expect(input.rightTread).toBe(1);
  });

  it('pulls the trigger when the sights are on the target', () => {
    const world = demoWorld([enemyAt(0, 8000)], { targetInSights: true });
    const input = attractInput(world, 0, rng);

    expect(input.fire).toBe(true);
    expect(input.firePressed).toBe(true);
  });

  it('holds its fire with nothing in the sights', () => {
    expect(attractInput(demoWorld([enemyAt(0, 8000)]), 0, rng).fire).toBe(false);
  });

  it('alternates forward and back with nobody to chase, as MOTION does', () => {
    const empty = demoWorld();

    expect(attractInput(empty, 0, rng).leftTread).toBe(1);
    expect(attractInput(empty, ATTRACT_DRIVE_MASK, rng).leftTread).toBe(-1);
    expect(attractInput(empty, 2 * ATTRACT_DRIVE_MASK, rng).leftTread).toBe(1);
  });

  it('steers back towards the middle of the field by the sign of its own x', () => {
    const west = attractInput(
      demoWorld([], { player: { ...makeWorld().player, pos: { x: -9000, z: 0 } } }),
      0,
      rng,
    );
    const east = attractInput(
      demoWorld([], { player: { ...makeWorld().player, pos: { x: 9000, z: 0 } } }),
      0,
      rng,
    );

    // One tread idle curves towards it while still driving.
    expect(west.leftTread).toBe(1);
    expect(west.rightTread).toBe(0);
    expect(east.leftTread).toBe(0);
    expect(east.rightTread).toBe(1);
  });

  it('never asks for a start, so the demo cannot start a game for you', () => {
    const input = attractInput(demoWorld([enemyAt(0, 8000)], { targetInSights: true }), 0, rng);

    expect(input.startPressed).toBe(false);
  });

  it('ignores a dead enemy and the saucer, which the demo never chases', () => {
    const dead = { ...enemyAt(-8000, 0), alive: false };
    const saucer: Enemy = { ...enemyAt(-8000, 0), id: 2, kind: 'saucer' };

    expect(attractInput(demoWorld([dead, saucer]), 0, rng).leftTread).toBe(1);
  });
});
