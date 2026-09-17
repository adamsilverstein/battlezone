/**
 * 2D segment clipping against the screen windows the original set up in
 * hardware.  The arcade hardware had a window circuit that blanked the beam
 * outside the current window, so the game never clipped in software: the 3D view
 * window stopped at y = +192 and the status strip above it used the full screen
 * (`VIEW_WINDOW` / `FULL_WINDOW` in `data/constants.ts`).  A canvas has no such
 * circuit, so the renderer clips instead.
 *
 * Liang-Barsky: the parametric range [0, 1] along the segment is narrowed one
 * edge at a time.  Segments that leave and re-enter cannot happen with a convex
 * rectangle, so one pass is enough.
 */

export interface ClipRect {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * Clips a segment to `rect`.  Returns the trimmed endpoints, or null when the
 * segment is entirely outside.  A degenerate (zero-length) segment - the ROM
 * draws dots that way - survives if its point is inside.
 */
export function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: ClipRect,
): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tMin = 0;
  let tMax = 1;

  // For each edge: p + t * q <= 0 must hold, where q is the outward distance.
  const edges: [number, number][] = [
    [-dx, x0 - rect.left],
    [dx, rect.right - x0],
    [-dy, y0 - rect.bottom],
    [dy, rect.top - y0],
  ];

  for (const [p, q] of edges) {
    if (p === 0) {
      // Parallel to this edge: outside it means the whole segment is outside.
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > tMax) return null;
      if (t > tMin) tMin = t;
    } else {
      if (t < tMin) return null;
      if (t < tMax) tMax = t;
    }
  }

  return [x0 + tMin * dx, y0 + tMin * dy, x0 + tMax * dx, y0 + tMax * dy];
}
