import { describe, expect, it } from 'vitest';
import { CRACK_GROUPS, DEFAULT_OPTIONS, EYE_HEIGHT_UNITS } from '../../src/data/constants';
import { createAttractWorld } from '../../src/game/world';
import type { Enemy, GameState, Shell, World } from '../../src/game/types';
import type { Camera } from '../../src/render/camera';
import { drawCrack } from '../../src/render/crack';
import { drawHud, drawReticle } from '../../src/render/hud';
import { drawWorldObjects } from '../../src/render/objects';
import { createRenderer } from '../../src/render/renderer';
import { drawHorizon } from '../../src/render/scene';
import {
  drawCopyright,
  drawGameOver,
  drawHighScoreTable,
  drawInitialsEntry,
  drawPressStart,
  drawTitle,
} from '../../src/render/screens';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

function stateAt(tick: number, x: number, z: number, heading: number): GameState {
  const world = createAttractWorld();
  world.tick = tick;
  world.player.pos = { x, z };
  world.player.heading = heading;
  return { phase: 'attractTitle', phaseTicks: 0, world, highScores: [] };
}

/**
 * The frame the renderer should compose: backdrop, battlefield, HUD and, when the
 * player is dead, the crack - in that order, from an explicit camera and an
 * explicit (already interpolated) world.  With no state given it uses an empty
 * world at the camera's own position, which is all the camera tests need: the HUD
 * of an empty world is the same wherever the player stands.
 */
function expected(cam: Camera, tick: number, state?: GameState, view?: World): RecordedLine[] {
  const shown = state ?? stateAt(tick, cam.pos.x, cam.pos.z, cam.heading);
  const world = view ?? shown.world;
  const highScore = Math.max(...shown.highScores.map((e) => e.score), world.score);
  const inPlay = shown.phase === 'playing' || shown.phase === 'playerDead';
  const d = createRecordingDisplay();
  d.beginFrame();

  if (shown.phase === 'attractHighScores') {
    drawHighScoreTable(d, shown.highScores, { bonusThreshold: DEFAULT_OPTIONS.bonusThreshold });
  } else if (shown.phase === 'highScoreEntry' && shown.entry) {
    drawInitialsEntry(d, shown.entry);
    drawHud(d, world, { showReticle: false, showRadar: false, blinkTick: tick, highScore });
  } else {
    drawHorizon(d, cam, tick);
    drawWorldObjects(d, cam, world);
    drawHud(d, world, {
      showReticle: shown.phase !== 'attractTitle',
      blinkTick: tick,
      highScore,
    });
    if (shown.phase === 'attractTitle') drawTitle(d, shown.phaseTicks);
    if (shown.phase === 'gameOver') drawGameOver(d, shown.message);
    if (shown.phase === 'playerDead') drawCrack(d, Math.min(shown.phaseTicks / CRACK_GROUPS, 1));
  }

  if (!inPlay) {
    drawCopyright(d);
    drawPressStart(d, shown.phaseTicks);
  }

  d.endFrame();
  return d.lines;
}

function enemyAt(x: number, z: number, heading: number, parts: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: 'supertank',
    pos: { x, z },
    heading,
    y: 0,
    alive: true,
    state: 'chase',
    timer: 0,
    ...parts,
  };
}

function shellAt(x: number, z: number, y: number): Shell {
  return { id: 5, owner: 'player', pos: { x, z }, y, heading: 0, ticksLeft: 10 };
}

const CAM_AT_ORIGIN: Camera = { pos: { x: 0, z: 0 }, heading: 0, eyeHeight: EYE_HEIGHT_UNITS };

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

  it('draws the battlefield and the HUD over the backdrop', () => {
    const state = stateAt(4, 0, 0, 0);
    state.phase = 'playing';
    state.world.enemies = [enemyAt(0, 6000, 0)];
    state.world.shells = [shellAt(0, 2000, 300)];
    state.world.score = 5000;
    state.world.lives = 3;
    state.world.enemyInRange = true;
    state.highScores = [{ initials: 'ABC', score: 25000 }];
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 4, state));
    // The order matters: the HUD is drawn last so it sits over the view.
    const bare = stateAt(4, 0, 0, 0);
    bare.phase = 'playing';
    expect(d.lines.length).toBeGreaterThan(expected(CAM_AT_ORIGIN, 4, bare).length);
  });

  it('shows the better of the score and the high score table', () => {
    const state = stateAt(0, 0, 0, 0);
    state.world.score = 40000;
    state.highScores = [{ initials: 'ABC', score: 25000 }];
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);
    const beaten = { ...state, highScores: [{ initials: 'ABC', score: 40000 }] };
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 0, beaten));
  });

  it('takes the best of the whole table, whatever order it is in', () => {
    const state = stateAt(0, 0, 0, 0);
    state.highScores = [
      { initials: 'ABC', score: 12000 },
      { initials: 'DEF', score: 88000 },
    ];
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);
    const best = { ...state, highScores: [{ initials: 'DEF', score: 88000 }] };
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 0, best));
  });

  it('hides the reticle behind the attract logo only', () => {
    const reticle = createRecordingDisplay();
    drawReticle(reticle, false);
    const keys = (lines: readonly RecordedLine[]): string[] =>
      lines.map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}`);
    const frame = (phase: GameState['phase']): string[] => {
      const d = createRecordingDisplay();
      const state = stateAt(0, 0, 0, 0);
      state.phase = phase;
      createRenderer(d).render(state, 0);
      return keys(d.lines);
    };

    for (const line of keys(reticle.lines)) {
      expect(frame('playing')).toContain(line);
      expect(frame('attractTitle')).not.toContain(line);
      expect(frame('attractDemo')).toContain(line);
    }
  });

  it('interpolates enemies and shells between ticks by id', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    const first = stateAt(0, 0, 0, 0);
    first.world.enemies = [enemyAt(0, 8000, 0)];
    first.world.shells = [shellAt(0, 1000, 100)];
    renderer.render(first, 0);

    const second = stateAt(1, 0, 0, 0);
    second.world.enemies = [enemyAt(400, 8000, 1)];
    second.world.shells = [shellAt(0, 3000, 300)];
    renderer.render(second, 0.5);

    const halfway = { ...second.world };
    halfway.enemies = [enemyAt(200, 8000, 0.5)];
    halfway.shells = [shellAt(0, 2000, 200)];
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 1, second, halfway));
  });

  it('interpolates debris but only its yaw', () => {
    const piece = (x: number, y: number, yaw: number) => ({
      model: 'debrisHull',
      pos: { x, z: 6000 },
      y,
      vel: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: yaw, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      ticksLeft: 20,
    });
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    const first = stateAt(0, 0, 0, 0);
    first.world.debris = [piece(0, 0, 0)];
    renderer.render(first, 0);

    const second = stateAt(1, 0, 0, 0);
    second.world.debris = [piece(200, 400, 1)];
    renderer.render(second, 0.25);

    const quarter = { ...second.world, debris: [piece(50, 100, 0.25)] };
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 1, second, quarter));
  });

  it('snaps an entity that is new this tick rather than blending from nothing', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    renderer.render(stateAt(0, 0, 0, 0), 0);
    const second = stateAt(1, 0, 0, 0);
    second.world.enemies = [enemyAt(1000, 8000, 0)];
    renderer.render(second, 0.5);
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 1, second));
  });

  it('snaps entity positions when the loop skips ticks', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    const first = stateAt(0, 0, 0, 0);
    first.world.enemies = [enemyAt(0, 8000, 0)];
    renderer.render(first, 0);
    const later = stateAt(4, 0, 0, 0);
    later.world.enemies = [enemyAt(2000, 8000, 1)];
    renderer.render(later, 0.5);
    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 4, later));
  });

  it('cracks the screen while the player is dead, one group per tick', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    const dead = (phaseTicks: number): GameState => {
      const state = stateAt(phaseTicks, 0, 0, 0);
      state.phase = 'playerDead';
      state.phaseTicks = phaseTicks;
      return state;
    };
    const counts = [0, 1, 4, CRACK_GROUPS, CRACK_GROUPS * 4].map((phaseTicks) => {
      const state = dead(phaseTicks);
      renderer.render(state, 0);
      expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, phaseTicks, state));
      return d.lines.length;
    });
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    expect(counts[2]).toBeLessThan(counts[3]!);
    // Past the last group the crack holds rather than growing.
    expect(counts[4]).toBe(counts[3]);
  });

  it('draws no crack while the player is alive', () => {
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);
    const playing = stateAt(9, 0, 0, 0);
    playing.phase = 'playing';
    playing.phaseTicks = 9;
    renderer.render(playing, 0);
    const alive = d.lines.length;
    const dead = { ...playing, phase: 'playerDead' as const };
    renderer.render(dead, 0);
    expect(d.lines.length).toBeGreaterThan(alive);
  });

  it('replaces the whole frame with the high score table', () => {
    const state = stateAt(3, 0, 0, 0);
    state.phase = 'attractHighScores';
    state.highScores = [{ initials: 'ADS', score: 42000 }];
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);

    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 3, state));
    // No horizon and no radar behind it.
    const horizon = createRecordingDisplay();
    drawHorizon(horizon, CAM_AT_ORIGIN, 3);
    const keys = (lines: readonly RecordedLine[]): string[] =>
      lines.map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}`);
    for (const line of keys(horizon.lines)) expect(keys(d.lines)).not.toContain(line);
  });

  it('draws the initials editor with the score strip but no radar', () => {
    const state = stateAt(0, 0, 0, 0);
    state.phase = 'highScoreEntry';
    state.entry = { initials: 'AD_', cursor: 1, score: 42000 };
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);

    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 0, state));
    expect(d.lines.length).toBeGreaterThan(0);
  });

  it('puts GAME OVER over the battlefield the player just left', () => {
    const state = stateAt(5, 0, 0, 0);
    state.phase = 'gameOver';
    state.message = 'GAME OVER';
    const d = createRecordingDisplay();
    createRenderer(d).render(state, 0);

    expect(d.lines).toEqual(expected(CAM_AT_ORIGIN, 5, state));
    const over = createRecordingDisplay();
    drawGameOver(over, 'GAME OVER');
    const keys = (lines: readonly RecordedLine[]): string[] =>
      lines.map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}`);
    for (const line of keys(over.lines)) expect(keys(d.lines)).toContain(line);
  });

  it('flies the logo from the phase counter, not the world tick', () => {
    const early = stateAt(50, 0, 0, 0);
    early.phase = 'attractTitle';
    early.phaseTicks = 4;
    // Both counts are on a lit beat of the PRESS START flash, so only the logo
    // differs between them.
    const late = { ...early, phaseTicks: 32 };
    const d = createRecordingDisplay();
    const renderer = createRenderer(d);

    renderer.render(early, 0);
    const first = d.lines.length;
    renderer.render(late, 0);

    // "ZONE" has joined the group by then, so there is more on screen.
    expect(d.lines.length).toBeGreaterThan(first);
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
