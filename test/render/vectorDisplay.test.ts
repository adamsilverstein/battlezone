import { describe, expect, it } from 'vitest';
import { SCREEN_HALF_HEIGHT, SCREEN_HALF_WIDTH } from '../../src/data/constants';
import {
  createRecordingDisplay,
  letterboxTransform,
  screenToCanvas,
} from '../../src/render/vectorDisplay';

describe('createRecordingDisplay', () => {
  it('reports the logical display size', () => {
    const d = createRecordingDisplay();
    expect(d.width).toBe(SCREEN_HALF_WIDTH * 2);
    expect(d.height).toBe(SCREEN_HALF_HEIGHT * 2);
  });

  it('captures lines with a default full intensity', () => {
    const d = createRecordingDisplay();
    d.beginFrame();
    d.line(-10, 0, 10, 20);
    d.endFrame();
    expect(d.lines).toEqual([{ x0: -10, y0: 0, x1: 10, y1: 20, intensity: 1 }]);
  });

  it('keeps the intensity it was given', () => {
    const d = createRecordingDisplay();
    d.line(0, 0, 1, 1, 0.25);
    expect(d.lines[0]?.intensity).toBe(0.25);
  });

  it('expands a polyline into one line per segment', () => {
    const d = createRecordingDisplay();
    d.polyline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      0.5,
    );
    expect(d.lines).toEqual([
      { x0: 0, y0: 0, x1: 10, y1: 0, intensity: 0.5 },
      { x0: 10, y0: 0, x1: 10, y1: 10, intensity: 0.5 },
    ]);
  });

  it('draws a one-point polyline as a dot', () => {
    const d = createRecordingDisplay();
    d.polyline([[7, -7]]);
    expect(d.lines).toEqual([{ x0: 7, y0: -7, x1: 7, y1: -7, intensity: 1 }]);
  });

  it('ignores an empty polyline', () => {
    const d = createRecordingDisplay();
    d.polyline([]);
    expect(d.lines).toHaveLength(0);
  });

  it('clears on beginFrame and on demand', () => {
    const d = createRecordingDisplay();
    d.line(0, 0, 1, 1);
    d.beginFrame();
    expect(d.lines).toHaveLength(0);
    d.line(0, 0, 1, 1);
    d.clear();
    expect(d.lines).toHaveLength(0);
  });
});

describe('letterboxTransform', () => {
  it('fits exactly with no offset at the display aspect', () => {
    const t = letterboxTransform(1024, 768);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(0);
  });

  it('limits by height and bars the sides on a wide viewport', () => {
    const t = letterboxTransform(2048, 768);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(512);
    expect(t.offsetY).toBe(0);
  });

  it('limits by width and bars the top on a tall viewport', () => {
    const t = letterboxTransform(1024, 1536);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(384);
  });

  it('scales down proportionally', () => {
    const t = letterboxTransform(512, 384);
    expect(t.scale).toBe(0.5);
  });

  it('never returns a non-positive scale for a degenerate viewport', () => {
    expect(letterboxTransform(0, 0).scale).toBeGreaterThan(0);
  });
});

describe('screenToCanvas', () => {
  const t = letterboxTransform(1024, 768);

  it('puts the vector origin at the centre of the viewport', () => {
    expect(screenToCanvas(t, 0, 0)).toEqual([512, 384]);
  });

  it('maps +Y up and +X right', () => {
    expect(screenToCanvas(t, 512, 384)).toEqual([1024, 0]);
    expect(screenToCanvas(t, -512, -384)).toEqual([0, 768]);
  });

  it('applies the letterbox offset', () => {
    const wide = letterboxTransform(2048, 768);
    expect(screenToCanvas(wide, 0, 0)).toEqual([1024, 384]);
  });
});
