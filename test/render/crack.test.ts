import { describe, expect, it } from 'vitest';
import {
  CRACK_GROUPS,
  FULL_WINDOW,
  SCREEN_HALF_HEIGHT,
  SCREEN_HALF_WIDTH,
} from '../../src/data/constants';
import { SCREEN_CRACK_FULL, SCREEN_CRACK_GROUPS } from '../../src/data/pictures';
import { drawCrack } from '../../src/render/crack';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

function draw(progress: number): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  drawCrack(d, progress);
  d.endFrame();
  return d.lines;
}

/** Segments of a picture as comparable strings, so order does not matter. */
function segmentsOf(polylines: Picture2DPolylines): string[] {
  const out: string[] = [];
  for (const line of polylines) {
    for (let i = 1; i < line.length; i += 1) {
      out.push(`${line[i - 1]![0]},${line[i - 1]![1]},${line[i]![0]},${line[i]![1]}`);
    }
  }
  return out;
}

type Picture2DPolylines = readonly (readonly (readonly [number, number])[])[];

const key = (l: RecordedLine): string => `${l.x0},${l.y0},${l.x1},${l.y1}`;

/** Segments in each group if its own coordinates were taken as absolute. */
const groupSegmentCounts = SCREEN_CRACK_GROUPS.map((g) => segmentsOf(g.polylines).length);

describe('drawCrack', () => {
  it('draws the first group as soon as the sequence starts', () => {
    expect(draw(0)).toHaveLength(groupSegmentCounts[0]!);
  });

  it('accumulates one more group per eighth of the sequence', () => {
    let expected = 0;
    for (let group = 0; group < CRACK_GROUPS; group += 1) {
      expected += groupSegmentCounts[group]!;
      expect(draw(group / CRACK_GROUPS)).toHaveLength(expected);
    }
  });

  it('draws the whole ROM crack picture at full progress', () => {
    const drawn = draw(1).map(key).sort();
    expect(drawn).toEqual(segmentsOf(SCREEN_CRACK_FULL.polylines).sort());
  });

  it('holds the whole picture past the end of the sequence', () => {
    expect(draw(3).map(key).sort()).toEqual(draw(1).map(key).sort());
  });

  it('draws nothing before the sequence starts', () => {
    expect(draw(-0.1)).toHaveLength(0);
  });

  it('draws every segment at the same intensity', () => {
    const intensities = new Set(draw(1).map((l) => l.intensity));
    expect(intensities.size).toBe(1);
    // Intensity 12 of 15, as the reference reads the crack strokes.
    expect([...intensities][0]).toBeCloseTo(12 / 15, 6);
  });

  it('starts the first group from screen centre', () => {
    // Group 0 begins with CNTR, so its coordinates are already absolute.
    const first = draw(0)[0]!;
    expect([first.x0, first.y0]).toEqual([...SCREEN_CRACK_GROUPS[0]!.polylines[0]![0]!]);
  });

  it('stays inside the ROM window, overrunning the tube top and bottom', () => {
    const lines = draw(1);
    for (const l of lines) {
      for (const x of [l.x0, l.x1]) {
        expect(x).toBeGreaterThanOrEqual(FULL_WINDOW.left);
        expect(x).toBeLessThanOrEqual(FULL_WINDOW.right);
        expect(Math.abs(x)).toBeLessThanOrEqual(SCREEN_HALF_WIDTH);
      }
      for (const y of [l.y0, l.y1]) {
        expect(y).toBeGreaterThanOrEqual(FULL_WINDOW.bottom);
        expect(y).toBeLessThanOrEqual(FULL_WINDOW.top);
      }
    }
    // Faithful: `BIGWND` opens the window to +/-508 in both axes, but the tube is
    // 4:3 and only shows +/-384 vertically, so the ROM's own crack art runs off
    // the top and the bottom of the picture. Nothing clips it here; the canvas
    // display clips to the letterboxed screen when it draws.
    const overrun = lines.filter(
      (l) => Math.max(Math.abs(l.y0), Math.abs(l.y1)) > SCREEN_HALF_HEIGHT,
    );
    expect(overrun.length).toBeGreaterThan(0);
  });
});
