/**
 * The ROM string table and the two primitives everything on the screen is drawn
 * with: a string at a table entry's own position and size, and a vector-ROM
 * picture at an offset.  (Source citations are to the Atari listings at
 * https://github.com/historicalsource/battlezone, not to anything in this tree.)
 *
 * `MESSAGES` in `data/pictures.ts` stores each string with the coordinates the
 * ROM's `DrawStringPtr` table gives it, in quarter units, and its index - and the
 * index is what picks the size, since strings up to `$12` are drawn at `SCAL 2`,
 * half the size of the rest (reference section 6).  Both the HUD and the
 * full-screen displays need that, so it lives here rather than in either of them.
 *
 * Stroke intensities are the ROM's nibbles read on the vector generator's 0..15
 * scale, the same convention `render/scene.ts` uses for the backdrop.
 */

import { INTENSITY_MAX, SCORE_BCD_BYTES, SCORE_UNIT } from '../data/constants';
import { MESSAGES, type MessageEntry } from '../data/pictures';
import type { Picture2D } from '../data/types';
import { drawText } from './text';
import type { VectorDisplay } from './vectorDisplay';

/** Message positions are stored in quarter units (`MessageEntry`). */
export const MESSAGE_POSITION_SCALE = 4;

/** Text is drawn at intensity 12 (reference section 6). */
export const TEXT_INTENSITY = 12 / INTENSITY_MAX;

/** Strings up to index `$12` are drawn at the ROM's SCAL 2 (`DrawStringPtr`). */
const HALF_SIZE_LAST_INDEX = 0x12;
export const FULL_SIZE_SCALE = 1;
export const HALF_SIZE_SCALE = 0.5;

/** How many BCD digits the ROM prints in front of a score string's thousands. */
export const SCORE_DIGITS = SCORE_BCD_BYTES * 2;

const MESSAGES_BY_LABEL = new Map(MESSAGES.map((m) => [m.label, m]));

/** One entry of the ROM string table, by the label the disassembly gives it. */
export function message(label: string): MessageEntry {
  const entry = MESSAGES_BY_LABEL.get(label);
  if (!entry) throw new Error(`messages: no message labelled ${label}`);
  return entry;
}

/** The size the ROM draws a string at: half for the low indices, full for the rest. */
export function messageScale(entry: MessageEntry): number {
  return entry.index <= HALF_SIZE_LAST_INDEX ? HALF_SIZE_SCALE : FULL_SIZE_SCALE;
}

/**
 * Draws one ROM string at its stored position and size, with `text` substituted
 * for the ROM's own where the string carries digits.
 */
export function drawMessage(d: VectorDisplay, entry: MessageEntry, text = entry.text): void {
  drawText(
    d,
    text,
    entry.x * MESSAGE_POSITION_SCALE,
    entry.y * MESSAGE_POSITION_SCALE,
    messageScale(entry),
    { intensity: TEXT_INTENSITY },
  );
}

/** Draws a 2D picture with its ROM coordinates offset to (dx, dy). */
export function drawPicture(
  d: VectorDisplay,
  picture: Picture2D,
  dx: number,
  dy: number,
  intensity: number,
): void {
  for (const stroke of picture.polylines) {
    d.polyline(
      stroke.map(([x, y]) => [x + dx, y + dy] as const),
      intensity,
    );
  }
}

/**
 * A score as the ROM prints it: four BCD digits in units of 1000, with leading
 * zeros blanked, so a score of zero is four spaces and the string's own literal
 * "000" carries the display (`DrawNDigits`, reference section 1).
 */
export function scoreDigits(score: number): string {
  const units = Math.min(Math.floor(score / SCORE_UNIT), 10 ** SCORE_DIGITS - 1);
  return (units === 0 ? '' : String(units)).padStart(SCORE_DIGITS, ' ');
}
