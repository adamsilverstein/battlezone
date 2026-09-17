import { describe, expect, it } from 'vitest';
import { OBSTACLE_TANK_RADIUS, PLAYER_OBSTACLE_RADIUS, WORLD_SIZE } from '../../src/data/constants';
import {
  bearingTo,
  circleHitsObstacle,
  octagonalDistance,
  wrapCoordinate,
} from '../../src/game/collision';
import type { Obstacle } from '../../src/game/types';

const obstacle = (x: number, z: number, radius: number): Obstacle => ({
  kind: 'boxShort',
  pos: { x, z },
  heading: 0,
  radius,
});

describe('wrapCoordinate', () => {
  it('leaves coordinates inside the playfield alone', () => {
    expect(wrapCoordinate(0)).toBe(0);
    expect(wrapCoordinate(1234.5)).toBe(1234.5);
    expect(wrapCoordinate(-1234.5)).toBe(-1234.5);
  });

  it('folds the playfield into a torus half a world wide either way', () => {
    expect(wrapCoordinate(WORLD_SIZE / 2)).toBe(-WORLD_SIZE / 2);
    expect(wrapCoordinate(WORLD_SIZE / 2 + 10)).toBe(-WORLD_SIZE / 2 + 10);
    expect(wrapCoordinate(-WORLD_SIZE / 2 - 10)).toBe(WORLD_SIZE / 2 - 10);
    expect(wrapCoordinate(WORLD_SIZE + 7)).toBe(7);
  });
});

describe('octagonalDistance', () => {
  it('is exact along an axis', () => {
    expect(octagonalDistance({ x: 0, z: 0 }, { x: 0, z: 1000 })).toBe(1000);
    expect(octagonalDistance({ x: -400, z: 0 }, { x: 0, z: 0 })).toBe(400);
  });

  it('adds three eighths of the shorter leg to the longer one', () => {
    // The MathBox computes max + min/4 + min/8, not a true hypotenuse.
    expect(octagonalDistance({ x: 0, z: 0 }, { x: 800, z: 1600 })).toBe(1600 + 300);
    expect(octagonalDistance({ x: 0, z: 0 }, { x: 1000, z: 1000 })).toBe(1375);
  });

  it('stays within about 7 per cent of the true distance', () => {
    // The octagon is inscribed on the axes and at 45 degrees it falls short,
    // while around 22.5 degrees it runs long; that error is the shape of the
    // game's collision "circles".
    for (let deg = 0; deg < 90; deg += 1) {
      const a = { x: 0, z: 0 };
      const b = {
        x: 1000 * Math.cos((deg * Math.PI) / 180),
        z: 1000 * Math.sin((deg * Math.PI) / 180),
      };
      expect(Math.abs(octagonalDistance(a, b) - 1000) / 1000, `${deg} degrees`).toBeLessThan(0.07);
    }
  });

  it('measures across the wrap, not the long way round', () => {
    const a = { x: WORLD_SIZE / 2 - 100, z: 0 };
    const b = { x: -WORLD_SIZE / 2 + 100, z: 0 };
    expect(octagonalDistance(a, b)).toBe(200);
  });

  it('is symmetric', () => {
    const a = { x: 123, z: -4567 };
    const b = { x: -890, z: 1234 };
    expect(octagonalDistance(a, b)).toBe(octagonalDistance(b, a));
  });
});

describe('bearingTo', () => {
  it('agrees with the plain heading convention: 0 is +Z, clockwise', () => {
    expect(bearingTo({ x: 0, z: 0 }, { x: 0, z: 100 })).toBeCloseTo(0, 12);
    expect(bearingTo({ x: 0, z: 0 }, { x: 100, z: 0 })).toBeCloseTo(Math.PI / 2, 12);
    expect(bearingTo({ x: 0, z: 0 }, { x: -100, z: 0 })).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('points the short way across the wrap, not back round the world', () => {
    const near = { x: 0, z: WORLD_SIZE / 2 - 100 };
    const far = { x: 0, z: -WORLD_SIZE / 2 + 100 };
    // 200 units ahead, not 65336 behind.
    expect(bearingTo(near, far)).toBeCloseTo(0, 12);
    expect(bearingTo(far, near)).toBeCloseTo(Math.PI, 12);
  });
});

describe('circleHitsObstacle', () => {
  const obstacles = [obstacle(0, 4000, OBSTACLE_TANK_RADIUS.box), obstacle(4000, 0, 900)];

  it('returns null when nothing is close', () => {
    expect(circleHitsObstacle({ x: 0, z: 0 }, PLAYER_OBSTACLE_RADIUS, obstacles)).toBeNull();
  });

  it('returns the obstacle whose radius the circle is inside', () => {
    const hit = circleHitsObstacle({ x: 0, z: 4000 - PLAYER_OBSTACLE_RADIUS + 1 }, 0, obstacles);
    expect(hit).toBeNull();
    expect(
      circleHitsObstacle(
        { x: 0, z: 4000 - PLAYER_OBSTACLE_RADIUS + 1 },
        PLAYER_OBSTACLE_RADIUS,
        obstacles,
      ),
    ).toBe(obstacles[0]);
  });

  it('takes the larger of the body radius and the obstacle radius', () => {
    // The ROM never sums the two: the enemy uses the obstacle's own PROXTB entry
    // and the player a flat $480, which is larger than every PROXTB entry.
    const box = obstacles[0];
    const inside = { x: 0, z: 4000 - OBSTACLE_TANK_RADIUS.box + 1 };
    const outside = { x: 0, z: 4000 - OBSTACLE_TANK_RADIUS.box - 1 };
    expect(circleHitsObstacle(inside, 0, obstacles)).toBe(box);
    expect(circleHitsObstacle(outside, 0, obstacles)).toBeNull();
  });

  it('measures across the wrap', () => {
    const far = [obstacle(-WORLD_SIZE / 2 + 100, 0, 900)];
    expect(circleHitsObstacle({ x: WORLD_SIZE / 2 - 100, z: 0 }, 0, far)).toBe(far[0]);
  });
});
