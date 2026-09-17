/**
 * The "beam": everything is drawn as lit line segments in the original's vector
 * coordinate space - X in [-512, 512], Y in [-384, 384], origin at the centre of
 * the screen, +Y up (design spec 5.4).
 *
 * `intensity` is 0..1, a fraction of full phosphor brightness; ROM intensities
 * (nibbles, or bytes in `DEPTH_CUE_MIN_INTENSITY`) are converted by the caller.
 *
 * Two implementations: a canvas one for the browser and a recording one that
 * collects the segments so render tests can assert on them without a DOM.
 */

import {
  OVERLAY_ENABLED,
  SCREEN_HALF_HEIGHT,
  SCREEN_HALF_WIDTH,
  VIEW_WINDOW,
} from '../data/constants';

export interface VectorDisplay {
  beginFrame(): void;
  line(x0: number, y0: number, x1: number, y1: number, intensity?: number): void;
  polyline(points: readonly (readonly [number, number])[], intensity?: number): void;
  endFrame(): void;
  readonly width: number;
  readonly height: number;
}

export interface RecordedLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  intensity: number;
}

const WIDTH = SCREEN_HALF_WIDTH * 2;
const HEIGHT = SCREEN_HALF_HEIGHT * 2;

/** Phosphor colours through the cabinet's colour overlay, and without it. */
const HUD_COLOUR = '#ff3322';
const FIELD_COLOUR = '#33ff66';
const MONOCHROME_COLOUR = '#e8ffe8';

/** The glow pass is wide and faint, the bright pass thin and strong. */
const GLOW_WIDTH = 7;
const GLOW_ALPHA = 0.16;
const BRIGHT_WIDTH = 1.6;
const BRIGHT_ALPHA = 0.95;

/**
 * Maps the logical vector space onto a viewport, letterboxed at the display's
 * 4:3 aspect.  Offsets are in CSS pixels from the viewport's top-left corner.
 */
export interface LetterboxTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function letterboxTransform(cssWidth: number, cssHeight: number): LetterboxTransform {
  // A detached or hidden canvas reports zero; fall back to 1:1 so nothing divides by zero.
  const w = cssWidth > 0 ? cssWidth : WIDTH;
  const h = cssHeight > 0 ? cssHeight : HEIGHT;
  const scale = Math.min(w / WIDTH, h / HEIGHT);
  return {
    scale,
    offsetX: (w - WIDTH * scale) / 2,
    offsetY: (h - HEIGHT * scale) / 2,
  };
}

/** Vector coordinates to CSS pixels, flipping Y (the vector space has +Y up). */
export function screenToCanvas(t: LetterboxTransform, x: number, y: number): [number, number] {
  return [
    t.offsetX + (x + SCREEN_HALF_WIDTH) * t.scale,
    t.offsetY + (SCREEN_HALF_HEIGHT - y) * t.scale,
  ];
}

function pushLine(lines: RecordedLine[]): VectorDisplay['polyline'] {
  return (points, intensity = 1) => {
    if (points.length === 0) return;
    if (points.length === 1) {
      // A lone point is a dot, which the ROM draws as a zero-length lit vector.
      const [x, y] = points[0]!;
      lines.push({ x0: x, y0: y, x1: x, y1: y, intensity });
      return;
    }
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1]!;
      const [x1, y1] = points[i]!;
      lines.push({ x0, y0, x1, y1, intensity });
    }
  };
}

export function createRecordingDisplay(): VectorDisplay & {
  lines: RecordedLine[];
  clear(): void;
} {
  const lines: RecordedLine[] = [];
  const polyline = pushLine(lines);
  return {
    lines,
    clear: () => void lines.splice(0, lines.length),
    beginFrame: () => void lines.splice(0, lines.length),
    line: (x0, y0, x1, y1, intensity = 1) => void lines.push({ x0, y0, x1, y1, intensity }),
    polyline,
    endFrame: () => {},
    width: WIDTH,
    height: HEIGHT,
  };
}

export function createCanvasDisplay(
  canvas: HTMLCanvasElement,
  opts?: { overlay?: boolean },
): VectorDisplay {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('vectorDisplay: canvas has no 2d context');
  const overlay = opts?.overlay ?? OVERLAY_ENABLED;

  const lines: RecordedLine[] = [];
  const polyline = pushLine(lines);
  let transform = letterboxTransform(canvas.clientWidth, canvas.clientHeight);
  let sized = '';

  /** Match the backing store to the viewport and the device pixel ratio. */
  const resize = (): void => {
    const dpr = globalThis.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const key = `${cssWidth}x${cssHeight}@${dpr}`;
    if (key === sized) return;
    sized = key;
    transform = letterboxTransform(cssWidth, cssHeight);
    canvas.width = Math.max(1, Math.round((cssWidth || WIDTH) * dpr));
    canvas.height = Math.max(1, Math.round((cssHeight || HEIGHT) * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const colourFor = (line: RecordedLine): string => {
    if (!overlay) return MONOCHROME_COLOUR;
    // The gel is a horizontal band; pick per line by where its midpoint sits.
    return (line.y0 + line.y1) / 2 > VIEW_WINDOW.top ? HUD_COLOUR : FIELD_COLOUR;
  };

  const pass = (lineWidth: number, alpha: number): void => {
    ctx.lineWidth = lineWidth * Math.max(transform.scale, 0.25);
    for (const line of lines) {
      ctx.strokeStyle = colourFor(line);
      ctx.globalAlpha = alpha * line.intensity;
      const [x0, y0] = screenToCanvas(transform, line.x0, line.y0);
      const [x1, y1] = screenToCanvas(transform, line.x1, line.y1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  };

  return {
    beginFrame(): void {
      resize();
      lines.length = 0;
    },
    line: (x0, y0, x1, y1, intensity = 1) => void lines.push({ x0, y0, x1, y1, intensity }),
    polyline,
    endFrame(): void {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Round caps make zero-length dot vectors visible and soften the strokes.
      ctx.lineCap = 'round';
      pass(GLOW_WIDTH, GLOW_ALPHA);
      pass(BRIGHT_WIDTH, BRIGHT_ALPHA);
      ctx.globalAlpha = 1;
    },
    width: WIDTH,
    height: HEIGHT,
  };
}
