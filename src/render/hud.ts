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
 * Positions and sizes come from the ROM string table, which `render/messages.ts`
 * owns along with the string and picture primitives the HUD shares with the
 * full-screen displays; the rest comes from `data/constants.ts`, and the shapes
 * are the vector-ROM pictures.  Stroke intensities are the ROM's nibbles read on
 * the vector generator's 0..15 scale, matching how the reference reads them (twice
 * the values noted in the generated picture comments, the same convention
 * `render/scene.ts` uses for the backdrop).
 */

import {
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
  RADAR_ENEMY_SHELL_INTENSITY,
  RADAR_PLAYER_SHELL_INTENSITY,
  RADAR_RADIUS,
  RADAR_SWEEP_PER_TICK,
  RETICLE_BLINK_TICKS,
  SCORE_TRAILING_ZEROS,
  TANGLE_UNIT_RADIANS,
} from '../data/constants';
import { LIVES_TANK, RADAR, RETICLE_LOCKED, RETICLE_NORMAL } from '../data/pictures';
import { wrapAngle } from '../engine/math';
import { bearingTo, nearestEnemyUnit, octagonalDistance } from '../game/collision';
import { playerShellInFlight } from '../game/shells';
import type { Shell, Vec2, World } from '../game/types';
import { SCORE_DIGITS, drawMessage, drawPicture, message, scoreDigits } from './messages';
import type { VectorDisplay } from './vectorDisplay';

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

const SCORE = message('YSCORE');
const HIGH_SCORE = message('CHISCR');
const ENEMY_IN_RANGE = message('ERANGE');

/**
 * The score strings end in a literal "000" with a four-cell gap in front of it;
 * the ROM backs the beam up seven cells and draws four BCD digits there, blanking
 * leading zeros, so a score of zero shows just the literal thousands
 * (`DrawNDigits`, reference section 1).
 */
function withScore(template: string, score: number): string {
  const end = template.length - SCORE_TRAILING_ZEROS;
  return template.slice(0, end - SCORE_DIGITS) + scoreDigits(score) + template.slice(end);
}

/** Screen position of a point `radius` from the radar centre, `bearing` clockwise from ahead. */
function radarPoint(radius: number, bearing: number): readonly [number, number] {
  const [cx, cy] = RADAR_CENTRE;
  return [cx + radius * Math.sin(bearing), cy + radius * Math.cos(bearing)];
}

/** How far past the enemy's bearing the sweep line has travelled, in heading units. */
function unitsPastBearing(sweep: number, bearing: number): number {
  const past = (sweep - bearing) / TANGLE_UNIT_RADIANS;
  return ((past % HEADING_UNITS_PER_TURN) + HEADING_UNITS_PER_TURN) % HEADING_UNITS_PER_TURN;
}

/**
 * The blip levels, one per unit, held from tick to tick.
 *
 * `BLIP` is a byte in RAM: `DRADAR` loads it with `$F0` when the sweep passes
 * within `RADAR_BLIP_WINDOW` heading units of the enemy's bearing and takes 8 off
 * it every tick afterwards, so the dot flashes and fades over the 30 ticks the
 * sweep needs to come round again (BZONE.MAC.txt:7775-7803, 8017-8025).
 *
 * Reading that level back out of the sweep and bearing angles is only the same
 * thing while the player stands still: the bearing is measured from the player's
 * own heading, so turning slides it under the sweep and the blip flickers
 * brighter and dimmer as the tank pivots.  Holding the level is both what the ROM
 * does and what stops the flicker.  It is renderer state, not world state -
 * nothing in the simulation depends on it - so the caller owns it and advances it
 * once per simulated tick.
 */
export interface RadarBlips {
  /**
   * One game tick: fade every blip, and relight the one the sweep just passed.
   *
   * `ticksBack` is for a caller catching up on ticks it never saw a world for:
   * the sweep advances a fixed `RADAR_SWEEP_PER_TICK` every tick, so where it
   * was `ticksBack` ticks before this world is exact arithmetic, and winding it
   * back that far is what keeps a crossing from being missed entirely.
   */
  advance(world: World, ticksBack?: number): void;
  /** A unit's level on the ROM's 0..255 scale; 0 once it has faded out. */
  levelFor(id: number): number;
  /** Forget everything, for a battlefield that has been replaced. */
  reset(): void;
}

export function createRadarBlips(): RadarBlips {
  const levels = new Map<number, number>();
  return {
    advance(world: World, ticksBack = 0): void {
      for (const [id, level] of levels) {
        const faded = level - RADAR_BLIP_DECAY;
        if (faded > 0) levels.set(id, faded);
        else levels.delete(id);
      }
      const unit = nearestEnemyUnit(world);
      if (!unit) return;
      const sweep = world.radarAngle - ticksBack * RADAR_SWEEP_PER_TICK * TANGLE_UNIT_RADIANS;
      const bearing = wrapAngle(bearingTo(world.player.pos, unit.pos) - world.player.heading);
      if (unitsPastBearing(sweep, bearing) <= RADAR_BLIP_WINDOW) {
        levels.set(unit.id, RADAR_BLIP_BRIGHTNESS);
      }
    },
    levelFor: (id) => levels.get(id) ?? 0,
    reset: () => levels.clear(),
  };
}

/**
 * Where on the radar face a thing at `pos` in the world belongs, or null when it
 * is past the rim.
 *
 * Range and bearing come from `game/collision.ts`, the same octagonal distance
 * and torus-aware bearing the simulation's range alert and reticle lock use, so
 * a mark goes dark exactly where the alert does.  Out of radar range is the same
 * test as the alert: TDIST >= 0x80.
 */
function radarMark(world: World, pos: Vec2): readonly [number, number] | null {
  const range = octagonalDistance(world.player.pos, pos);
  if (range >= ENEMY_IN_RANGE_UNITS) return null;
  const bearing = wrapAngle(bearingTo(world.player.pos, pos) - world.player.heading);
  return radarPoint((RADAR_RADIUS * range) / ENEMY_IN_RANGE_UNITS, bearing);
}

/** The enemy blip: `DRADAR`'s own dot, at the level `blips` is holding for it. */
function drawEnemyBlip(d: VectorDisplay, world: World, blips: RadarBlips): void {
  // `nearestEnemyUnit` is the same choice the range alert, the reticle lock and
  // the blip ping in the simulation make - the nearest live unit that is not the
  // saucer - so the blip can never be tracking a different tank from the one
  // "ENEMY IN RANGE" is lit for.
  const target = nearestEnemyUnit(world);
  if (!target) return;
  const point = radarMark(world, target.pos);
  if (!point) return;
  const level = blips.levelFor(target.id);
  if (level <= 0) return;
  // `DRADAR` emits the point twice so the beam dwells on it and the phosphor
  // comes up brighter than a single pass would leave it (original-game.md:127).
  // On a canvas the second pass composites over the first, which is the same
  // bargain: one dot, drawn harder.
  d.polyline([point], level / INTENSITY_BYTE_MAX);
  d.polyline([point], level / INTENSITY_BYTE_MAX);
}

/** How brightly a shell of this owner's is marked (see the constants). */
function shellIntensity(owner: Shell['owner']): number {
  return owner === 'enemy' ? RADAR_ENEMY_SHELL_INTENSITY : RADAR_PLAYER_SHELL_INTENSITY;
}

/**
 * Shells in the air, each a single dimmer pass so it reads as a lighter mark
 * than the enemy blip beside it.  Nothing is held between frames: the world's
 * shell list is the whole of the state, which is what keeps these useful over a
 * flight shorter than the sweep's own period.
 */
function drawShellMarks(d: VectorDisplay, world: World): void {
  for (const shell of world.shells) {
    const point = radarMark(world, shell.pos);
    if (point) d.polyline([point], shellIntensity(shell.owner) / INTENSITY_BYTE_MAX);
  }
}

/**
 * The radar: the static `RDRING` art, the sweep line at `world.radarAngle`, the
 * enemy blip and the shells in the air.  Everything is player-relative - the
 * view wedge always points up the screen - and the sweep and every bearing are
 * measured clockwise from there, which is why the player's heading is subtracted
 * rather than added.
 */
export function drawRadar(d: VectorDisplay, world: World, blips: RadarBlips): void {
  const [cx, cy] = RADAR_CENTRE;

  RADAR.polylines.forEach((stroke, i) => d.polyline(stroke, RADAR_STROKE_INTENSITY[i]));

  const [sx, sy] = radarPoint(RADAR_RADIUS, world.radarAngle);
  d.line(cx, cy, sx, sy, RADAR_SWEEP_INTENSITY);

  drawEnemyBlip(d, world, blips);
  drawShellMarks(d, world);
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

/**
 * One `TSYMBL` tank icon per remaining life, left to right.
 *
 * `INFO` draws exactly `LIVES` icons and none at all when `LIVES` is zero -
 * "OUTPUT 1 TANK PER LIFE" (BZONE.MAC.txt:8287-8299) - and `LIVES` still counts
 * the tank being played, since it is decremented on the hit that kills it and the
 * game is over when it reaches zero (BZONE.MAC.txt:4607-4611).  So a fresh game on
 * three lives shows three icons, not two.
 */
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
  if (!playerShellInFlight(world)) return true;
  return Math.floor(blinkTick / RETICLE_BLINK_TICKS) % 2 === 0;
}

/**
 * Draws the whole status strip and, unless the caller says otherwise, the reticle.
 *
 * Three of the elements are switched from outside, because the ROM reaches them
 * through a frame this function knows nothing about:
 *
 * * `showReticle` is false behind the attract logo, the one case the ROM leaves
 *   the gunsight off (BZONE.MAC.txt:961-965), and off wherever the radar is;
 * * `showRadar` is false once the player is hit - `MAIN` jumps to `WNSHLD`
 *   instead of drawing the radar and the reticle at all (BZONE.MAC.txt:961-965) -
 *   and on the high score displays, which replace the frame `DRADAR` belongs to;
 * * `showAlert` is false in the same places: `EIRNGE` is emitted from that same
 *   stretch of `MAIN`, so a frozen world cannot leave "ENEMY IN RANGE" burning
 *   over the crack or over the initials the player is entering.
 *
 * All three default to true.  `blinkTick` is the frame counter the message flash
 * and the reticle blink are phased from, `highScore` is the number the HIGH
 * SCORE line shows - the best of the table and the score in hand, which only the
 * game state knows - and `blips` is the held radar levels, which the caller owns
 * because they outlive a frame: see `RadarBlips`.
 */
export function drawHud(
  d: VectorDisplay,
  world: World,
  opts: {
    showReticle: boolean;
    blinkTick: number;
    highScore: number;
    blips: RadarBlips;
    showRadar?: boolean;
    showAlert?: boolean;
  },
): void {
  if (opts.showRadar ?? true) drawRadar(d, world, opts.blips);
  drawReserveTanks(d, world.lives);
  drawMessage(d, SCORE, withScore(SCORE.text, world.score));
  drawMessage(d, HIGH_SCORE, withScore(HIGH_SCORE.text, opts.highScore));

  if ((opts.showAlert ?? true) && world.enemyInRange && flashOn(opts.blinkTick)) {
    drawMessage(d, ENEMY_IN_RANGE, ENEMY_IN_RANGE.text);
  }

  if (opts.showReticle && reticleVisible(world, opts.blinkTick)) {
    drawReticle(d, world.targetInSights);
  }
}
