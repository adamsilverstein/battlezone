import { describe, expect, it } from 'vitest';
import {
  DEBRIS_HIGH_PIECE,
  DEBRIS_PIECES,
  DEBRIS_VELOCITY_X,
  DEBRIS_VELOCITY_Y,
  DEBRIS_VELOCITY_Z,
  GRAVITY_PER_TICK,
} from '../../src/data/constants';
import { MODELS } from '../../src/data/models';
import { wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { spawnExplosion, updateDebris } from '../../src/game/explosions';
import type { Enemy, World } from '../../src/game/types';
import { makeWorld } from './fixtures';

const victim = (kind: Enemy['kind'], y = 0): Enemy => ({
  id: 7,
  kind,
  pos: { x: 1000, z: -2000 },
  heading: 1,
  y,
  alive: false,
  state: 'dead',
  timer: 0,
});

/** Runs the debris until the field is empty, and says how long that took. */
function runToEmpty(world: World, limit = 400): number {
  for (let tick = 1; tick <= limit; tick += 1) {
    updateDebris(world);
    if (world.debris.length === 0) return tick;
  }
  throw new Error('debris never landed');
}

describe('spawnExplosion', () => {
  it('replaces the tank with six known chunks at its own position', () => {
    const world = makeWorld();
    const enemy = victim('tank');
    spawnExplosion(world, enemy, createRng(1));

    expect(world.debris).toHaveLength(DEBRIS_PIECES);
    for (const piece of world.debris) {
      expect(MODELS[piece.model], piece.model).toBeDefined();
      expect(piece.pos).toEqual(enemy.pos);
      expect(piece.y).toBe(enemy.y);
      expect(piece.ticksLeft).toBeGreaterThan(0);
    }
    // The tank's own dish and treads come off with the hull.
    expect(world.debris.map((piece) => piece.model)).toContain('radarDish');
    expect(world.debris.map((piece) => piece.model)).toContain('debrisHull');
  });

  it('throws one chunk much higher than the rest, and it lands last', () => {
    const world = makeWorld();
    spawnExplosion(world, victim('tank'), createRng(2));

    const high = world.debris[DEBRIS_HIGH_PIECE]!;
    for (const [index, piece] of world.debris.entries()) {
      if (index === DEBRIS_HIGH_PIECE) continue;
      expect(piece.vel.y).toBeLessThan(high.vel.y);
      expect(piece.ticksLeft).toBeLessThan(high.ticksLeft);
    }
    // It is the turret piece: the dish, which is what the ROM sends up as chunk 3.
    expect(high.model).toBe('radarDish');
  });

  it('spins the chunks about the vertical axis only', () => {
    const world = makeWorld();
    spawnExplosion(world, victim('tank'), createRng(3));

    for (const piece of world.debris) {
      expect(piece.spin.x).toBe(0);
      expect(piece.spin.z).toBe(0);
      expect(piece.spin.y).not.toBe(0);
      expect(piece.rot.x).toBe(0);
      expect(piece.rot.z).toBe(0);
    }
    // Neighbouring chunks spin opposite ways, at their own rates.
    expect(Math.sign(world.debris[0]!.spin.y)).not.toBe(Math.sign(world.debris[1]!.spin.y));
    expect(Math.abs(world.debris[1]!.spin.y)).toBeGreaterThan(Math.abs(world.debris[0]!.spin.y));
  });

  it('gives the supertank its body panels and no dish', () => {
    const world = makeWorld();
    spawnExplosion(world, victim('supertank'), createRng(4));
    const models = world.debris.map((piece) => piece.model);
    expect(models).not.toContain('radarDish');
    expect(models.every((model) => model.startsWith('debris'))).toBe(true);
  });

  it('gives the missile and the saucer their own smaller spray', () => {
    const world = makeWorld();
    const tank = makeWorld();
    spawnExplosion(world, victim('missile', 200), createRng(5));
    spawnExplosion(tank, victim('tank'), createRng(5));

    expect(world.debris.map((piece) => piece.model)).toEqual(
      expect.arrayContaining(['debrisPiece3', 'debrisPiece4']),
    );
    for (const [index, piece] of world.debris.entries()) {
      expect(Math.abs(piece.vel.x)).toBeLessThanOrEqual(Math.abs(tank.debris[index]!.vel.x));
      expect(piece.vel.y).toBeLessThan(tank.debris[index]!.vel.y);
    }
    // The chunks start where the unit died, not on the ground under it.
    expect(world.debris[0]!.y).toBe(200);

    const saucer = makeWorld();
    spawnExplosion(saucer, victim('saucer', 1024), createRng(5));
    expect(saucer.debris.map((piece) => piece.model)).toEqual(
      world.debris.map((piece) => piece.model),
    );
  });

  it('varies only the low byte of the vertical velocity, so the shape repeats', () => {
    const a = makeWorld();
    const b = makeWorld();
    spawnExplosion(a, victim('tank'), createRng(11));
    spawnExplosion(b, victim('tank'), createRng(22));

    for (const [index, piece] of a.debris.entries()) {
      expect(piece.vel.x).toBe(DEBRIS_VELOCITY_X[index]);
      expect(piece.vel.z).toBe(DEBRIS_VELOCITY_Y[index]);
      // IZVEL is the whole part; only the fraction under it is random.
      expect(Math.floor(piece.vel.y)).toBe(DEBRIS_VELOCITY_Z[index]);
      expect(Math.floor(b.debris[index]!.vel.y)).toBe(DEBRIS_VELOCITY_Z[index]);
      expect(piece.vel.y).not.toBe(b.debris[index]!.vel.y);
    }
  });
});

describe('updateDebris', () => {
  it('flies the chunks out and down under gravity, then clears them away', () => {
    const world = makeWorld();
    spawnExplosion(world, victim('tank'), createRng(6));
    const piece = world.debris[DEBRIS_HIGH_PIECE]!;
    const started = { ...piece.pos };
    const velY = piece.vel.y;
    const facing = piece.rot.y;
    const spin = piece.spin.y;

    updateDebris(world);
    expect(piece.y).toBeGreaterThan(0);
    expect(piece.vel.y).toBe(velY + GRAVITY_PER_TICK);
    expect(piece.pos.x).toBeCloseTo(started.x + piece.vel.x, 9);
    expect(piece.pos.z).toBeCloseTo(started.z + piece.vel.z, 9);
    expect(piece.rot.y).toBeCloseTo(wrapAngle(facing + spin), 9);

    runToEmpty(world);
    expect(world.debris).toEqual([]);
    expect(piece.y).toBeLessThan(0);
  });

  it('keeps every chunk until the highest one lands', () => {
    const world = makeWorld();
    spawnExplosion(world, victim('tank'), createRng(7));
    const longest = Math.max(...world.debris.map((piece) => piece.ticksLeft));
    expect(runToEmpty(world)).toBe(longest);
  });

  it('does nothing when there is no debris', () => {
    const world = makeWorld();
    updateDebris(world);
    expect(world.debris).toEqual([]);
  });
});
