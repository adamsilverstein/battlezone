import { describe, expect, it } from 'vitest';
import {
  EYE_HEIGHT_UNITS,
  HORIZON_Y,
  VOLCANO_CRATER_Y,
  VOLCANO_ROCK_FALL_LIMIT,
} from '../../src/data/constants';
import { TAU } from '../../src/engine/math';
import type { Camera } from '../../src/render/camera';
import { VIEW_CLIP } from '../../src/render/clip';
import { drawHorizon } from '../../src/render/scene';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

const camAt = (turns: number): Camera => ({
  pos: { x: 0, z: 0 },
  heading: turns * TAU,
  eyeHeight: EYE_HEIGHT_UNITS,
});

function draw(turns: number, tick = 0): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  drawHorizon(d, camAt(turns), tick);
  d.endFrame();
  return d.lines;
}

/** Every drawn line as a comparable string, for spotting what changed. */
const key = (turns: number, tick: number): string[] =>
  draw(turns, tick).map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}`);

/** A heading with the volcano crater in view. */
const VOLCANO_TURNS = 0.6;

const isHorizonLine = (l: RecordedLine) =>
  l.y0 === HORIZON_Y && l.y1 === HORIZON_Y && Math.abs(l.x1 - l.x0) > 900;

describe('drawHorizon', () => {
  it('draws the horizon line across the screen at y = 0', () => {
    const horizon = draw(0).filter(isHorizonLine);
    expect(horizon).toHaveLength(1);
    expect(Math.min(horizon[0]!.x0, horizon[0]!.x1)).toBeCloseTo(VIEW_CLIP.left, 6);
    expect(Math.max(horizon[0]!.x0, horizon[0]!.x1)).toBeCloseTo(VIEW_CLIP.right, 6);
  });

  it('draws mountains above the horizon', () => {
    const mountains = draw(0).filter((l) => !isHorizonLine(l));
    expect(mountains.length).toBeGreaterThan(20);
    expect(mountains.every((l) => l.y0 >= 0 && l.y1 >= 0)).toBe(true);
  });

  it('keeps everything inside the visible 3D view area at every heading', () => {
    for (let i = 0; i < 64; i += 1) {
      for (const l of draw(i / 64, i)) {
        for (const [x, y] of [
          [l.x0, l.y0],
          [l.x1, l.y1],
        ]) {
          expect(x!).toBeGreaterThanOrEqual(VIEW_CLIP.left - 1e-6);
          expect(x!).toBeLessThanOrEqual(VIEW_CLIP.right + 1e-6);
          expect(y!).toBeGreaterThanOrEqual(VIEW_CLIP.bottom - 1e-6);
          expect(y!).toBeLessThanOrEqual(VIEW_CLIP.top + 1e-6);
        }
      }
    }
  });

  it('always fills the horizon, at every heading', () => {
    // Three of the eight ROM segments are on screen at once; how busy they are
    // varies (the moon segment is dense, some ridges are sparse), but the
    // backdrop is never empty and never runs away.
    const counts: number[] = [];
    for (let i = 0; i < 256; i += 1) counts.push(draw(i / 256).length);
    expect(Math.min(...counts)).toBeGreaterThan(10);
    expect(Math.max(...counts)).toBeLessThan(80);
  });

  it('is deterministic for a given heading and tick', () => {
    expect(draw(0.3, 7)).toEqual(draw(0.3, 7));
  });

  it('scrolls the backdrop left as the player turns right', () => {
    // The moon is the highest feature on the strip, so track its peak.
    const peakX = (turns: number) => {
      const lines = draw(turns);
      const top = Math.max(...lines.map((l) => Math.max(l.y0, l.y1)));
      return lines.find((l) => Math.max(l.y0, l.y1) === top)!.x0;
    };
    expect(peakX(0.02)).toBeLessThan(peakX(0));
  });

  it('shows the moon near the centre of the screen at heading 0', () => {
    const lines = draw(0);
    const top = Math.max(...lines.map((l) => Math.max(l.y0, l.y1)));
    // The crescent peaks at y = 163 on the strip.
    expect(top).toBeGreaterThan(140);
    const moon = lines.filter((l) => Math.max(l.y0, l.y1) > 140);
    expect(moon.length).toBeGreaterThan(0);
    for (const l of moon) expect(Math.abs(l.x0)).toBeLessThan(120);
  });

  it('animates only while the volcano is on screen', () => {
    // The tick is the eruption's only input, so a heading whose frames change
    // over time is a heading with the crater in view.
    const distinctFrames = (turns: number) =>
      new Set(Array.from({ length: 48 }, (_, tick) => key(turns, tick).join('|'))).size;
    // The crater sits to the south-west, on screen from about 180 to 270 degrees.
    expect(distinctFrames(VOLCANO_TURNS)).toBeGreaterThan(1);
    expect(distinctFrames(0)).toBe(1);
  });

  it('draws the eruption as dots arcing out of the crater', () => {
    const still = new Set(key(VOLCANO_TURNS, 0));
    const rocks = key(VOLCANO_TURNS, 5)
      .filter((k) => !still.has(k))
      .map((k) => k.split(',').map(Number) as [number, number, number, number]);
    expect(rocks.length).toBeGreaterThan(0);
    for (const [x0, y0, x1, y1] of rocks) {
      expect(x0).toBe(x1);
      expect(y0).toBe(y1);
      // Within the arc a rock can reach: up from the crater, then back down.
      expect(y0).toBeGreaterThan(VOLCANO_CRATER_Y - VOLCANO_ROCK_FALL_LIMIT - 1);
      expect(y0).toBeLessThanOrEqual(VIEW_CLIP.top);
    }
  });
});
