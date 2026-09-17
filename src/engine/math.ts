/**
 * Scalar, angle and vector helpers shared by the simulation and the renderer.
 *
 * ANGLE CONVENTION
 * ----------------
 * Headings are radians, 0 pointing along +Z, increasing clockwise when viewed
 * from above (design spec 4.2).  With +X to the right that makes the forward
 * vector `(sin h, cos h)` in the (x, z) ground plane, so a heading is
 * `atan2(dx, dz)` rather than the usual `atan2(dy, dx)`.
 *
 * The original stored headings as a byte (`TANGLE`, 256 units per turn) that
 * counts the other way round - increasing it turns left.  Converting to and from
 * that representation belongs wherever ROM data is read, not here.
 */

import type { Vec2, Vec3 } from '../game/types';

/**
 * Vec3 lives in `game/types.ts` because the simulation stores debris velocities
 * and rotations with it; re-exported here so render and engine code can reach it
 * without importing simulation types directly.
 */
export type { Vec3 } from '../game/types';

/** One full turn in radians. */
export const TAU = Math.PI * 2;

/** Folds an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  const wrapped = a - TAU * Math.floor((a + Math.PI) / TAU);
  // floor() puts exactly +PI at -PI; the convention here is the upper bound.
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Heading from `from` to `to`, in the same convention as `Player.heading`. */
export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Ground-plane distance between two positions. */
export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

/**
 * Rotates a point about the Y (up) axis by `a`, which adds `a` to the point's
 * heading.  Rotating by the negative of the camera heading therefore takes a
 * world-relative point into view space.
 */
export function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: p.z * c - p.x * s };
}

/** Linear interpolation; `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamps `v` into the inclusive range [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
