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
 * * missile      - the missile body at its altitude;
 * * saucer       - the saucer at its hover height;
 * * shell        - the projectile shape `$03`;
 * * debris       - the six chunks, yawing only (design spec 5.3).
 *
 * Nothing here pitches or rolls: the MathBox could only yaw (reference section 2),
 * so `Debris.rot.x` and `.z` are deliberately ignored.
 */

import { ENEMY_DISH_STEP, HEADING_UNITS_PER_TURN } from '../data/constants';
import { MODELS, TREAD_FRAMES } from '../data/models';
import type { WireModel } from '../data/types';
import { TAU, angleTo, wrapAngle } from '../engine/math';
import type { Debris, Enemy, Shell, Vec2, World } from '../game/types';
import { drawModel, type Camera } from './camera';
import type { VectorDisplay } from './vectorDisplay';

/**
 * Battlefield objects are drawn at full intensity; `DRAW` then subtracts the
 * depth cue, which `drawModel` applies (BZONE.MAC.txt:3761-3775).  The saucer and
 * the attract logo bypassed the cue in the ROM and used a fixed intensity; they
 * go through the same path here, which at most makes a distant saucer a shade
 * dimmer than the original's.
 */
const OBJECT_INTENSITY = 1;

/** One ROM heading unit in radians. */
const HEADING_UNIT_RADIANS = TAU / HEADING_UNITS_PER_TURN;

/** Enemy kinds whose whole shape is one model. */
const SINGLE_BODY_MODELS: Partial<Record<Enemy['kind'], string>> = {
  supertank: 'supertank',
  missile: 'missile',
  saucer: 'saucer',
};

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
): void {
  drawModel(
    d,
    cam,
    model(name),
    { x: pos.x, y, z: pos.z },
    { x: 0, y: heading, z: 0 },
    OBJECT_INTENSITY,
  );
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
  return tank.heading - tick * ENEMY_DISH_STEP * HEADING_UNIT_RADIANS;
}

function drawEnemy(d: VectorDisplay, cam: Camera, unit: Enemy, tick: number): void {
  const single = SINGLE_BODY_MODELS[unit.kind];
  if (single) {
    drawAt(d, cam, single, unit.pos, unit.y, unit.heading);
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
    if (unit.alive) drawEnemy(d, cam, unit, world.tick);
  }
  for (const shell of world.shells) drawShell(d, cam, shell);
  for (const piece of world.debris) drawDebris(d, cam, piece);
}
