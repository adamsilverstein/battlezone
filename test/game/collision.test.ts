import { describe, expect, it } from 'vitest';
import {
  ENEMY_IN_RANGE_UNITS,
  MISSILE_OBSTACLE_SCALE,
  OBSTACLE_TANK_RADIUS,
  PLAYER_OBSTACLE_RADIUS,
  SHELL_TANK_RADIUS_BASE,
  TANGLE_UNIT_RADIANS,
  WORLD_SIZE,
} from '../../src/data/constants';
import {
  SAUCER_HIT_RADIUS,
  bearingTo,
  circleHitsObstacle,
  isEnemyInRange,
  isTargetInSights,
  missileHitsObstacle,
  nearestEnemyUnit,
  octagonalDistance,
  shellHitsUnit,
  shellUnitHitRadius,
  wrapCoordinate,
} from '../../src/game/collision';
import type { Enemy, Obstacle, Shell } from '../../src/game/types';
import { makeWorld } from './fixtures';

const obstacle = (x: number, z: number, radius: number): Obstacle => ({
  kind: 'boxShort',
  pos: { x, z },
  heading: 0,
  radius,
});

const enemy = (kind: Enemy['kind'], x: number, z: number): Enemy => ({
  id: 1,
  kind,
  pos: { x, z },
  heading: 0,
  y: 0,
  alive: true,
  state: 'approach',
  timer: 0,
});

const shell = (x: number, z: number, heading = 0): Shell => ({
  id: 1,
  owner: 'player',
  pos: { x, z },
  y: 0,
  heading,
  ticksLeft: 10,
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

describe('shellUnitHitRadius', () => {
  it('opens up with the angle between the shell and the target', () => {
    const aligned = shellUnitHitRadius(0, 0, false);
    const acrossThe = shellUnitHitRadius(0, Math.PI / 2, false);
    const opposed = shellUnitHitRadius(0, Math.PI, false);
    // SHRTCK's 0x38 base, in quarter units, is the aligned radius; the ROM's d is
    // monotonic in the heading difference, so the widest reading is at 180 degrees.
    expect(aligned).toBe(SHELL_TANK_RADIUS_BASE * 4);
    expect(acrossThe).toBeGreaterThan(aligned);
    expect(opposed).toBeGreaterThan(acrossThe);
    expect(opposed).toBeCloseTo(416, 0);
  });

  it('does not care which way round the two headings are', () => {
    const a = shellUnitHitRadius(0, 1, false);
    expect(shellUnitHitRadius(1, 0, false)).toBe(a);
    expect(shellUnitHitRadius(0, 1 - Math.PI * 2, false)).toBeCloseTo(a, 9);
  });

  it('makes the missile a fatter target than a tank', () => {
    for (const off of [0, 8, 32, 64, 128]) {
      const heading = off * TANGLE_UNIT_RADIANS;
      expect(shellUnitHitRadius(0, heading, true)).toBeGreaterThan(
        shellUnitHitRadius(0, heading, false),
      );
    }
  });
});

describe('shellHitsUnit', () => {
  const tank = enemy('tank', 0, 0);

  it('hits inside the radius and misses outside it', () => {
    const radius = shellUnitHitRadius(0, tank.heading, false);
    expect(shellHitsUnit(shell(0, radius - 1), tank, false)).toBe(true);
    expect(shellHitsUnit(shell(0, radius + 1), tank, false)).toBe(false);
  });
});

describe('missileHitsObstacle', () => {
  it('collides further out than a tank does, by the 3/4 distance scale', () => {
    const radius = OBSTACLE_TANK_RADIUS.box;
    const obstacles = [obstacle(0, 0, radius)];
    // Three quarters of this distance is just inside the radius, the distance
    // itself is not: a tank would be clear here, the missile is not.
    const between = { x: 0, z: radius / MISSILE_OBSTACLE_SCALE - 1 };
    expect(circleHitsObstacle(between, 0, obstacles)).toBeNull();
    expect(missileHitsObstacle(between, obstacles)).toBe(obstacles[0]);
    expect(
      missileHitsObstacle({ x: 0, z: radius / MISSILE_OBSTACLE_SCALE + 1 }, obstacles),
    ).toBeNull();
  });
});

describe('nearestEnemyUnit', () => {
  it('picks the closest living tank, supertank or missile', () => {
    const world = makeWorld();
    const near = enemy('missile', 0, 1000);
    world.enemies = [enemy('tank', 0, 5000), near];
    expect(nearestEnemyUnit(world)).toBe(near);
  });

  it('never picks the saucer, which the radar does not see', () => {
    const world = makeWorld();
    const tank = enemy('tank', 0, 5000);
    world.enemies = [enemy('saucer', 0, 100), tank];
    expect(nearestEnemyUnit(world)).toBe(tank);
  });

  it('ignores dead units', () => {
    const world = makeWorld();
    world.enemies = [{ ...enemy('tank', 0, 100), alive: false }];
    expect(nearestEnemyUnit(world)).toBeNull();
  });
});

describe('isEnemyInRange', () => {
  it('reaches exactly as far as the radar does', () => {
    const world = makeWorld();
    world.enemies = [enemy('tank', 0, ENEMY_IN_RANGE_UNITS - 1)];
    expect(isEnemyInRange(world)).toBe(true);
    world.enemies = [enemy('tank', 0, ENEMY_IN_RANGE_UNITS)];
    expect(isEnemyInRange(world)).toBe(false);
  });

  it('is false with nothing on the field', () => {
    expect(isEnemyInRange(makeWorld())).toBe(false);
  });
});

describe('isTargetInSights', () => {
  it('locks only within the reticle window', () => {
    const world = makeWorld();
    world.enemies = [enemy('tank', 0, 5000)];
    expect(isTargetInSights(world)).toBe(true);

    world.player.heading = 4 * TANGLE_UNIT_RADIANS;
    expect(isTargetInSights(world)).toBe(false);
  });

  it('locks on an enemy dead ahead however far off it is', () => {
    // MAIN tests PTURN alone: the reticle and "ENEMY IN RANGE" are separate things.
    const world = makeWorld();
    world.player.heading = Math.PI / 4;
    world.enemies = [enemy('tank', 24000, 24000)];

    expect(octagonalDistance(world.player.pos, world.enemies[0]!.pos)).toBeGreaterThan(
      ENEMY_IN_RANGE_UNITS,
    );
    expect(isEnemyInRange(world)).toBe(false);
    expect(isTargetInSights(world)).toBe(true);
  });
});

describe('SAUCER_HIT_RADIUS', () => {
  it('is the 0x90 quarter-unit radius in world units', () => {
    expect(SAUCER_HIT_RADIUS).toBe(0x90 * 4);
  });
});
