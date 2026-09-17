/**
 * The status strip and the gunsight: radar, reserve tanks, score, high score,
 * the "ENEMY IN RANGE" alert and the reticle (docs/reference/original-game.md
 * section 1, design spec 5.4).
 *
 * None of it is clipped.  The original drew the 3D view inside a hardware window
 * that stopped at y = +192, then `BIGWND` (BZONE.MAC.txt:1217) re-opened the
 * window to the whole screen for exactly these elements, which is why the score
 * can sit above the battlefield and the reticle can cross it.
 *
 * Positions come from the ROM string table (`MESSAGES` in `data/pictures.ts`,
 * whose coordinates are quarter units) and from `data/constants.ts`; the shapes
 * are the vector-ROM pictures.  Stroke intensities are the ROM's nibbles read on
 * the vector generator's 0..15 scale, matching how the reference reads them
 * (twice the values noted in the generated picture comments, the same convention
 * `render/scene.ts` uses for the backdrop).
 */

import {
  DISTANCE_MINOR_DENOMINATOR,
  DISTANCE_MINOR_NUMERATOR,
  ENEMY_IN_RANGE_UNITS,
  HEADING_UNITS_PER_TURN,
  INTENSITY_MAX,
  LIVES_ICON_ORIGIN,
  LIVES_ICON_SPACING,
  MESSAGE_FLASH_MASK,
  RADAR_BLIP_BRIGHTNESS,
  RADAR_BLIP_DECAY,
  RADAR_BLIP_WINDOW,
  RADAR_CENTRE,
  RADAR_RADIUS,
  RADAR_SWEEP_PER_TICK,
  RETICLE_BLINK_TICKS,
  SCORE_BCD_BYTES,
  SCORE_TRAILING_ZEROS,
  SCORE_UNIT,
} from '../data/constants';
import {
  LIVES_TANK,
  MESSAGES,
  RADAR,
  RETICLE_LOCKED,
  RETICLE_NORMAL,
  type MessageEntry,
} from '../data/pictures';
import type { Picture2D } from '../data/types';
import { TAU, angleTo, wrapAngle } from '../engine/math';
import type { Enemy, Vec2, World } from '../game/types';
import { drawText } from './text';
import type { VectorDisplay } from './vectorDisplay';

/** Text is drawn at intensity 12 (reference section 6). */
const TEXT_INTENSITY = 12 / INTENSITY_MAX;

/** The reserve-tank icon is drawn at intensity 12 (reference section 1). */
const LIVES_INTENSITY = 12 / INTENSITY_MAX;

/**
 * `RDRING`'s six strokes: the four tick marks at intensity 14 and the two legs of
 * the view wedge at 10, in the order the picture stores them (E tick, S tick,
 * W tick, left wedge leg, N tick, right wedge leg).
 */
const RADAR_STROKE_INTENSITY = [14, 14, 14, 10, 14, 10].map((i) => i / INTENSITY_MAX);

/** The sweep line is emitted at `$A0`, i.e. intensity 10 (BZONE.MAC.txt:7697-7761). */
const RADAR_SWEEP_INTENSITY = 10 / INTENSITY_MAX;

/** `BLIP` is a full intensity byte, not a nibble, so it scales against 0xFF. */
const INTENSITY_BYTE_MAX = 0xff;

/** The reticle pictures: plain at intensity 6, locked at 14 (reference section 1). */
const RETICLE_INTENSITY = 6 / INTENSITY_MAX;
const RETICLE_LOCKED_INTENSITY = 14 / INTENSITY_MAX;

/** Message positions are stored in quarter units (`MessageEntry`). */
const MESSAGE_POSITION_SCALE = 4;

/**
 * Strings up to index `$12` are drawn at the ROM's SCAL 2, half the size of the
 * rest (`DrawStringPtr`, reference section 6).  One font cell at full size is the
 * 24-unit advance `render/text.ts` draws at scale 1.
 */
const HALF_SIZE_LAST_INDEX = 0x12;
const FULL_SIZE_SCALE = 1;
const HALF_SIZE_SCALE = 0.5;

/** Four BCD digits are drawn into the gap in the score strings. */
const SCORE_DIGITS = SCORE_BCD_BYTES * 2;

/** One ROM heading unit in radians. */
const HEADING_UNIT_RADIANS = TAU / HEADING_UNITS_PER_TURN;

const MESSAGES_BY_LABEL = new Map(MESSAGES.map((m) => [m.label, m]));

function message(label: string): MessageEntry {
  const entry = MESSAGES_BY_LABEL.get(label);
  if (!entry) throw new Error(`hud: no message labelled ${label}`);
  return entry;
}

const SCORE = message('YSCORE');
const HIGH_SCORE = message('CHISCR');
const ENEMY_IN_RANGE = message('ERANGE');

/** Draws a 2D picture with its ROM coordinates offset to (dx, dy). */
function drawPicture(
  d: VectorDisplay,
  picture: Picture2D,
  dx: number,
  dy: number,
  intensity: number,
): void {
  for (const stroke of picture.polylines) {
    d.polyline(
      stroke.map(([x, y]) => [x + dx, y + dy] as const),
      intensity,
    );
  }
}

/**
 * Draws one ROM string at its stored position and size, with `text` substituted
 * for the ROM's own (the score strings carry their digits).
 */
function drawMessage(d: VectorDisplay, entry: MessageEntry, text: string): void {
  drawText(
    d,
    text,
    entry.x * MESSAGE_POSITION_SCALE,
    entry.y * MESSAGE_POSITION_SCALE,
    entry.index <= HALF_SIZE_LAST_INDEX ? HALF_SIZE_SCALE : FULL_SIZE_SCALE,
    { intensity: TEXT_INTENSITY },
  );
}

/**
 * The score strings end in a literal "000" with a four-cell gap in front of it;
 * the ROM backs the beam up seven cells and draws four BCD digits there, blanking
 * leading zeros, so a score of zero shows just the literal thousands
 * (`DrawNDigits`, reference section 1).
 */
function withScore(template: string, score: number): string {
  const units = Math.min(Math.floor(score / SCORE_UNIT), 10 ** SCORE_DIGITS - 1);
  const digits = (units === 0 ? '' : String(units)).padStart(SCORE_DIGITS, ' ');
  const end = template.length - SCORE_TRAILING_ZEROS;
  return template.slice(0, end - SCORE_DIGITS) + digits + template.slice(end);
}

/**
 * The MathBox's distance, which is what `TDIST` and the blip's radius are built
 * from: an octagonal approximation, `max + 3/8 * min`, not a true hypotenuse
 * (`DISTANCE_MINOR_*` in `data/constants.ts`).  The simulation measures range the
 * same way, so the blip fades out exactly where the range alert does.
 */
function romDistance(a: Vec2, b: Vec2): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return (
    Math.max(dx, dz) + (Math.min(dx, dz) * DISTANCE_MINOR_NUMERATOR) / DISTANCE_MINOR_DENOMINATOR
  );
}

/** Screen position of a point `radius` from the radar centre, `bearing` clockwise from ahead. */
function radarPoint(radius: number, bearing: number): readonly [number, number] {
  const [cx, cy] = RADAR_CENTRE;
  return [cx + radius * Math.sin(bearing), cy + radius * Math.cos(bearing)];
}

/** The unit the radar tracks: the enemy tank or missile, never the saucer. */
function radarTarget(world: World): Enemy | undefined {
  return world.enemies.find((e) => e.alive && e.kind !== 'saucer');
}

/**
 * The blip's brightness.  `BLIP` is set to `$F0` when the sweep passes within
 * `RADAR_BLIP_WINDOW` heading units of the enemy's bearing and decays by 8 per
 * tick afterwards, so it fades over 30 ticks while the sweep comes round again
 * (BZONE.MAC.txt:7775-7803, 8017-8025).  The world keeps no blip state, so the
 * decay is read back from how far the sweep has travelled past the bearing.
 */
function blipLevel(sweep: number, bearing: number): number {
  const past = sweep - bearing;
  const unitsPast =
    (((past / HEADING_UNIT_RADIANS) % HEADING_UNITS_PER_TURN) + HEADING_UNITS_PER_TURN) %
    HEADING_UNITS_PER_TURN;
  if (unitsPast <= RADAR_BLIP_WINDOW) return RADAR_BLIP_BRIGHTNESS;
  const ticksPast = Math.floor(unitsPast / RADAR_SWEEP_PER_TICK);
  return RADAR_BLIP_BRIGHTNESS - RADAR_BLIP_DECAY * ticksPast;
}

/**
 * The radar: the static `RDRING` art, the sweep line at `world.radarAngle` and the
 * enemy blip.  Everything is player-relative - the view wedge always points up
 * the screen - and the sweep and the blip bearing are measured clockwise from
 * there, which is why the player's heading is subtracted rather than added.
 */
export function drawRadar(d: VectorDisplay, world: World): void {
  const [cx, cy] = RADAR_CENTRE;

  RADAR.polylines.forEach((stroke, i) => d.polyline(stroke, RADAR_STROKE_INTENSITY[i]));

  const [sx, sy] = radarPoint(RADAR_RADIUS, world.radarAngle);
  d.line(cx, cy, sx, sy, RADAR_SWEEP_INTENSITY);

  const target = radarTarget(world);
  if (!target) return;
  const range = romDistance(world.player.pos, target.pos);
  // Out of radar range is the same test as the range alert: TDIST >= 0x80.
  if (range >= ENEMY_IN_RANGE_UNITS) return;
  const bearing = wrapAngle(angleTo(world.player.pos, target.pos) - world.player.heading);
  const level = blipLevel(world.radarAngle, bearing);
  if (level <= 0) return;
  // The ROM emits the dot twice to brighten it; one lit point is enough here
  // because the display rounds its line caps.
  const radius = (RADAR_RADIUS * range) / ENEMY_IN_RANGE_UNITS;
  d.polyline([radarPoint(radius, bearing)], level / INTENSITY_BYTE_MAX);
}

/**
 * The gunsight, from screen centre.  `XCROSS` is the plain bracket sight and
 * `XCROS1` the locked one, whose corners splay out and whose strokes jump to
 * intensity 14 (the ROM leaves two short stubs at 6; they are drawn with the rest
 * here, which spec 5.4 describes as one bright picture).
 */
export function drawReticle(d: VectorDisplay, locked: boolean): void {
  drawPicture(
    d,
    locked ? RETICLE_LOCKED : RETICLE_NORMAL,
    0,
    0,
    locked ? RETICLE_LOCKED_INTENSITY : RETICLE_INTENSITY,
  );
}

/** One `TSYMBL` tank icon per remaining life, left to right. */
function drawReserveTanks(d: VectorDisplay, lives: number): void {
  const [x, y] = LIVES_ICON_ORIGIN;
  for (let life = 0; life < lives; life += 1) {
    drawPicture(d, LIVES_TANK, x + life * LIVES_ICON_SPACING, y, LIVES_INTENSITY);
  }
}

/** True on the lit half of a two-tick-on, two-tick-off flash. */
function flashOn(tick: number): boolean {
  return (tick & MESSAGE_FLASH_MASK) === 0;
}

/**
 * The reticle blinks while the player's shell is in flight - the ROM blanks it on
 * alternate groups of 32 NMIs, which is two ticks lit and two dark - and is solid
 * once the gun is loaded again.  An enemy shell does not blink it.
 */
function reticleVisible(world: World, blinkTick: number): boolean {
  const firing = world.shells.some((shell) => shell.owner === 'player');
  if (!firing) return true;
  return Math.floor(blinkTick / RETICLE_BLINK_TICKS) % 2 === 0;
}

/**
 * Draws the whole status strip and the reticle.
 *
 * `opts.showEnemyInRange` lets the caller suppress the range alert (attract mode,
 * the death sequence) without touching the world; the message still needs
 * `world.enemyInRange`.  `opts.blinkTick` is the frame counter the message flash
 * and the reticle blink are phased from, and `opts.highScore` is the number to
 * show on the HIGH SCORE line - the table's best, or the current score once it
 * has passed it, which only the game state knows.
 */
export function drawHud(
  d: VectorDisplay,
  world: World,
  opts: { showEnemyInRange: boolean; blinkTick: number; highScore: number },
): void {
  drawRadar(d, world);
  drawReserveTanks(d, world.lives);
  drawMessage(d, SCORE, withScore(SCORE.text, world.score));
  drawMessage(d, HIGH_SCORE, withScore(HIGH_SCORE.text, opts.highScore));

  if (opts.showEnemyInRange && world.enemyInRange && flashOn(opts.blinkTick)) {
    drawMessage(d, ENEMY_IN_RANGE, ENEMY_IN_RANGE.text);
  }

  if (reticleVisible(world, opts.blinkTick)) drawReticle(d, world.targetInSights);
}
