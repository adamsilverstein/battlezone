/**
 * The backdrop: horizon line, mountain range, crescent moon and erupting
 * volcano.  All of it sits at infinite distance - the original drew it as a flat
 * 2D strip offset by the heading alone, with no parallax at all, which is why
 * the mountains and the obstacles slide at different rates when you spin
 * (docs/reference/original-game.md section 1).
 *
 * The strip is 4096 units wide for a full turn, so a feature at range coordinate
 * R lands at `rangeToScreenX(R, heading12)` (see `data/mountains.ts`).  The ROM's
 * `TANGLE` counts the opposite way round from `Player.heading` - increasing it
 * turns left - so the heading is negated on the way in.
 *
 * Everything is clipped to `VIEW_CLIP`, which is what the hardware window circuit
 * did for the 3D view, narrowed to what is actually on the tube.
 */

import { HEADING_UNITS, MOUNTAIN_SEGMENTS, SEGMENT_WIDTH, rangeToScreenX } from '../data/mountains';
import {
  HORIZON_Y,
  INTENSITY_MAX,
  SCREEN_HALF_WIDTH,
  VOLCANO_CRATER_Y,
  VOLCANO_RANGE_X,
  VOLCANO_ROCK_FALL_LIMIT,
  VOLCANO_ROCK_GRAVITY,
  VOLCANO_ROCK_LIFETIME_TICKS,
  VOLCANO_ROCK_SLOTS,
  VOLCANO_ROCK_VX_MAX,
  VOLCANO_ROCK_VX_MIN,
  VOLCANO_ROCK_VY_MAX,
  VOLCANO_ROCK_VY_MIN,
} from '../data/constants';
import { TAU } from '../engine/math';
import type { Camera } from './camera';
import { VIEW_CLIP, clipSegment } from './clip';
import type { VectorDisplay } from './vectorDisplay';

/**
 * Backdrop brightness.  The sources disagree on the scale - the vector ROM decode
 * in `data/pictures.ts` reads the horizon stroke as intensity 3, the disassembly
 * notes call it 6 (docs/reference/original-game.md section 1) - so this takes the
 * higher reading against the vector generator's 0..15 range, which puts the
 * backdrop clearly below full-intensity foreground objects.  The volcano rocks
 * take theirs from the top three bits of their remaining lifetime, as the ROM does.
 */
const BACKDROP_INTENSITY = 6 / INTENSITY_MAX;

/**
 * A rock's brightness is the top three bits of its five-bit remaining lifetime,
 * so 0..7; the vector generator's object intensity is 0..15, so the level is
 * doubled to put both on the one scale.
 */
const ROCK_LIFETIME_BITS_DROPPED = 2;
const ROCK_INTENSITY_STEP = 2;

/** Draws one segment of the flat backdrop, clipped to the 3D view window. */
function backdropLine(
  d: VectorDisplay,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  intensity: number,
): void {
  const clipped = clipSegment(x0, y0, x1, y1, VIEW_CLIP);
  if (clipped) d.line(clipped[0], clipped[1], clipped[2], clipped[3], intensity);
}

/** `Player.heading` as the ROM's 12-bit backdrop offset, 0..4095. */
function headingToStripUnits(heading: number): number {
  const turns = -heading / TAU;
  return (turns - Math.floor(turns)) * HEADING_UNITS;
}

function drawMountains(d: VectorDisplay, heading12: number): void {
  for (let segment = 0; segment < MOUNTAIN_SEGMENTS.length; segment += 1) {
    const left = rangeToScreenX(segment * SEGMENT_WIDTH, heading12);
    // Skip segments whose whole 512-unit span is off the side of the screen.
    if (left > VIEW_CLIP.right || left + SEGMENT_WIDTH < VIEW_CLIP.left) continue;
    for (const polyline of MOUNTAIN_SEGMENTS[segment]!.polylines) {
      for (let i = 1; i < polyline.length; i += 1) {
        const [x0, y0] = polyline[i - 1]!;
        const [x1, y1] = polyline[i]!;
        backdropLine(d, left + x0, y0, left + x1, y1, BACKDROP_INTENSITY);
      }
    }
  }
}

/**
 * Arbitrary: these only keep the five slots out of lockstep.  They carry no
 * meaning from the ROM and nothing should be derived from them.
 */
const ROCK_SLOT_PERIOD_PAD = 8;
const ROCK_SLOT_PERIOD_STEP = 5;
const ROCK_SLOT_PHASE_STEP = 11;

/**
 * The eruption.  `VOLCNO` (BZONE.MAC.txt:2721-2839) keeps five rock slots, each
 * with a 1-in-8 chance per tick of launching with a random arc.  The backdrop has
 * no simulation state of its own here, so the slots are driven straight off the
 * tick with staggered periods: the rocks still arc, fade and stream at the ROM's
 * rate, but which rock launches when is decorative rather than authentic.
 *
 * Task 6 (`game/explosions.ts`) owns the real `VOLCNO` state, seeded from the
 * world's `Rng`; when it lands, this should read the rocks from the world
 * instead of inventing them.
 */
function drawVolcano(d: VectorDisplay, heading12: number, tick: number): void {
  const craterX = rangeToScreenX(VOLCANO_RANGE_X, heading12);
  const vxRange = VOLCANO_ROCK_VX_MAX - VOLCANO_ROCK_VX_MIN + 1;
  const vyRange = VOLCANO_ROCK_VY_MAX - VOLCANO_ROCK_VY_MIN + 1;

  for (let slot = 0; slot < VOLCANO_ROCK_SLOTS; slot += 1) {
    const period =
      VOLCANO_ROCK_LIFETIME_TICKS + ROCK_SLOT_PERIOD_PAD + slot * ROCK_SLOT_PERIOD_STEP;
    const age = (tick + slot * ROCK_SLOT_PHASE_STEP) % period;
    if (age >= VOLCANO_ROCK_LIFETIME_TICKS) continue;

    const vx = (VOLCANO_ROCK_VX_MIN + (slot % vxRange)) * (slot % 2 === 0 ? 1 : -1);
    const vy = VOLCANO_ROCK_VY_MIN + ((slot * 3) % vyRange);
    const x = craterX + vx * age;
    // Integrated arc: vy falls by one per tick, so the drop is triangular.
    const y = VOLCANO_CRATER_Y + vy * age + (VOLCANO_ROCK_GRAVITY * age * (age - 1)) / 2;
    if (y < VOLCANO_CRATER_Y - VOLCANO_ROCK_FALL_LIMIT) continue;

    const life = VOLCANO_ROCK_LIFETIME_TICKS - age;
    const level = Math.max(life >> ROCK_LIFETIME_BITS_DROPPED, 1);
    backdropLine(d, x, y, x, y, (level * ROCK_INTENSITY_STEP) / INTENSITY_MAX);
  }
}

/**
 * Draws the horizon line, the mountain range (the crescent moon is part of
 * segment 0 of the ROM strip, so it comes along with it) and the eruption.
 */
export function drawHorizon(d: VectorDisplay, cam: Camera, tick: number): void {
  const heading12 = headingToStripUnits(cam.heading);
  // HORIZN is one 1536-unit vector drawn from a moving start, so it always
  // overran the screen; draw the full width and let the window clip it.
  backdropLine(d, -SCREEN_HALF_WIDTH, HORIZON_Y, SCREEN_HALF_WIDTH, HORIZON_Y, BACKDROP_INTENSITY);
  drawMountains(d, heading12);
  drawVolcano(d, heading12, tick);
}
