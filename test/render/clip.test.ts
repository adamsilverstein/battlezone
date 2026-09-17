import { describe, expect, it } from 'vitest';
import { SCREEN_HALF_HEIGHT, SCREEN_HALF_WIDTH, VIEW_WINDOW } from '../../src/data/constants';
import { VIEW_CLIP, clipSegment } from '../../src/render/clip';

describe('VIEW_CLIP', () => {
  it('keeps the ROM window horizontally but stops at the bottom of the tube', () => {
    expect(VIEW_CLIP.left).toBe(VIEW_WINDOW.left);
    expect(VIEW_CLIP.right).toBe(VIEW_WINDOW.right);
    expect(VIEW_CLIP.top).toBe(VIEW_WINDOW.top);
    // VIEW_WINDOW.bottom is -508, which is off the bottom of a 4:3 screen.
    expect(VIEW_CLIP.bottom).toBe(-SCREEN_HALF_HEIGHT);
  });

  it('never reaches outside the visible display area', () => {
    expect(VIEW_CLIP.left).toBeGreaterThanOrEqual(-SCREEN_HALF_WIDTH);
    expect(VIEW_CLIP.right).toBeLessThanOrEqual(SCREEN_HALF_WIDTH);
    expect(VIEW_CLIP.top).toBeLessThanOrEqual(SCREEN_HALF_HEIGHT);
  });
});

const rect = { left: -100, right: 100, bottom: -100, top: 100 };

describe('clipSegment', () => {
  it('passes a segment wholly inside through unchanged', () => {
    expect(clipSegment(-10, -10, 50, 60, rect)).toEqual([-10, -10, 50, 60]);
  });

  it('rejects a segment wholly outside', () => {
    expect(clipSegment(200, 0, 300, 0, rect)).toBeNull();
    expect(clipSegment(0, 200, 0, 300, rect)).toBeNull();
    expect(clipSegment(-300, -300, -200, -200, rect)).toBeNull();
  });

  it('trims a segment that leaves through one edge', () => {
    expect(clipSegment(0, 0, 200, 0, rect)).toEqual([0, 0, 100, 0]);
    expect(clipSegment(0, 0, 0, -400, rect)).toEqual([0, 0, 0, -100]);
  });

  it('trims both ends of a segment crossing right through', () => {
    expect(clipSegment(-200, 0, 200, 0, rect)).toEqual([-100, 0, 100, 0]);
  });

  it('keeps the original direction', () => {
    expect(clipSegment(200, 0, -200, 0, rect)).toEqual([100, 0, -100, 0]);
  });

  it('clips a diagonal at the corner it actually crosses', () => {
    const clipped = clipSegment(-200, -200, 200, 200, rect);
    expect(clipped).not.toBeNull();
    const [x0, y0, x1, y1] = clipped!;
    expect(x0).toBeCloseTo(-100, 9);
    expect(y0).toBeCloseTo(-100, 9);
    expect(x1).toBeCloseTo(100, 9);
    expect(y1).toBeCloseTo(100, 9);
  });

  it('rejects a diagonal that passes outside a corner', () => {
    // x + y = -250 stays beyond the bottom-left corner at (-100, -100).
    expect(clipSegment(-250, 0, 0, -250, rect)).toBeNull();
  });

  it('keeps a degenerate point inside the rect and rejects one outside', () => {
    expect(clipSegment(5, 5, 5, 5, rect)).toEqual([5, 5, 5, 5]);
    expect(clipSegment(500, 5, 500, 5, rect)).toBeNull();
  });
});
