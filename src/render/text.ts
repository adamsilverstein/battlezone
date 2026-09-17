/**
 * Draws strings with the original's vector font (`data/font.ts`).
 *
 * Glyph strokes live in a cell 16 units wide and 24 tall with its origin at the
 * bottom-left; every glyph advances 24 units, so text is monospaced.  `scale` is
 * a multiplier on those units - the ROM picked between whole-number `SCAL`
 * settings, so the HUD uses 1 for headings and 0.5 for the half-size lines
 * described in design spec 5.4.
 *
 * The font has no lower case, so text is upper-cased before lookup; anything it
 * still cannot draw advances as a blank rather than disappearing, which keeps
 * strings aligned.
 */

import { CELL_ADVANCE, FONT } from '../data/font';
import type { VectorDisplay } from './vectorDisplay';

/** Cell advance for one character; every ROM glyph advances by `CELL_ADVANCE`. */
function advanceOf(char: string): number {
  return FONT[char]?.advance ?? CELL_ADVANCE;
}

/** Width of `text` in vector units at `scale`. */
export function measureText(text: string, scale: number): number {
  let width = 0;
  for (const char of text.toUpperCase()) width += advanceOf(char);
  return width * scale;
}

/**
 * Draws `text` with the cell origin of the first glyph at (x, y), so the strokes
 * occupy y .. y + 24 * scale.  Returns the width drawn.
 */
export function drawText(
  d: VectorDisplay,
  text: string,
  x: number,
  y: number,
  scale: number,
  opts?: { align?: 'left' | 'center' | 'right'; intensity?: number },
): number {
  const width = measureText(text, scale);
  const align = opts?.align ?? 'left';
  let penX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;

  for (const char of text.toUpperCase()) {
    const glyph = FONT[char];
    if (glyph) {
      for (const stroke of glyph.polylines) {
        d.polyline(
          stroke.map(([gx, gy]) => [penX + gx * scale, y + gy * scale] as const),
          opts?.intensity,
        );
      }
    }
    penX += advanceOf(char) * scale;
  }

  return width;
}
