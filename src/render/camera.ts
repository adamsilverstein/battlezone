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
 * Segments are clipped to `VIEW_CLIP`, the window the hardware enforced for the
 * 3D view narrowed to what is actually on the tube; the HUD draws above it and
 * does its own thing.
 */

import {
  DEPTH_CUE_MIN_INTENSITY,
  DEPTH_CUE_SHIFT,
  FAR_CLIP_UNITS,
  GROUND_PLANE_UNITS,
  INTENSITY_MAX,
  NEAR_CLIP_UNITS,
  SCREEN_SCALE,
} from '../data/constants';
import type { WireModel } from '../data/types';
import { wrapCoordinate } from '../game/collision';
import type { Vec2, Vec3 } from '../game/types';
import { rotateY } from '../engine/math';
import { VIEW_CLIP, clipSegment } from './clip';
import type { VectorDisplay } from './vectorDisplay';

export interface Camera {
  pos: Vec2;
  heading: number;
  eyeHeight: number;
}

/** Lifts a ROM model's vertical units onto the world's ground plane. */
const MODEL_GROUND_LIFT = -GROUND_PLANE_UNITS;

const DEPTH_CUE_FLOOR = DEPTH_CUE_MIN_INTENSITY / 0xff;

/**
 * Takes a world point into view space: relative to the eye, looking down +Z.
 *
 * The ground is a torus and every position is stored wrapped onto it, so the
 * distance to a thing is the short way round - which is how the simulation
 * measures it everywhere (`octagonalDistance`, `bearingTo`). Subtracting the raw
 * coordinates instead puts a player at one end of the number line and the ground
 * in front of them at the other: 63,000 units away rather than 2,000, behind
 * rather than ahead, and culled. A player crossing the seam - which happens
 * every twenty seconds or so of driving - watched the battlefield in front of
 * them disappear.
 */
function toView(cam: Camera, p: Vec3): Vec3 {
  return rotateY(
    {
      x: wrapCoordinate(p.x - cam.pos.x),
      y: p.y - cam.eyeHeight,
      z: wrapCoordinate(p.z - cam.pos.z),
    },
    -cam.heading,
  );
}

function projectView(v: Vec3): { x: number; y: number } {
  return { x: (SCREEN_SCALE * v.x) / v.z, y: (SCREEN_SCALE * v.y) / v.z };
}

/**
 * Depth cueing: `DQUE`, the high nibble of the view depth, is subtracted from the
 * object's intensity and clamped to a floor of 0x30
 * (BZONE.MAC.txt:3761-3775, 3989-3991).
 *
 * A depth behind the eye has no cue to give - and it can reach here, since an
 * edge of an accepted object is drawn wherever its own vertices fall. Left
 * unclamped it lifts the intensity above `base`, and an alpha over 1 is not an
 * error a canvas reports: the setter drops it and the line is stroked with
 * whatever the line before it left behind.
 */
export function depthIntensity(base: number, depth: number): number {
  const cue = Math.floor(Math.max(depth, 0) / 2 ** DEPTH_CUE_SHIFT) / INTENSITY_MAX;
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
 * Projects a free-standing segment - one that is not part of a ROM object, and
 * so has no object position for ROTPNT to judge - clipping it at the near and
 * far planes rather than dropping it, then to the 3D view window.  Returns null
 * only when nothing of it is visible.
 *
 * A model's edges do not come through here: `drawModel` puts the object through
 * ROTPNT's own accept-or-reject, which is what the original did.
 */
export function projectSegment(
  cam: Camera,
  a: Vec3,
  b: Vec3,
): { x0: number; y0: number; x1: number; y1: number } | null {
  return clipAndProject(toView(cam, a), toView(cam, b), NEAR_CLIP_UNITS, FAR_CLIP_UNITS);
}

/**
 * The depth ahead of the eye at which a model's own edges are cut.
 *
 * ROTPNT decides near and far for the object as a whole, so an edge is not
 * measured against those planes again - that is what used to saw models in half.
 * What is left is arithmetic: the perspective divide needs a depth in front of
 * the eye, and a vertex behind it would come back mirrored. A hair in front is
 * enough, and the window clip takes care of where it lands.
 */
const EYE_CLIP_UNITS = 1;

/**
 * ROTPNT's object test: whether a whole object is drawn at all
 * (BZONE.MAC.txt:3313-3387).
 *
 * The original decided this once, for the object's own position, and then drew
 * every vector of it - the hardware window circuit was the only other thing that
 * could stop a vector, and it worked in screen space. Applying the depth planes
 * to each edge instead trims the edges that cross one, which shows up as a tank
 * losing its turret and a box losing its far face as they near the draw
 * distance.
 */
export function objectInView(cam: Camera, pos: Vec3): boolean {
  const z = toView(cam, pos).z;
  return z >= NEAR_CLIP_UNITS && z <= FAR_CLIP_UNITS;
}

/** The depth-clip, project and window-clip half of `projectSegment`. */
function clipAndProject(
  start: Vec3,
  end: Vec3,
  near: number,
  far: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let va = start;
  let vb = end;

  if (va.z < near && vb.z < near) return null;
  if (va.z > far && vb.z > far) return null;
  if (va.z < near) va = atDepth(va, vb, near);
  else if (vb.z < near) vb = atDepth(vb, va, near);
  if (va.z > far) va = atDepth(va, vb, far);
  else if (vb.z > far) vb = atDepth(vb, va, far);

  const sa = projectView(va);
  const sb = projectView(vb);
  const clipped = clipSegment(sa.x, sa.y, sb.x, sb.y, VIEW_CLIP);
  if (!clipped) return null;
  return { x0: clipped[0], y0: clipped[1], x1: clipped[2], y1: clipped[3] };
}

/**
 * Draws a ROM wireframe model at a world position, yawed by `rot.y`.  The
 * original never pitched or rolled anything (design spec 5.3), so `rot.x` and
 * `rot.z` are accepted for symmetry with `Debris.rot` and ignored.
 *
 * A model with no edges is a dot cloud - the missile's exhaust spatter and the
 * shell burst are drawn with `TDOT`, one lit point per vertex and no lines
 * between them (`DOT_MODEL_NAMES` in `data/models.ts`) - and a self-referencing
 * edge is the same thing for one vertex.  Dots are lit vectors of zero length,
 * which is how the ROM drew them too.
 *
 * `opts.depthCue` turns off the distance fade: the saucer and the attract logo
 * set their brightness with `SINT` and never go through `DQUE`
 * (docs/reference/atari-source-notes.md, "Depth cueing and clipping").
 */
export function drawModel(
  d: VectorDisplay,
  cam: Camera,
  model: WireModel,
  pos: Vec3,
  rot: Vec3,
  intensity = 1,
  opts?: { depthCue?: boolean },
): void {
  // ROTPNT takes the object or leaves it, once, on its own position; see
  // `objectInView`.
  if (!objectInView(cam, pos)) return;

  const depthCue = opts?.depthCue ?? true;
  const litAt = (base: number, depth: number): number =>
    depthCue ? depthIntensity(base, depth) : base;

  // The object is placed once and its vertices hang off that, which is both what
  // the original did - ROTPNT rotates the object's position and the vector
  // generator draws the picture relative to it - and the only way a model stays
  // rigid on a torus. Taking each vertex into view space on its own would wrap
  // the ones past the seam to the far side of the world, and a shape sitting on
  // that line would be drawn with its corners 65,000 units apart.
  const origin = toView(cam, { x: pos.x, y: pos.y + MODEL_GROUND_LIFT, z: pos.z });
  // ROM vertices are [forward, left, up]; render space is (-left, up, forward).
  const views = model.vertices.map((v) => {
    const local = rotateY({ x: -v[1], y: v[2], z: v[0] }, rot.y);
    // The offset turns with the camera, exactly as the position did.
    const seen = rotateY(local, -cam.heading);
    return { x: origin.x + seen.x, y: origin.y + seen.y, z: origin.z + seen.z };
  });

  const draw = (a: Vec3, b: Vec3): void => {
    const seg = clipAndProject(a, b, EYE_CLIP_UNITS, Infinity);
    if (!seg) return;
    d.line(seg.x0, seg.y0, seg.x1, seg.y1, litAt(intensity, (a.z + b.z) / 2));
  };

  if (model.edges.length === 0) {
    for (const v of views) draw(v, v);
    return;
  }

  for (const [i, j] of model.edges) {
    const a = views[i];
    const b = views[j];
    if (!a || !b) continue;
    draw(a, b);
  }
}
