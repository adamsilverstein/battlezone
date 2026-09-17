/**
 * The full-screen displays that stand in for the battlefield: the attract title
 * with its flying logo, the high score table, the initials entry screen and the
 * GAME OVER line.  (Source citations are to the Atari listings at
 * https://github.com/historicalsource/battlezone, not to anything in this tree.)  The ROM string table and the two drawing primitives they share
 * with the HUD live in `render/messages.ts`.
 *
 * `MAIN` "branch[es] away to the high score or attract display if either is
 * active" (docs/reference/atari-source-notes.md, "Frame timing and the main
 * loop"), which is why these are whole screens rather than overlays: the table and
 * the entry screen replace the 3D view instead of sitting over it.  The logo and
 * the copyright line are the exceptions - they are drawn over the demo.
 *
 * THE FLYING LOGO
 * ---------------
 * The title is not text: `BATTLE` and `ZONE` are three vector objects (`logoBA`,
 * `logoTTLE`, `logoZONE`) that `BATINT` starts below the horizon and close to the
 * viewer and `BATTLE` walks outwards - one axis stepping `LOGO_Z_PER_TICK` from
 * `LOGO_START_Z` (the rise) and the other `LOGO_X_PER_TICK` from `LOGO_START_X`
 * (the recession) - for `LOGO_TICKS` ticks, with "ZONE" held back until the group
 * has risen past `LOGO_ZONE_HELD_UNTIL` so the words arrive in sequence.
 *
 * The letters are "pre-tilted in the shape data (rotate 76 degrees about X and the
 * logo faces the viewer squarely)" (docs/reference/original-game.md section 4), so
 * the shapes as stored lie almost flat.  Undoing that rotation - the only thing
 * `drawTitle` does that `drawModel` could not, since the MathBox could never pitch
 * anything and neither can the renderer - stands the three groups up as one sign
 * about 1900 units tall, BATTLE over ZONE, with a few hundred units of depth left
 * in it.  From there it is the same `SCREEN_SCALE / depth` divide as the rest of
 * the game, so the sign keeps its proportions, rises, shrinks and holds a little
 * real perspective as it goes.
 */

import {
  HIGH_SCORE_FIRST_LINE_Y_QUARTERS,
  HIGH_SCORE_LINE_SPACING_QUARTERS,
  HIGH_SCORE_LINE_X_QUARTERS,
  HIGH_SCORE_LINE_X_SLANT,
  HIGH_SCORE_MAX_TANK_ICONS,
  HIGH_SCORE_TANK_ICON_ADVANCE,
  INITIALS_ENTRY_ORIGIN,
  INTENSITY_MAX,
  LOGO_INTENSITY,
  LOGO_START_X,
  LOGO_START_Z,
  LOGO_X_PER_TICK,
  LOGO_TILT_DEGREES,
  LOGO_ZONE_HELD_UNTIL,
  LOGO_Z_PER_TICK,
  PRESS_START_FLASH_TICKS,
  SCORE_UNIT,
  SCREEN_SCALE,
  SUPER_BONUS_SCORE,
} from '../data/constants';
import { CELL_ADVANCE } from '../data/font';
import { TAU } from '../engine/math';
import { MODELS } from '../data/models';
import { COPYRIGHT, LIVES_TANK, PHONOGRAM } from '../data/pictures';
import type { WireModel } from '../data/types';
import type { HighScoreEntry } from '../game/types';
import {
  FULL_SIZE_SCALE,
  MESSAGE_POSITION_SCALE,
  TEXT_INTENSITY,
  drawMessage,
  drawPicture,
  message,
  scoreDigits,
} from './messages';
import { drawText } from './text';
import type { VectorDisplay } from './vectorDisplay';

const PRESS_START = message('PRSTRT');
const GAME_OVER = message('GAMOVR');
const HIGH_SCORES = message('HISCOR');
const THOUSANDS = message('ZEROS');
const BONUS_TANK = message('BONPLN');
const BONUS_TANK_END = message('BONPL1');
const COPYRIGHT_LINE = message('COPYRT');
const GREAT_SCORE = message('LINE1');
const ENTER_INITIALS = message('LINE2');
const CHANGE_LETTER = message('LINE3');
const SELECT_LETTER = message('LINE4');

/** The reserve-tank icon is drawn at intensity 12 (reference section 1). */
const TANK_ICON_INTENSITY = 12 / INTENSITY_MAX;

// --------------------------------------------------------------------------- //
// The flying logo
// --------------------------------------------------------------------------- //

/** `LOGOBJ`: the three letter groups, in the order the ROM lists them. */
const LOGO_PIECES = ['logoBA', 'logoTTLE', 'logoZONE'] as const;

/** The last piece, which waits for the group to rise (BZONE.MAC.txt:1457-1477). */
const LOGO_HELD_PIECE = 'logoZONE';

/**
 * The logo's fixed brightness.  `SINT` takes the intensity in the high nibble of
 * its byte, so `$F0` is nibble 15 - the maximum the vector generator can draw.
 */
const LOGO_INTENSITY_SCALED = (LOGO_INTENSITY >> 4) / INTENSITY_MAX;

function model(name: string): WireModel {
  const found = MODELS[name];
  if (!found) throw new Error(`screens: no model named ${name}`);
  return found;
}

/** How far out the group has flown after `ticks` ticks of the sequence. */
function logoDepth(ticks: number): number {
  return LOGO_START_X + ticks * LOGO_X_PER_TICK;
}

/** How far the group has risen after `ticks` ticks; it starts below the horizon. */
function logoHeight(ticks: number): number {
  return LOGO_START_Z + ticks * LOGO_Z_PER_TICK;
}

/** The pre-tilt, undone: -76 degrees about X, in the render space's own axes. */
const LOGO_TILT_RADIANS = (-LOGO_TILT_DEGREES / 360) * TAU;
const TILT_COS = Math.cos(LOGO_TILT_RADIANS);
const TILT_SIN = Math.sin(LOGO_TILT_RADIANS);

/**
 * One logo vertex on screen.  ROM vertices are [forward, left, up], which
 * `render/camera.ts` maps to (-left, up, forward); the tilt is taken out of the
 * y-z plane from there, and the group's own depth and height carry it out and up.
 */
function logoPoint(
  vertex: readonly [number, number, number],
  depth: number,
  height: number,
): readonly [number, number] {
  const [forward, left, up] = vertex;
  const x = -left;
  const y = up * TILT_COS - forward * TILT_SIN;
  const z = up * TILT_SIN + forward * TILT_COS + depth;
  return [(SCREEN_SCALE * x) / z, (SCREEN_SCALE * (y + height)) / z];
}

/** Draws the three letter groups where the flight has taken them. */
export function drawTitle(d: VectorDisplay, ticks: number): void {
  const depth = logoDepth(ticks);
  const height = logoHeight(ticks);

  for (const name of LOGO_PIECES) {
    if (name === LOGO_HELD_PIECE && height <= LOGO_ZONE_HELD_UNTIL) continue;
    const piece = model(name);
    for (const [from, to] of piece.edges) {
      const a = piece.vertices[from];
      const b = piece.vertices[to];
      if (!a || !b) continue;
      const [x0, y0] = logoPoint(a, depth, height);
      const [x1, y1] = logoPoint(b, depth, height);
      d.line(x0, y0, x1, y1, LOGO_INTENSITY_SCALED);
    }
  }
}

// --------------------------------------------------------------------------- //
// The lines that show while no game is being played
// --------------------------------------------------------------------------- //

/**
 * `(C)(P)  ATARI 1980`, drawn in the play area whenever a game is not being played
 * (BZONE.MAC.txt:909-915, docs/reference/original-game.md section 4).  The two
 * circled symbols are font glyphs 39 and 40, which live in `pictures.ts` rather
 * than the font map, so they are drawn as pictures on the first two cells.
 */
export function drawCopyright(d: VectorDisplay): void {
  const x = COPYRIGHT_LINE.x * MESSAGE_POSITION_SCALE;
  const y = COPYRIGHT_LINE.y * MESSAGE_POSITION_SCALE;
  drawPicture(d, COPYRIGHT, x, y, TEXT_INTENSITY);
  drawPicture(d, PHONOGRAM, x + CELL_ADVANCE, y, TEXT_INTENSITY);
  drawText(d, '  ATARI 1980', x + 2 * CELL_ADVANCE, y, FULL_SIZE_SCALE, {
    intensity: TEXT_INTENSITY,
  });
}

/** `PRESS START`, flashing at about 2 Hz while the machine waits for a player. */
export function drawPressStart(d: VectorDisplay, blinkTick: number): void {
  if (Math.floor(blinkTick / PRESS_START_FLASH_TICKS) % 2 !== 0) return;
  drawMessage(d, PRESS_START);
}

/**
 * `GAME OVER`, which the ROM draws steadily over whatever is behind it.  The text
 * is a parameter because the state machine publishes it as `GameState.message`.
 */
export function drawGameOver(d: VectorDisplay, text: string = GAME_OVER.text): void {
  drawMessage(d, GAME_OVER, text);
}

// --------------------------------------------------------------------------- //
// The high score table
// --------------------------------------------------------------------------- //

/**
 * One row of the table: `SSSS000 III` - four score digits with leading zeros
 * blanked, the literal `000 ` string, then the three initials
 * (BZONE.MAC.txt:54c6-54e8).
 */
export function highScoreRowText(entry: HighScoreEntry): string {
  return `${scoreDigits(entry.score)}${THOUSANDS.text}${entry.initials}`;
}

/**
 * How many tank icons a score earns: one per 100,000 points, capped at
 * `HIGH_SCORE_MAX_TANK_ICONS`.
 *
 * This is the rev 1 behaviour, the only difference between the two ROM revisions
 * (docs/reference/original-game.md section 4); rev 2 draws exactly one icon for
 * any score over 100,000.  `atari-source-notes.md` reads the loop as one icon per
 * *1000* points, which cannot be right: the default table's 5000s would each carry
 * five icons, and ten icons do not fit on a line - the same note that only about
 * five fit is what pins this to the 100,000 reading.
 */
function tankIcons(score: number): number {
  return Math.min(Math.floor(score / SUPER_BONUS_SCORE), HIGH_SCORE_MAX_TANK_ICONS);
}

/** Where row `row` starts: each line is staggered four units further left. */
export function rowOrigin(row: number): readonly [number, number] {
  return [
    HIGH_SCORE_LINE_X_QUARTERS * MESSAGE_POSITION_SCALE + row * HIGH_SCORE_LINE_X_SLANT,
    (HIGH_SCORE_FIRST_LINE_Y_QUARTERS - row * HIGH_SCORE_LINE_SPACING_QUARTERS) *
      MESSAGE_POSITION_SCALE,
  ];
}

/**
 * `DISTBL`: the heading, the ten rows with their tank icons, and the bonus tank
 * line.  The list stops at the first zero score (BZONE.MAC.txt:54bc), and the
 * bonus line is omitted entirely when the cabinet awards no bonus tank.
 */
export function drawHighScoreTable(
  d: VectorDisplay,
  entries: readonly HighScoreEntry[],
  opts?: { bonusThreshold?: number },
): void {
  drawMessage(d, HIGH_SCORES);

  for (const [row, entry] of entries.entries()) {
    // The ROM's loop stops at the first zero score, so nothing below one shows.
    if (entry.score <= 0) break;

    const [x, y] = rowOrigin(row);
    const width = drawText(d, highScoreRowText(entry), x, y, FULL_SIZE_SCALE, {
      intensity: TEXT_INTENSITY,
    });
    for (let icon = 0; icon < tankIcons(entry.score); icon += 1) {
      drawPicture(
        d,
        LIVES_TANK,
        x + width + icon * HIGH_SCORE_TANK_ICON_ADVANCE,
        y,
        TANK_ICON_INTENSITY,
      );
    }
  }

  const threshold = opts?.bonusThreshold ?? 0;
  if (threshold <= 0) return;
  const digits = String(Math.floor(threshold / SCORE_UNIT));
  drawMessage(d, BONUS_TANK, `${BONUS_TANK.text}${digits}${BONUS_TANK_END.text}`);
}

// --------------------------------------------------------------------------- //
// Initials entry
// --------------------------------------------------------------------------- //

/**
 * `HISCRE`: the four prompt lines and the three characters being entered, drawn
 * 18 quarter-units left of and below centre (BZONE.MAC.txt:1679-1815).  The
 * positions not yet reached carry the underline glyph, which is the cursor - the
 * entry state already holds it, so there is nothing to decide here.
 */
export function drawInitialsEntry(
  d: VectorDisplay,
  entry: { initials: string; cursor: number },
): void {
  for (const line of [GREAT_SCORE, ENTER_INITIALS, CHANGE_LETTER, SELECT_LETTER]) {
    drawMessage(d, line);
  }

  const [x, y] = INITIALS_ENTRY_ORIGIN;
  drawText(d, entry.initials, x, y, FULL_SIZE_SCALE, { intensity: TEXT_INTENSITY });
}
