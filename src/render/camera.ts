/**
 * World -> view -> screen projection, following the original's ROTPNT / DRAW
 * (BZONE.MAC.txt:3313-3387, cited in `data/constants.ts` under "Projection").
 *
 * WORLD SPACE
 * -----------
 * +X right, +Y up, +Z forward at heading 0, and **y = 0 is the ground plane**.
 * The camera eye sits at `cam.eyeHeight` (320 units, `EYE_HEIGHT_UNITS`) above
 * it.  The ROM authored its vertex tables the other way up - relative to the
 * viewpoint, with the ground at -320 - so `drawModel` lifts model vertices by
 * 320 to seat a ground-resting object at y = 0.  With the default eye height the
 * arithmetic then reduces exactly to the original's.
 *
 * SCREEN SPACE
 * ------------
 * `screen = SCREEN_SCALE * view / depth`, so the 45-degree field of view (the
 * ROM's `|Y'| < X'` test) lands on x = +/-512, the half width of the display.
 * Segments are clipped to `VIEW_WINDOW`, the window the hardware enforced for the
 * 3D view; the HUD draws above it and does its own thing.
 */

import {
  DEPTH_CUE_MIN_INTENSITY,
  DEPTH_CUE_SHIFT,
  FAR_CLIP_UNITS,
  GROUND_PLANE_UNITS,
  INTENSITY_MAX,
  NEAR_CLIP_UNITS,
  SCREEN_SCALE,
  VIEW_WINDOW,
} from '../data/constants';
import type { WireModel } from '../data/types';
import type { Vec2, Vec3 } from '../game/types';
import { rotateY } from '../engine/math';
import { clipSegment } from './clip';
import type { VectorDisplay } from './vectorDisplay';

export interface Camera {
  pos: Vec2;
  heading: number;
  eyeHeight: number;
}

/** Lifts a ROM model's vertical units onto the world's ground plane. */
const MODEL_GROUND_LIFT = -GROUND_PLANE_UNITS;

const DEPTH_CUE_FLOOR = DEPTH_CUE_MIN_INTENSITY / 0xff;

/** Takes a world point into view space: relative to the eye, looking down +Z. */
function toView(cam: Camera, p: Vec3): Vec3 {
  return rotateY({ x: p.x - cam.pos.x, y: p.y - cam.eyeHeight, z: p.z - cam.pos.z }, -cam.heading);
}

function projectView(v: Vec3): { x: number; y: number } {
  return { x: (SCREEN_SCALE * v.x) / v.z, y: (SCREEN_SCALE * v.y) / v.z };
}

/**
 * Depth cueing: `DQUE`, the high nibble of the view depth, is subtracted from the
 * object's intensity and clamped to a floor of 0x30
 * (BZONE.MAC.txt:3761-3775, 3989-3991).
 */
export function depthIntensity(base: number, depth: number): number {
  const cue = Math.floor(depth / 2 ** DEPTH_CUE_SHIFT) / INTENSITY_MAX;
  return Math.max(base - cue, DEPTH_CUE_FLOOR);
}

/**
 * Projects one world point, or returns null when it is behind the viewer, inside
 * the near plane or beyond the draw distance.
 */
export function projectPoint(cam: Camera, p: Vec3): { x: number; y: number; depth: number } | null {
  const v = toView(cam, p);
  if (v.z < NEAR_CLIP_UNITS || v.z > FAR_CLIP_UNITS) return null;
  const s = projectView(v);
  return { x: s.x, y: s.y, depth: v.z };
}

/** Moves `from` along the segment to `to` until its depth reaches `z`. */
function atDepth(from: Vec3, to: Vec3, z: number): Vec3 {
  const t = (z - from.z) / (to.z - from.z);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z };
}

/**
 * Projects a segment, clipping it at the near plane rather than dropping it (the
 * original culled whole objects, which is why long ground edges could pop), then
 * to the 3D view window.  Returns null only when nothing of it is visible.
 */
export function projectSegment(
  cam: Camera,
  a: Vec3,
  b: Vec3,
): { x0: number; y0: number; x1: number; y1: number } | null {
  return clipAndProject(toView(cam, a), toView(cam, b));
}

/** The depth-clip, project and window-clip half of `projectSegment`. */
function clipAndProject(
  start: Vec3,
  end: Vec3,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let va = start;
  let vb = end;

  if (va.z < NEAR_CLIP_UNITS && vb.z < NEAR_CLIP_UNITS) return null;
  if (va.z > FAR_CLIP_UNITS && vb.z > FAR_CLIP_UNITS) return null;
  if (va.z < NEAR_CLIP_UNITS) va = atDepth(va, vb, NEAR_CLIP_UNITS);
  else if (vb.z < NEAR_CLIP_UNITS) vb = atDepth(vb, va, NEAR_CLIP_UNITS);
  if (va.z > FAR_CLIP_UNITS) va = atDepth(va, vb, FAR_CLIP_UNITS);
  else if (vb.z > FAR_CLIP_UNITS) vb = atDepth(vb, va, FAR_CLIP_UNITS);

  const sa = projectView(va);
  const sb = projectView(vb);
  const clipped = clipSegment(sa.x, sa.y, sb.x, sb.y, VIEW_WINDOW);
  if (!clipped) return null;
  return { x0: clipped[0], y0: clipped[1], x1: clipped[2], y1: clipped[3] };
}

/**
 * Draws a ROM wireframe model at a world position, yawed by `rot.y`.  The
 * original never pitched or rolled anything (design spec 5.3), so `rot.x` and
 * `rot.z` are accepted for symmetry with `Debris.rot` and ignored.
 */
export function drawModel(
  d: VectorDisplay,
  cam: Camera,
  model: WireModel,
  pos: Vec3,
  rot: Vec3,
  intensity = 1,
): void {
  // ROM vertices are [forward, left, up]; render space is (-left, up, forward).
  const views = model.vertices.map((v) => {
    const local = rotateY({ x: -v[1], y: v[2], z: v[0] }, rot.y);
    return toView(cam, {
      x: pos.x + local.x,
      y: pos.y + local.y + MODEL_GROUND_LIFT,
      z: pos.z + local.z,
    });
  });

  for (const [i, j] of model.edges) {
    const a = views[i];
    const b = views[j];
    if (!a || !b) continue;
    const seg = clipAndProject(a, b);
    if (!seg) continue;
    d.line(seg.x0, seg.y0, seg.x1, seg.y1, depthIntensity(intensity, (a.z + b.z) / 2));
  }
}
