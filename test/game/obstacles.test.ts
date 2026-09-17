import { describe, expect, it } from 'vitest';
import {
  OBSTACLES,
  OBSTACLE_COUNT,
  OBSTACLE_TANK_RADIUS,
  SHELL_OBSTACLE_RADIUS_QUARTERS,
  WORLD_SIZE,
} from '../../src/data/constants';
import { MODELS } from '../../src/data/models';
import { createRng } from '../../src/engine/rng';
import {
  OBSTACLE_HEADINGS,
  OBSTACLE_MODEL_BY_KIND,
  placeObstacles,
  shellHitRadius,
} from '../../src/game/obstacles';

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

  it('keeps the ROM order so the orientation table still lines up', () => {
    const placed = placeObstacles(createRng(0));
    for (const [i, rom] of OBSTACLES.entries()) {
      expect(OBSTACLE_MODEL_BY_KIND[placed[i]!.kind], `obstacle ${i}`).toBe(rom.model);
    }
  });

  it('gives every obstacle its PROXTB vehicle radius', () => {
    for (const o of placeObstacles(createRng(0))) {
      expect(o.radius).toBe(OBSTACLE_TANK_RADIUS[OBSTACLE_MODEL_BY_KIND[o.kind]]);
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

  it('leaves the origin, where the player starts, clear of every obstacle', () => {
    for (const o of placeObstacles(createRng(0))) {
      expect(Math.abs(o.pos.x) + Math.abs(o.pos.z)).toBeGreaterThan(o.radius);
    }
  });
});

describe('OBSTACLE_MODEL_BY_KIND', () => {
  it('names a wireframe model for every obstacle kind', () => {
    for (const model of Object.values(OBSTACLE_MODEL_BY_KIND)) {
      expect(MODELS, model).toHaveProperty(model);
    }
  });
});

describe('OBSTACLE_HEADINGS', () => {
  it('gives every obstacle a clockwise heading in radians', () => {
    expect(OBSTACLE_HEADINGS).toHaveLength(OBSTACLE_COUNT);
    // TANGLE counts the other way round, so $40 - a quarter turn left - is -PI/2.
    expect(OBSTACLE_HEADINGS[0]).toBeCloseTo(0, 12);
    expect(OBSTACLE_HEADINGS[3]).toBeCloseTo(-Math.PI / 2, 12);
    for (const heading of OBSTACLE_HEADINGS) {
      expect(heading).toBeGreaterThan(-Math.PI - 1e-9);
      expect(heading).toBeLessThanOrEqual(Math.PI);
    }
  });
});

describe('shellHitRadius', () => {
  it('is the PRXTBL entry converted from quarter-units to world units', () => {
    expect(shellHitRadius('pyramid')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.pyramid * 4);
    expect(shellHitRadius('tallCube')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.box * 4);
    expect(shellHitRadius('wideCube')).toBe(SHELL_OBSTACLE_RADIUS_QUARTERS.pyramidWide * 4);
  });

  it('is zero for the short box, which shells fly straight over', () => {
    expect(shellHitRadius('cube')).toBe(0);
  });
});
