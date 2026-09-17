import { describe, expect, it } from 'vitest';
import {
  OBSTACLES,
  OBSTACLE_COUNT,
  OBSTACLE_TANK_RADIUS,
  PLAYER_OBSTACLE_RADIUS,
  SHELL_OBSTACLE_RADIUS_QUARTERS,
  WORLD_SIZE,
} from '../../src/data/constants';
import { MODELS } from '../../src/data/models';
import { createRng } from '../../src/engine/rng';
import { octagonalDistance } from '../../src/game/collision';
import { circleHitsObstacle, placeObstacles, shellHitRadius } from '../../src/game/obstacles';
import { PLAYER_START } from '../../src/game/player';

describe('placeObstacles', () => {
  it('lays out the 21 obstacles of the ROM table', () => {
    expect(placeObstacles(createRng(1))).toHaveLength(OBSTACLE_COUNT);
  });

  it('ignores the seed: the battlefield is the same every game', () => {
    expect(placeObstacles(createRng(1))).toEqual(placeObstacles(createRng(99999)));
  });

  it('returns a fresh, mutable list each call', () => {
    const a = placeObstacles(createRng(0));
    const b = placeObstacles(createRng(0));
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  it('keeps the ROM order, and names each kind after its ROM shape', () => {
    const placed = placeObstacles(createRng(0));
    for (const [i, rom] of OBSTACLES.entries()) {
      expect(placed[i]!.kind, `obstacle ${i}`).toBe(rom.model);
    }
  });

  it('uses a kind that is also the key of its wireframe model', () => {
    for (const o of placeObstacles(createRng(0))) {
      expect(MODELS, o.kind).toHaveProperty(o.kind);
    }
  });

  it('gives every obstacle its PROXTB vehicle radius', () => {
    for (const o of placeObstacles(createRng(0))) {
      expect(o.radius).toBe(OBSTACLE_TANK_RADIUS[o.kind]);
    }
  });

  it('centres the playfield on the player start, so positions are signed', () => {
    const placed = placeObstacles(createRng(0));
    for (const o of placed) {
      expect(o.pos.x).toBeGreaterThanOrEqual(-WORLD_SIZE / 2);
      expect(o.pos.x).toBeLessThan(WORLD_SIZE / 2);
      expect(o.pos.z).toBeGreaterThanOrEqual(-WORLD_SIZE / 2);
      expect(o.pos.z).toBeLessThan(WORLD_SIZE / 2);
    }
    // PTBLX1/PTBLY1 entry 0 is ($2000, $2000) and entry 2 is ($0000, $8000).
    expect(placed[0]!.pos).toEqual({ x: 0x2000, z: 0x2000 });
    expect(placed[2]!.pos).toEqual({ x: 0, z: -0x8000 });
  });

  it('leaves the player start clear, by the metric the game collides with', () => {
    const placed = placeObstacles(createRng(0));
    for (const o of placed) {
      expect(
        octagonalDistance(PLAYER_START, o.pos),
        `${o.kind} at ${o.pos.x},${o.pos.z}`,
      ).toBeGreaterThan(PLAYER_OBSTACLE_RADIUS);
    }
    expect(circleHitsObstacle(PLAYER_START, PLAYER_OBSTACLE_RADIUS, placed)).toBeNull();
  });

  it('turns the ROM orientation byte into a clockwise heading in radians', () => {
    const placed = placeObstacles(createRng(0));
    // TANGLE counts the other way round, so $40 - a quarter turn left - is -PI/2.
    expect(OBSTACLES[0]!.orientation).toBe(0x00);
    expect(placed[0]!.heading).toBeCloseTo(0, 12);
    expect(OBSTACLES[3]!.orientation).toBe(0x40);
    expect(placed[3]!.heading).toBeCloseTo(-Math.PI / 2, 12);
    for (const o of placed) {
      expect(o.heading).toBeGreaterThan(-Math.PI - 1e-9);
      expect(o.heading).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('shellHitRadius', () => {
  it('is the PRXTBL entry converted from quarter-units to world units', () => {
    expect(shellHitRadius('pyramid')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.pyramid * 4);
    expect(shellHitRadius('box')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.box * 4);
    expect(shellHitRadius('pyramidWide')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.pyramidWide * 4);
  });

  it('is zero for the short box, which shells fly straight over', () => {
    expect(shellHitRadius('boxShort')).toBe(0);
  });
});
