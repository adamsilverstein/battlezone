import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT_UNITS } from '../../src/data/constants';
import { createAttractWorld } from '../../src/game/world';
import type { GameState } from '../../src/game/types';
import type { Camera } from '../../src/render/camera';
import { createRenderer } from '../../src/render/renderer';
import { drawHorizon } from '../../src/render/scene';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

function stateAt(tick: number, x: number, z: number, heading: number): GameState {
  const world = createAttractWorld();
  world.tick = tick;
  world.player.pos = { x, z };
  world.player.heading = heading;
  return { phase: 'attractTitle', phaseTicks: 0, world, highScores: [] };
}

/** What the scene looks like from an explicit camera, for comparison. */
function expected(cam: Camera, tick: number): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  drawHorizon(d, cam, tick);
  d.endFrame();
  return d.lines;
}

describe('createRenderer', () => {
  it('draws the scene from the player camera', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, 0.5), 0);
    expect(d.lines).toEqual(
      expected({ pos: { x: 0, z: 0 }, heading: 0.5, eyeHeight: EYE_HEIGHT_UNITS }, 0),
    );
  });

  it('does not interpolate on the very first frame', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(10, 100, 200, 1), 0.75);
    expect(d.lines).toEqual(
      expected({ pos: { x: 100, z: 200 }, heading: 1, eyeHeight: EYE_HEIGHT_UNITS }, 10),
    );
  });

  it('interpolates the camera between the previous and current tick', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, 0), 0);
    renderer.render(stateAt(1, 100, 400, 1), 0.5);
    expect(d.lines).toEqual(
      expected({ pos: { x: 50, z: 200 }, heading: 0.5, eyeHeight: EYE_HEIGHT_UNITS }, 1),
    );
  });

  it('only resnapshots when the tick changes', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, 0), 0);
    renderer.render(stateAt(1, 0, 0, 1), 0);
    // A second frame in the same tick keeps interpolating from tick 0 to tick 1.
    renderer.render(stateAt(1, 0, 0, 1), 0.25);
    expect(d.lines).toEqual(
      expected({ pos: { x: 0, z: 0 }, heading: 0.25, eyeHeight: EYE_HEIGHT_UNITS }, 1),
    );
  });

  it('snaps rather than interpolating when the loop skips ticks', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, 0), 0);
    // The loop caught up four ticks before this render; the tick 0 snapshot is
    // stale, so blending from it would drag the camera backwards.
    renderer.render(stateAt(4, 400, 400, 1), 0.5);
    expect(d.lines).toEqual(
      expected({ pos: { x: 400, z: 400 }, heading: 1, eyeHeight: EYE_HEIGHT_UNITS }, 4),
    );
  });

  it('snaps when the tick goes backwards, as a restarted world does', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(9, 900, 900, 2), 0);
    renderer.render(stateAt(0, 0, 0, 0), 0.5);
    expect(d.lines).toEqual(
      expected({ pos: { x: 0, z: 0 }, heading: 0, eyeHeight: EYE_HEIGHT_UNITS }, 0),
    );
  });

  it('interpolates headings the short way round the wrap', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, Math.PI - 0.1), 0);
    renderer.render(stateAt(1, 0, 0, -Math.PI + 0.1), 0.5);
    expect(d.lines).toEqual(
      expected({ pos: { x: 0, z: 0 }, heading: Math.PI, eyeHeight: EYE_HEIGHT_UNITS }, 1),
    );
  });

  it('opens and closes the frame exactly once per render', () => {
    let begins = 0;
    let ends = 0;
    const inner = createRecordingDisplay();
    const renderer = createRenderer({
      ...inner,
      beginFrame: () => {
        begins += 1;
        inner.beginFrame();
      },
      endFrame: () => {
        ends += 1;
        inner.endFrame();
      },
    });
    renderer.render(stateAt(0, 0, 0, 0), 0);
    expect(begins).toBe(1);
    expect(ends).toBe(1);
  });
});
