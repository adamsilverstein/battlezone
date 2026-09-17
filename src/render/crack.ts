/**
 * The shattered windshield drawn over the frozen view when the player is killed
 * (docs/reference/original-game.md section 4).
 *
 * `CRACKS` is a table of eight vector-ROM subroutines.  The ROM sets `CRACK` to 2
 * the moment the player is hit and adds 2 per tick; `WNSHLD` then emits the first
 * `CRACK / 2` groups every tick, so the web of cracks accumulates one group per
 * tick over eight ticks and then holds while the death sequence runs out
 * (BZONE.MAC.txt:1231-1345, `CRACK_*` in `data/constants.ts`).
 *
 * The groups are not independent pictures: group 0 starts with `CNTR`, so its
 * coordinates are screen-centre relative, and each later group continues from
 * wherever the previous one left the beam.  `absoluteGroups` walks the table once
 * and adds up those pen positions, which is also how `SCREEN_CRACK_FULL` was
 * generated - drawing every group here gives exactly that picture.
 *
 * Nothing is clipped: like the rest of the HUD this is drawn after `BIGWND`
 * re-opens the window to the full screen, and the canvas display clips whatever
 * runs off the tube.
 */

import { CRACK_GROUPS, INTENSITY_MAX } from '../data/constants';
import { SCREEN_CRACK_GROUPS } from '../data/pictures';
import type { VectorDisplay } from './vectorDisplay';

/** The crack strokes are drawn at intensity 12 (reference section 4). */
const CRACK_INTENSITY = 12 / INTENSITY_MAX;

type Polylines = readonly (readonly (readonly [number, number])[])[];

/**
 * The eight groups with every pen position resolved, so each group can be drawn
 * on its own.  The beam position carries across polylines *and* groups, so the
 * offset a group is drawn at is the last point of the previous group.
 */
function absoluteGroups(): Polylines[] {
  const groups: Polylines[] = [];
  let penX = 0;
  let penY = 0;

  for (const group of SCREEN_CRACK_GROUPS) {
    const offsetX = penX;
    const offsetY = penY;
    const resolved: (readonly [number, number])[][] = [];
    for (const polyline of group.polylines) {
      const points = polyline.map(([x, y]) => [x + offsetX, y + offsetY] as const);
      resolved.push(points);
      const last = points[points.length - 1];
      if (last) [penX, penY] = last;
    }
    groups.push(resolved);
  }

  return groups;
}

const CRACK_GROUPS_ABSOLUTE = absoluteGroups();

/**
 * Draws the crack as far as it has spread.  `progress` runs 0..1 over the eight
 * groups: group `k` appears once `progress` reaches `k / CRACK_GROUPS`, so 0
 * shows the first group (the ROM already draws one on the tick of the hit) and
 * anything at or above 1 shows all eight.  Negative progress draws nothing,
 * which is the view before the player is hit.
 */
export function drawCrack(d: VectorDisplay, progress: number): void {
  if (progress < 0) return;
  const shown = Math.min(Math.floor(progress * CRACK_GROUPS) + 1, CRACK_GROUPS);
  for (let group = 0; group < shown; group += 1) {
    for (const polyline of CRACK_GROUPS_ABSOLUTE[group]!) {
      d.polyline(polyline, CRACK_INTENSITY);
    }
  }
}
