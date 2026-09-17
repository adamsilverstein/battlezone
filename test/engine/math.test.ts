import { describe, expect, it } from 'vitest';
import { TAU, angleTo, clamp, dist, lerp, rotateY, wrapAngle } from '../../src/engine/math';

describe('wrapAngle', () => {
  it('leaves angles already in range alone', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(1)).toBeCloseTo(1, 12);
    expect(wrapAngle(-1)).toBeCloseTo(-1, 12);
  });

  it('folds every angle into (-PI, PI]', () => {
    for (let i = -20; i <= 20; i += 1) {
      for (const base of [0, 0.5, -0.5, Math.PI, -Math.PI, 3]) {
        const wrapped = wrapAngle(base + i * TAU);
        expect(wrapped).toBeGreaterThan(-Math.PI - 1e-9);
        expect(wrapped).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(Math.abs(wrapAngle(wrapped - base))).toBeLessThan(1e-9);
      }
    }
  });

  it('maps exactly PI to PI, not -PI', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
  });
});

describe('angleTo', () => {
  const origin = { x: 0, z: 0 };

  it('reads zero straight ahead (+Z) and increases clockwise from above', () => {
    expect(angleTo(origin, { x: 0, z: 10 })).toBeCloseTo(0, 12);
    expect(angleTo(origin, { x: 10, z: 0 })).toBeCloseTo(Math.PI / 2, 12);
    expect(angleTo(origin, { x: -10, z: 0 })).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('is relative to the from point', () => {
    expect(angleTo({ x: 5, z: 5 }, { x: 5, z: 9 })).toBeCloseTo(0, 12);
  });
});

describe('dist', () => {
  it('measures ground-plane distance', () => {
    expect(dist({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo(5, 12);
    expect(dist({ x: -3, z: -4 }, { x: 0, z: 0 })).toBeCloseTo(5, 12);
  });
});

describe('rotateY', () => {
  it('adds to the heading of a point, leaving y alone', () => {
    const forward = { x: 0, y: 7, z: 10 };
    const right = rotateY(forward, Math.PI / 2);
    expect(right.x).toBeCloseTo(10, 9);
    expect(right.z).toBeCloseTo(0, 9);
    expect(right.y).toBe(7);
  });

  it('is its own inverse at the negated angle', () => {
    const p = { x: 3, y: -2, z: 11 };
    const round = rotateY(rotateY(p, 0.7), -0.7);
    expect(round.x).toBeCloseTo(p.x, 9);
    expect(round.y).toBeCloseTo(p.y, 9);
    expect(round.z).toBeCloseTo(p.z, 9);
  });
});

describe('lerp and clamp', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-4, 4, 0.5)).toBe(0);
  });

  it('clamps to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
