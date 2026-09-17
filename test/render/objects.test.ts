import { describe, expect, it } from 'vitest';
import {
  ENEMY_DISH_STEP,
  EYE_HEIGHT_UNITS,
  HEADING_UNITS_PER_TURN,
} from '../../src/data/constants';
import { MODELS, TREAD_FRAMES } from '../../src/data/models';
import { TAU } from '../../src/engine/math';
import type { Debris, Enemy, Obstacle, Shell, World } from '../../src/game/types';
import { createAttractWorld } from '../../src/game/world';
import type { Camera } from '../../src/render/camera';
import { drawModel } from '../../src/render/camera';
import { VIEW_CLIP } from '../../src/render/clip';
import { drawWorldObjects } from '../../src/render/objects';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

const CAM: Camera = { pos: { x: 0, z: 0 }, heading: 0, eyeHeight: EYE_HEIGHT_UNITS };

/** A world with nothing in it but what a test puts there. */
/** A battlefield with nothing on it but what a test puts there. */
function worldWith(parts: Partial<World>): World {
  return { ...createAttractWorld(), obstacles: [], ...parts };
}

function enemy(parts: Partial<Enemy>): Enemy {
  return {
    id: 1,
    kind: 'tank',
    pos: { x: 0, z: 6000 },
    heading: 0,
    y: 0,
    alive: true,
    state: 'chase',
    timer: 0,
    ...parts,
  };
}

function draw(world: World, cam: Camera = CAM): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  drawWorldObjects(d, cam, world);
  d.endFrame();
  return d.lines;
}

/** One model drawn on its own, for comparing against what the world drew. */
function modelLines(
  model: string,
  pos: { x: number; y: number; z: number },
  yaw: number,
  cam: Camera = CAM,
): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  drawModel(d, cam, MODELS[model]!, pos, { x: 0, y: yaw, z: 0 });
  d.endFrame();
  return d.lines;
}

const keys = (lines: readonly RecordedLine[]): string[] =>
  lines.map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}@${l.intensity}`).sort();

/** The dish spins one ENEMY_DISH_STEP per tick; TANGLE counts anticlockwise. */
const dishYaw = (heading: number, tick: number): number =>
  heading - (tick * ENEMY_DISH_STEP * TAU) / HEADING_UNITS_PER_TURN;

describe('drawWorldObjects', () => {
  it('draws the slow tank as hull, tread frame and radar dish', () => {
    const tank = enemy({ heading: 0 });
    const world = worldWith({ tick: 5, enemies: [tank] });
    const pos = { x: tank.pos.x, y: 0, z: tank.pos.z };
    // The tank faces away down +Z, so the viewer sees its rear treads.
    const tread = TREAD_FRAMES.rear[5 % TREAD_FRAMES.rear.length]!;
    expect(keys(draw(world))).toEqual(
      keys([
        ...modelLines('tank', pos, 0),
        ...modelLines(tread, pos, 0),
        ...modelLines('radarDish', pos, dishYaw(0, 5)),
      ]),
    );
  });

  it('uses the front tread frames when the tank faces the player', () => {
    const tank = enemy({ heading: Math.PI });
    const world = worldWith({ tick: 2, enemies: [tank] });
    const front = TREAD_FRAMES.front[2 % TREAD_FRAMES.front.length]!;
    const drawn = keys(draw(world));
    const pos = { x: tank.pos.x, y: 0, z: tank.pos.z };
    for (const line of keys(modelLines(front, pos, Math.PI))) expect(drawn).toContain(line);
  });

  it('animates the treads as the tick advances', () => {
    const tank = enemy({});
    const atTick = (tick: number) => keys(draw(worldWith({ tick, enemies: [tank] })));
    expect(atTick(0)).not.toEqual(atTick(1));
  });

  it('draws the supertank as a single body', () => {
    const unit = enemy({ kind: 'supertank', heading: 0.5 });
    const world = worldWith({ tick: 3, enemies: [unit] });
    expect(keys(draw(world))).toEqual(
      keys(modelLines('supertank', { x: unit.pos.x, y: 0, z: unit.pos.z }, 0.5)),
    );
  });

  it('draws the missile and the saucer at their height', () => {
    for (const kind of ['missile', 'saucer'] as const) {
      const unit = enemy({ kind, y: 1200, heading: 0.25 });
      const drawn = draw(worldWith({ enemies: [unit] }));
      expect(keys(drawn)).toEqual(
        keys(modelLines(kind, { x: unit.pos.x, y: 1200, z: unit.pos.z }, 0.25)),
      );
      // Height must actually move it: a grounded one lands somewhere else.
      const grounded = draw(worldWith({ enemies: [enemy({ kind, y: 0, heading: 0.25 })] }));
      expect(keys(drawn)).not.toEqual(keys(grounded));
    }
  });

  it('draws nothing for a dead enemy', () => {
    expect(draw(worldWith({ enemies: [enemy({ alive: false })] }))).toHaveLength(0);
  });

  it('draws nothing for an object behind the player', () => {
    expect(draw(worldWith({ enemies: [enemy({ pos: { x: 0, z: -6000 } })] }))).toHaveLength(0);
  });

  it('draws shells with the shell model at their height', () => {
    const shell: Shell = {
      id: 7,
      owner: 'player',
      pos: { x: 200, z: 4000 },
      y: 300,
      heading: 0.1,
      ticksLeft: 10,
    };
    expect(keys(draw(worldWith({ shells: [shell] })))).toEqual(
      keys(modelLines('shell', { x: 200, y: 300, z: 4000 }, 0.1)),
    );
  });

  it('yaws debris and ignores its pitch and roll', () => {
    const piece = (rot: { x: number; y: number; z: number }): Debris => ({
      model: 'debrisHull',
      pos: { x: 0, z: 5000 },
      y: 400,
      vel: { x: 0, y: 0, z: 0 },
      rot,
      spin: { x: 0, y: 0, z: 0 },
      ticksLeft: 20,
    });
    const yawed = draw(worldWith({ debris: [piece({ x: 0, y: 0.7, z: 0 })] }));
    expect(keys(yawed)).toEqual(keys(modelLines('debrisHull', { x: 0, y: 400, z: 5000 }, 0.7)));
    const tilted = draw(worldWith({ debris: [piece({ x: 1, y: 0.7, z: 2 })] }));
    expect(keys(tilted)).toEqual(keys(yawed));
  });

  it('draws obstacles from their models', () => {
    const obstacles: Obstacle[] = [
      { kind: 'pyramid', pos: { x: -1000, z: 7000 }, heading: 0, radius: 832 },
      { kind: 'box', pos: { x: 1000, z: 7000 }, heading: 0.6, radius: 832 },
    ];
    expect(keys(draw(worldWith({ obstacles })))).toEqual(
      keys([
        ...modelLines('pyramid', { x: -1000, y: 0, z: 7000 }, 0),
        ...modelLines('box', { x: 1000, y: 0, z: 7000 }, 0.6),
      ]),
    );
  });

  it('fades distant objects', () => {
    const near = draw(
      worldWith({ enemies: [enemy({ kind: 'supertank', pos: { x: 0, z: 2000 } })] }),
    );
    const far = draw(
      worldWith({ enemies: [enemy({ kind: 'supertank', pos: { x: 0, z: 14000 } })] }),
    );
    const brightest = (lines: RecordedLine[]) => Math.max(...lines.map((l) => l.intensity));
    expect(far.length).toBeGreaterThan(0);
    expect(brightest(far)).toBeLessThan(brightest(near));
  });

  it('keeps every object inside the 3D view window', () => {
    const world = worldWith({
      tick: 9,
      enemies: [enemy({ pos: { x: 300, z: 1200 } })],
      obstacles: [{ kind: 'pyramidWide', pos: { x: -600, z: 1500 }, heading: 1.2, radius: 1024 }],
    });
    for (const l of draw(world)) {
      expect(Math.min(l.x0, l.x1)).toBeGreaterThanOrEqual(VIEW_CLIP.left - 1e-6);
      expect(Math.max(l.x0, l.x1)).toBeLessThanOrEqual(VIEW_CLIP.right + 1e-6);
      expect(Math.min(l.y0, l.y1)).toBeGreaterThanOrEqual(VIEW_CLIP.bottom - 1e-6);
      expect(Math.max(l.y0, l.y1)).toBeLessThanOrEqual(VIEW_CLIP.top + 1e-6);
    }
  });
});
