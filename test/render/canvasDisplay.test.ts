// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { VIEW_WINDOW } from '../../src/data/constants';
import { createCanvasDisplay } from '../../src/render/vectorDisplay';

interface Stroke {
  lineWidth: number;
  globalAlpha: number;
  strokeStyle: string;
  points: [number, number][];
}

/** A 2D context stub that records what each stroke() was asked to draw. */
function stubCanvas(cssWidth = 1024, cssHeight = 768) {
  const strokes: Stroke[] = [];
  const fills: string[] = [];
  let points: [number, number][] = [];
  const ctx = {
    lineWidth: 1,
    globalAlpha: 1,
    strokeStyle: '#fff',
    fillStyle: '#000',
    lineCap: 'butt' as CanvasLineCap,
    setTransform(): void {},
    fillRect(): void {
      fills.push(String(ctx.fillStyle));
    },
    beginPath(): void {
      points = [];
    },
    moveTo(x: number, y: number): void {
      points.push([x, y]);
    },
    lineTo(x: number, y: number): void {
      points.push([x, y]);
    },
    stroke(): void {
      strokes.push({
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
        strokeStyle: String(ctx.strokeStyle),
        points,
      });
    },
  };

  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: cssWidth, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: cssHeight, configurable: true });
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return { canvas, strokes, fills };
}

describe('createCanvasDisplay', () => {
  beforeEach(() => {
    window.devicePixelRatio = 2;
  });

  it('sizes the backing store for the device pixel ratio', () => {
    const { canvas } = stubCanvas();
    const d = createCanvasDisplay(canvas);
    d.beginFrame();
    d.endFrame();
    expect(canvas.width).toBe(2048);
    expect(canvas.height).toBe(1536);
  });

  it('resizes when the viewport changes between frames', () => {
    const { canvas } = stubCanvas();
    const d = createCanvasDisplay(canvas);
    d.beginFrame();
    d.endFrame();
    Object.defineProperty(canvas, 'clientWidth', { value: 512, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 384, configurable: true });
    d.beginFrame();
    d.endFrame();
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });

  it('draws a wide faint glow pass before a thin bright pass', () => {
    const { canvas, strokes } = stubCanvas();
    const d = createCanvasDisplay(canvas, { overlay: false });
    d.beginFrame();
    d.line(-100, -100, 100, 100);
    d.endFrame();
    expect(strokes).toHaveLength(2);
    const [glow, bright] = strokes as [Stroke, Stroke];
    expect(glow.lineWidth).toBeGreaterThan(bright.lineWidth);
    expect(glow.globalAlpha).toBeLessThan(bright.globalAlpha);
    expect(bright.points).toEqual([
      [412, 484],
      [612, 284],
    ]);
  });

  it('scales brightness with intensity', () => {
    const { canvas, strokes } = stubCanvas();
    const d = createCanvasDisplay(canvas, { overlay: false });
    d.beginFrame();
    d.line(0, 0, 10, 0, 1);
    d.line(0, 0, 10, 0, 0.25);
    d.endFrame();
    const bright = strokes.filter(
      (s) => s.lineWidth === Math.min(...strokes.map((t) => t.lineWidth)),
    );
    expect(bright[1]!.globalAlpha).toBeLessThan(bright[0]!.globalAlpha);
  });

  it('uses the cabinet overlay colours above and below the HUD line', () => {
    const { canvas, strokes } = stubCanvas();
    const d = createCanvasDisplay(canvas, { overlay: true });
    d.beginFrame();
    d.line(-10, VIEW_WINDOW.top + 50, 10, VIEW_WINDOW.top + 50);
    d.line(-10, -100, 10, -100);
    d.endFrame();
    const colours = new Set(strokes.map((s) => s.strokeStyle));
    expect(colours.size).toBe(2);
    const hud = strokes.find((s) => s.points[0]![1] < 384)!;
    const field = strokes.find((s) => s.points[0]![1] > 384)!;
    expect(hud.strokeStyle).not.toBe(field.strokeStyle);
  });

  it('draws monochrome phosphor when the overlay is off', () => {
    const { canvas, strokes } = stubCanvas();
    const d = createCanvasDisplay(canvas, { overlay: false });
    d.beginFrame();
    d.line(-10, 300, 10, 300);
    d.line(-10, -300, 10, -300);
    d.endFrame();
    expect(new Set(strokes.map((s) => s.strokeStyle)).size).toBe(1);
  });

  it('clears the frame to black', () => {
    const { canvas, fills } = stubCanvas();
    const d = createCanvasDisplay(canvas);
    d.beginFrame();
    d.endFrame();
    expect(fills[0]).toBe('#000');
  });

  it('throws when the canvas has no 2D context', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => null) as HTMLCanvasElement['getContext'];
    expect(() => createCanvasDisplay(canvas)).toThrow(/2d context/i);
  });
});
