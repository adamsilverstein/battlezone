import { describe, expect, it } from 'vitest';
import {
  DEPTH_CUE_MIN_INTENSITY,
  EYE_HEIGHT_UNITS,
  FAR_CLIP_UNITS,
  NEAR_CLIP_UNITS,
  SCREEN_HALF_HEIGHT,
  SCREEN_SCALE,
  VIEW_WINDOW,
  WORLD_SIZE,
} from '../../src/data/constants';
import type { WireModel } from '../../src/data/types';
import type { Camera } from '../../src/render/camera';
import { depthIntensity, drawModel, projectPoint, projectSegment } from '../../src/render/camera';
import { createRecordingDisplay } from '../../src/render/vectorDisplay';

const cam: Camera = { pos: { x: 0, z: 0 }, heading: 0, eyeHeight: EYE_HEIGHT_UNITS };

/** Eye level, so the projected y is 0 and only x and depth are interesting. */
const atEyeLevel = (x: number, z: number) => ({ x, y: EYE_HEIGHT_UNITS, z });

describe('projectPoint', () => {
  it('puts a point straight ahead at the centre of the screen', () => {
    const p = projectPoint(cam, atEyeLevel(0, 4000));
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0, 9);
    expect(p!.y).toBeCloseTo(0, 9);
    expect(p!.depth).toBeCloseTo(4000, 9);
  });

  it('rejects a point behind the camera', () => {
    expect(projectPoint(cam, atEyeLevel(0, -4000))).toBeNull();
  });

  it('rejects a point inside the near plane and beyond the far plane', () => {
    expect(projectPoint(cam, atEyeLevel(0, NEAR_CLIP_UNITS - 1))).toBeNull();
    expect(projectPoint(cam, atEyeLevel(0, NEAR_CLIP_UNITS + 1))).not.toBeNull();
    expect(projectPoint(cam, atEyeLevel(0, FAR_CLIP_UNITS + 1))).toBeNull();
  });

  it('puts the 45-degree field-of-view edge at the edge of the screen', () => {
    const right = projectPoint(cam, atEyeLevel(4000, 4000));
    const left = projectPoint(cam, atEyeLevel(-4000, 4000));
    expect(right!.x).toBeCloseTo(SCREEN_SCALE, 9);
    expect(left!.x).toBeCloseTo(-SCREEN_SCALE, 9);
  });

  it('turns the view with the camera heading, clockwise from above', () => {
    const turned: Camera = { ...cam, heading: Math.PI / 2 };
    const p = projectPoint(turned, atEyeLevel(4000, 0));
    expect(p!.x).toBeCloseTo(0, 6);
    expect(p!.depth).toBeCloseTo(4000, 6);
  });

  it('moves the view with the camera position', () => {
    const moved: Camera = { ...cam, pos: { x: 1000, z: 1000 } };
    const p = projectPoint(moved, atEyeLevel(1000, 5000));
    expect(p!.x).toBeCloseTo(0, 9);
    expect(p!.depth).toBeCloseTo(4000, 9);
  });

  it('projects the ground below the horizon by the eye height', () => {
    const p = projectPoint(cam, { x: 0, y: 0, z: 4000 });
    expect(p!.y).toBeCloseTo((-SCREEN_SCALE * EYE_HEIGHT_UNITS) / 4000, 9);
    expect(p!.y).toBeLessThan(0);
  });
});

describe('projectSegment', () => {
  it('matches projectPoint when both ends are visible', () => {
    const a = atEyeLevel(-500, 4000);
    const b = atEyeLevel(500, 4000);
    const seg = projectSegment(cam, a, b)!;
    expect(seg.x0).toBeCloseTo(projectPoint(cam, a)!.x, 9);
    expect(seg.x1).toBeCloseTo(projectPoint(cam, b)!.x, 9);
  });

  it('clips a segment crossing the near plane instead of dropping it', () => {
    const seg = projectSegment(cam, atEyeLevel(0, -2000), atEyeLevel(0, 4000));
    expect(seg).not.toBeNull();
  });

  it('drops a segment entirely behind the camera', () => {
    expect(projectSegment(cam, atEyeLevel(0, -4000), atEyeLevel(0, -2000))).toBeNull();
  });

  it('drops a segment entirely beyond the draw distance', () => {
    const far = FAR_CLIP_UNITS + 1000;
    expect(projectSegment(cam, atEyeLevel(0, far), atEyeLevel(100, far + 100))).toBeNull();
  });

  it('drops a segment entirely outside the 3D view window', () => {
    // Far off to the right, well past the 45-degree edge.
    expect(projectSegment(cam, atEyeLevel(40000, 2000), atEyeLevel(40000, 3000))).toBeNull();
  });

  it('clips to the 3D view window rather than drawing over the HUD', () => {
    const high = 200000;
    const seg = projectSegment(cam, { x: 0, y: 0, z: 4000 }, { x: 0, y: high, z: 4000 })!;
    expect(seg).not.toBeNull();
    expect(Math.max(seg.y0, seg.y1)).toBeLessThanOrEqual(VIEW_WINDOW.top + 1e-6);
  });

  it('stops at the bottom of the visible screen, not the ROM window', () => {
    // VIEW_WINDOW reaches to -508, which is inside the letterbox bar on a 4:3
    // display, so a steep near edge must be cut at -384 instead.
    const seg = projectSegment(cam, { x: 0, y: 0, z: 4000 }, { x: 0, y: -200000, z: 4000 })!;
    expect(seg).not.toBeNull();
    expect(Math.min(seg.y0, seg.y1)).toBeCloseTo(-SCREEN_HALF_HEIGHT, 6);
  });
});

describe('depthIntensity', () => {
  it('dims with distance', () => {
    expect(depthIntensity(1, 1000)).toBeGreaterThan(depthIntensity(1, 14000));
  });

  it('never goes below the original floor', () => {
    expect(depthIntensity(0, FAR_CLIP_UNITS)).toBeCloseTo(DEPTH_CUE_MIN_INTENSITY / 0xff, 9);
  });
});

describe('drawModel', () => {
  /** A 320-unit pole standing on the ground: ROM vertices are [forward, left, up]. */
  const pole: WireModel = {
    name: 'pole',
    vertices: [
      [0, 0, -320],
      [0, 0, 0],
    ],
    edges: [[0, 1]],
  };

  it('draws one line per visible edge', () => {
    const d = createRecordingDisplay();
    drawModel(d, cam, pole, { x: 0, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    expect(d.lines).toHaveLength(1);
  });

  it('seats a ground-resting model on the horizon, standing up from it', () => {
    const d = createRecordingDisplay();
    drawModel(d, cam, pole, { x: 0, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    const line = d.lines[0]!;
    expect(Math.min(line.y0, line.y1)).toBeLessThan(0);
    expect(Math.max(line.y0, line.y1)).toBeCloseTo(0, 9);
  });

  it('keeps a model whole as it nears the draw distance', () => {
    // ROTPNT decides near and far for the object, once, so every vector of an
    // accepted object is drawn. Measuring each edge against those planes
    // instead trimmed the ones that crossed: a tank lost its turret and a box
    // its far face while both were still in plain sight.
    const box: WireModel = {
      name: 'box',
      vertices: [
        [-400, -400, -320],
        [400, -400, -320],
        [400, 400, -320],
        [-400, 400, -320],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    };
    for (const z of [FAR_CLIP_UNITS - 600, FAR_CLIP_UNITS - 100, FAR_CLIP_UNITS - 1]) {
      const d = createRecordingDisplay();
      drawModel(d, cam, box, { x: 0, y: 0, z }, { x: 0, y: 0, z: 0 });
      expect(d.lines).toHaveLength(box.edges.length);
    }
    // And past it the whole object goes, rather than the near half of it staying.
    const gone = createRecordingDisplay();
    drawModel(gone, cam, box, { x: 0, y: 0, z: FAR_CLIP_UNITS + 1 }, { x: 0, y: 0, z: 0 });
    expect(gone.lines).toHaveLength(0);
  });

  it('drops an object that has come inside the near plane, whole', () => {
    // ROTPNT takes the near plane the same way it takes the far one: the object
    // goes or stays as one. Driving into something makes it vanish rather than
    // smearing its near edges across the screen, which is the original's own
    // behaviour.
    const d = createRecordingDisplay();
    drawModel(d, cam, pole, { x: 0, y: 0, z: NEAR_CLIP_UNITS - 1 }, { x: 0, y: 0, z: 0 });
    expect(d.lines).toHaveLength(0);

    const just = createRecordingDisplay();
    drawModel(just, cam, pole, { x: 0, y: 0, z: NEAR_CLIP_UNITS + 1 }, { x: 0, y: 0, z: 0 });
    expect(just.lines).toHaveLength(1);
  });

  it('never lifts an edge above its own intensity, however close it passes', () => {
    // An accepted object's edges are drawn wherever its vertices fall, eye side
    // included, and a negative depth used to turn the cue into a bonus. A canvas
    // silently drops an alpha over 1 and reuses the last one it was given.
    expect(depthIntensity(1, -5000)).toBeLessThanOrEqual(1);
    expect(depthIntensity(1, -5000)).toBeCloseTo(1, 9);
  });

  it('draws what is in front of it across the seam of the torus', () => {
    // The world wraps at WORLD_SIZE and every position is stored wrapped, so a
    // player near the seam has the ground in front of them stored at the other
    // end of the number line. Measured the long way round, that ground is
    // 63,000 units away and gets culled; measured the way the rest of the game
    // measures it, it is a few hundred units ahead.
    const wrap = (v: number): number =>
      ((((v + WORLD_SIZE / 2) % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE) - WORLD_SIZE / 2;
    for (const raw of [0, 30000, 32000, 32767]) {
      const seamCam = { ...cam, pos: { x: 0, z: wrap(raw) } };
      const d = createRecordingDisplay();
      drawModel(d, seamCam, pole, { x: 0, y: 0, z: wrap(raw + 2000) }, { x: 0, y: 0, z: 0 });
      expect(d.lines).toHaveLength(1);
    }
  });

  it('keeps a model rigid when it sits on the seam of the torus', () => {
    // A shape standing on the wrap line has vertices on both sides of it. Taken
    // into view space one at a time, the ones past the line come back from the
    // far side of the world and the shape is drawn with its corners 65,000 units
    // apart - which reaches the screen as a line straight across it. The object
    // is placed once and its vertices hang off that, so it cannot come apart.
    const wide: WireModel = {
      name: 'wide',
      vertices: [
        [0, -400, -320],
        [0, 400, -320],
      ],
      edges: [[0, 1]],
    };
    const onSeam = { x: -WORLD_SIZE / 2, z: 4000 };
    const d = createRecordingDisplay();
    drawModel(d, cam, wide, { x: onSeam.x, y: 0, z: onSeam.z }, { x: 0, y: 0, z: 0 });
    // Far off to the side, so nothing of it is on screen - but nothing of it is
    // smeared across the screen either.
    expect(d.lines).toHaveLength(0);

    // And the same shape in front of the camera is drawn once, at its own width.
    const near = createRecordingDisplay();
    const seamCam = { ...cam, pos: { x: onSeam.x, z: 0 } };
    drawModel(near, seamCam, wide, { x: onSeam.x, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    expect(near.lines).toHaveLength(1);
    const line = near.lines[0]!;
    expect(Math.abs(line.x1 - line.x0)).toBeLessThan(300);
  });

  it('draws nothing for a model behind the camera', () => {
    const d = createRecordingDisplay();
    drawModel(d, cam, pole, { x: 0, y: 0, z: -4000 }, { x: 0, y: 0, z: 0 });
    expect(d.lines).toHaveLength(0);
  });

  it('maps the ROM left axis to screen left', () => {
    const arm: WireModel = {
      name: 'arm',
      vertices: [
        [0, 0, 0],
        [0, 500, 0],
      ],
      edges: [[0, 1]],
    };
    const d = createRecordingDisplay();
    drawModel(d, cam, arm, { x: 0, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    expect(d.lines[0]!.x1).toBeLessThan(0);
  });

  it('yaws the model by rot.y', () => {
    const arm: WireModel = {
      name: 'arm',
      vertices: [
        [0, 0, 0],
        [500, 0, 0],
      ],
      edges: [[0, 1]],
    };
    const straight = createRecordingDisplay();
    const turned = createRecordingDisplay();
    drawModel(straight, cam, arm, { x: 0, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    drawModel(turned, cam, arm, { x: 0, y: 0, z: 4000 }, { x: 0, y: Math.PI / 2, z: 0 });
    // Pointing away it is edge-on at screen centre; turned it reaches to the right.
    expect(Math.abs(straight.lines[0]!.x1)).toBeLessThan(1e-6);
    expect(turned.lines[0]!.x1).toBeGreaterThan(10);
  });

  it('dims the edges of a distant model', () => {
    const near = createRecordingDisplay();
    const far = createRecordingDisplay();
    drawModel(near, cam, pole, { x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 });
    drawModel(far, cam, pole, { x: 0, y: 0, z: 14000 }, { x: 0, y: 0, z: 0 });
    expect(far.lines[0]!.intensity).toBeLessThan(near.lines[0]!.intensity);
  });

  it('draws an edgeless model as one dot per vertex', () => {
    const cloud: WireModel = {
      name: 'cloud',
      vertices: [
        [0, 0, 0],
        [0, 300, 0],
        [0, -300, 0],
      ],
      edges: [],
    };
    const d = createRecordingDisplay();
    drawModel(d, cam, cloud, { x: 0, y: 0, z: 4000 }, { x: 0, y: 0, z: 0 });
    expect(d.lines).toHaveLength(3);
    for (const line of d.lines) {
      expect(line.x0).toBe(line.x1);
      expect(line.y0).toBe(line.y1);
    }
    // The three vertices are spread across the screen, not stacked on one point.
    expect(new Set(d.lines.map((l) => l.x0)).size).toBe(3);
  });

  it('can draw without the distance fade, as the saucer does', () => {
    const cued = createRecordingDisplay();
    const flat = createRecordingDisplay();
    drawModel(cued, cam, pole, { x: 0, y: 0, z: 14000 }, { x: 0, y: 0, z: 0 }, 1);
    drawModel(flat, cam, pole, { x: 0, y: 0, z: 14000 }, { x: 0, y: 0, z: 0 }, 1, {
      depthCue: false,
    });
    expect(flat.lines[0]!.intensity).toBe(1);
    expect(cued.lines[0]!.intensity).toBeLessThan(1);
  });
});
