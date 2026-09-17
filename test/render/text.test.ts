import { describe, expect, it } from 'vitest';
import { CELL_ADVANCE, CELL_HEIGHT, CELL_WIDTH, FONT } from '../../src/data/font';
import { createRecordingDisplay } from '../../src/render/vectorDisplay';
import { drawText, measureText } from '../../src/render/text';

describe('measureText', () => {
  it('advances one cell per character', () => {
    expect(measureText('A', 1)).toBe(CELL_ADVANCE);
    expect(measureText('ABC', 1)).toBe(CELL_ADVANCE * 3);
    expect(measureText('', 1)).toBe(0);
  });

  it('scales with the scale factor', () => {
    expect(measureText('ABC', 0.5)).toBe(CELL_ADVANCE * 1.5);
  });
});

describe('drawText', () => {
  it('returns the measured width', () => {
    const d = createRecordingDisplay();
    expect(drawText(d, 'SCORE', 0, 0, 2)).toBe(measureText('SCORE', 2));
  });

  it('draws strokes for every glyph in the font', () => {
    for (const [char, glyph] of Object.entries(FONT)) {
      const d = createRecordingDisplay();
      drawText(d, char, 0, 0, 1);
      const expected = glyph.polylines.reduce((n, p) => n + Math.max(p.length - 1, 1), 0);
      expect(d.lines.length, `glyph ${JSON.stringify(char)}`).toBe(expected);
    }
  });

  it('draws nothing for a space', () => {
    const d = createRecordingDisplay();
    drawText(d, ' ', 0, 0, 1);
    expect(d.lines).toHaveLength(0);
  });

  it('falls back to a blank cell for characters the font lacks', () => {
    const d = createRecordingDisplay();
    const width = drawText(d, 'A?A', 0, 0, 1);
    expect(width).toBe(CELL_ADVANCE * 3);
    // Both 'A's are drawn, one cell apart, and nothing for the '?'.
    const xs = d.lines.map((l) => l.x0);
    expect(Math.min(...xs)).toBeLessThan(CELL_ADVANCE);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(CELL_ADVANCE * 2);
  });

  it('places a left-aligned string with its cell origin at x, y', () => {
    const d = createRecordingDisplay();
    drawText(d, 'A', 100, 200, 1);
    for (const l of d.lines) {
      expect(l.x0).toBeGreaterThanOrEqual(100);
      expect(l.x0).toBeLessThanOrEqual(100 + CELL_WIDTH);
      expect(l.y0).toBeGreaterThanOrEqual(200);
      expect(l.y0).toBeLessThanOrEqual(200 + CELL_HEIGHT);
    }
  });

  it('centres and right-aligns around x', () => {
    const left = createRecordingDisplay();
    const centre = createRecordingDisplay();
    const right = createRecordingDisplay();
    drawText(left, 'AB', 0, 0, 1);
    drawText(centre, 'AB', 0, 0, 1, { align: 'center' });
    drawText(right, 'AB', 0, 0, 1, { align: 'right' });
    const width = measureText('AB', 1);
    expect(centre.lines[0]!.x0).toBeCloseTo(left.lines[0]!.x0 - width / 2, 9);
    expect(right.lines[0]!.x0).toBeCloseTo(left.lines[0]!.x0 - width, 9);
  });

  it('scales glyph strokes', () => {
    const one = createRecordingDisplay();
    const two = createRecordingDisplay();
    drawText(one, 'Z', 0, 0, 1);
    drawText(two, 'Z', 0, 0, 2);
    expect(two.lines[0]!.x1).toBeCloseTo(one.lines[0]!.x1 * 2, 9);
    expect(two.lines[0]!.y1).toBeCloseTo(one.lines[0]!.y1 * 2, 9);
  });

  it('passes the intensity through to the display', () => {
    const d = createRecordingDisplay();
    drawText(d, 'X', 0, 0, 1, { intensity: 0.4 });
    expect(d.lines.every((l) => l.intensity === 0.4)).toBe(true);
  });
});
