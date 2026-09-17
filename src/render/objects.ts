/**
 * Everything in the battlefield: obstacles, the enemy unit, shells in flight and
 * explosion debris.  All of it goes through `drawModel`, so projection, near-plane
 * clipping, the 3D view window and the distance fade are the camera's business
 * and not repeated here (docs/reference/original-game.md section 2).
 *
 * The original rebuilt its visible-object list every tick (DIS-O) and the shape
 * each unit contributed is what this reproduces:
 *
 * * slow tank    - hull `$02`, the tread frame for whichever end faces the
 *                  viewer (`$04`-`$0b`), and the spinning radar dish `$0d`;
 * * super tank   - one body, `$21`, with no treads and no dish;
 * * missile      - the body at its altitude plus a spatter object (`$24`-`$2b`);
 * * saucer       - the saucer at its hover height, without the depth cue, fading
 *                  out over its 32 disintegration ticks once it is hit;
 * * shell        - the projectile shape `$03`;
 * * debris       - the six chunks, yawing only (design spec 5.3).
 *
 * Nothing here pitches or rolls: the MathBox could only yaw (reference section 2),
 * so `Debris.rot.x` and `.z` are deliberately ignored.
 */

import { ENEMY_DISH_STEP, SAUCER_DEATH_TICKS, TANGLE_UNIT_RADIANS } from '../data/constants';
import { DOT_MODEL_NAMES, MODELS, TREAD_FRAMES } from '../data/models';
import type { WireModel } from '../data/types';
import { angleTo, wrapAngle } from '../engine/math';
import type { Debris, Enemy, Shell, Vec2, World } from '../game/types';
import { drawModel, type Camera } from './camera';
import type { VectorDisplay } from './vectorDisplay';

/**
 * Battlefield objects are drawn at full intensity; `DRAW` then subtracts the
 * depth cue, which `drawModel` applies (BZONE.MAC.txt:3761-3775).  The saucer is
 * the exception the ROM makes, and it is made below.
 */
const OBJECT_INTENSITY = 1;

/** Enemy kinds whose whole shape is one model. */
const SINGLE_BODY_MODELS: Partial<Record<Enemy['kind'], string>> = {
  supertank: 'supertank',
};

/**
 * The missile's exhaust: an expanding ring of dots drawn beside the body, one
 * spatter object (`$24`-`$2b`) per frame.  Nothing in the world counts the plume,
 * so the tick cycles it, as it does the treads.
 */
const EXHAUST_FRAMES = DOT_MODEL_NAMES;

function model(name: string): WireModel {
  const found = MODELS[name];
  if (!found) throw new Error(`objects: no model named ${name}`);
  return found;
}

/** Draws one model on the ground plane or at `y`, yawed by `heading`. */
function drawAt(
  d: VectorDisplay,
  cam: Camera,
  name: string,
  pos: Vec2,
  y: number,
  heading: number,
  opts?: { depthCue?: boolean; intensity?: number },
): void {
  drawModel(
    d,
    cam,
    model(name),
    { x: pos.x, y, z: pos.z },
    { x: 0, y: heading, z: 0 },
    opts?.intensity ?? OBJECT_INTENSITY,
    opts,
  );
}

/**
 * How brightly a disintegrating saucer is drawn.  `SCOLFG` is loaded with `$40`
 * when the saucer is hit and decremented twice a tick, and the drawn intensity is
 * taken straight off that counter, so the shape flares and fades over its 32 ticks
 * (docs/reference/atari-source-notes.md, "The saucer").  `Enemy.timer` is that
 * counter in ticks, so the level is simply how much of it is left.
 */
function dyingSaucerIntensity(saucer: Enemy): number {
  return (OBJECT_INTENSITY * Math.max(saucer.timer, 0)) / SAUCER_DEATH_TICKS;
}

/**
 * Which tread set to draw.  The ROM drew only the end of the tank the viewer can
 * see - the front frames when the tank faces you, the rear ones when it is
 * driving away (BZONE.MAC.txt:3017-3049).
 */
function treadFrame(cam: Camera, tank: Enemy, tick: number): string {
  const toViewer = angleTo(tank.pos, cam.pos);
  const facingViewer = Math.abs(wrapAngle(toViewer - tank.heading)) < Math.PI / 2;
  const frames = facingViewer ? TREAD_FRAMES.front : TREAD_FRAMES.rear;
  // TRDCTR's low two bits pick the frame; nothing in the world counts tread
  // travel, so the tick drives the animation - it is decoration either way.
  return frames[tick % frames.length]!;
}

/**
 * The slow tank's radar dish spins `ENEMY_DISH_STEP` heading units per tick, the
 * same rate as the player's own radar sweep (reference section 2).  `TANGLE`
 * counts anticlockwise, so the yaw decreases.  Like the treads this is a visual
 * detail with no state in the world, so it is a function of the tick.
 */
function dishHeading(tank: Enemy, tick: number): number {
  return tank.heading - tick * ENEMY_DISH_STEP * TANGLE_UNIT_RADIANS;
}

function drawEnemy(d: VectorDisplay, cam: Camera, unit: Enemy, tick: number): void {
  const single = SINGLE_BODY_MODELS[unit.kind];
  if (single) {
    drawAt(d, cam, single, unit.pos, unit.y, unit.heading);
    return;
  }
  if (unit.kind === 'missile') {
    drawAt(d, cam, 'missile', unit.pos, unit.y, unit.heading);
    drawAt(d, cam, EXHAUST_FRAMES[tick % EXHAUST_FRAMES.length]!, unit.pos, unit.y, unit.heading);
    return;
  }
  if (unit.kind === 'saucer') {
    // SINT, not DQUE: the saucer keeps its brightness however far away it is
    // (docs/reference/atari-source-notes.md, "Depth cueing and clipping").
    drawAt(d, cam, 'saucer', unit.pos, unit.y, unit.heading, {
      depthCue: false,
      intensity: unit.alive ? OBJECT_INTENSITY : dyingSaucerIntensity(unit),
    });
    return;
  }
  drawAt(d, cam, 'tank', unit.pos, unit.y, unit.heading);
  drawAt(d, cam, treadFrame(cam, unit, tick), unit.pos, unit.y, unit.heading);
  drawAt(d, cam, 'radarDish', unit.pos, unit.y, dishHeading(unit, tick));
}

function drawShell(d: VectorDisplay, cam: Camera, shell: Shell): void {
  drawAt(d, cam, 'shell', shell.pos, shell.y, shell.heading);
}

function drawDebris(d: VectorDisplay, cam: Camera, piece: Debris): void {
  drawAt(d, cam, piece.model, piece.pos, piece.y, piece.rot.y);
}

/** Draws the battlefield: obstacles first, then the moving objects over them. */
export function drawWorldObjects(d: VectorDisplay, cam: Camera, world: World): void {
  for (const obstacle of world.obstacles) {
    // `ObstacleKind` is the model key, and the ROM layout table's orientation
    // byte arrives as the obstacle's heading.
    drawAt(d, cam, obstacle.kind, obstacle.pos, 0, obstacle.heading);
  }
  for (const unit of world.enemies) {
    // A shot saucer stays on the field with `alive` false while `SCOLFG` runs
    // down, and the ROM keeps drawing it for exactly that long; everything else
    // that dies is off the list already and represented by its debris.
    if (unit.alive || unit.state === 'dying') drawEnemy(d, cam, unit, world.tick);
  }
  for (const shell of world.shells) drawShell(d, cam, shell);
  for (const piece of world.debris) drawDebris(d, cam, piece);
}
