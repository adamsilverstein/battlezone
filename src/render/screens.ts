/**
 * The full-screen displays that stand in for the battlefield: the attract title
 * with its flying logo, the high score table, the initials entry screen and the
 * GAME OVER line - plus the ROM string table helpers they share with the HUD.
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
 * DEVIATION: the ROM's letter shapes are pre-tilted about 83 degrees so that its
 * own perspective divide stands them up, and reproducing that needs the exact eye
 * geometry `BATTLE` fed the MathBox, which the surviving source does not pin down
 * (`ROTATE` is handed a group centre, not a camera).  Projecting the shapes as
 * stored puts the letters nearly flat on the ground.  So the tilt is undone here
 * instead: each letter's "forward" coordinate is read as its height and the "up"
 * component dropped, and the group is then projected as a rigid upright sign at
 * the ROM's own depth and height.  The letters keep their proportions, rise, shrink
 * and arrive in sequence, which is what the effect looks like.
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
  LOGO_ZONE_HELD_UNTIL,
  LOGO_Z_PER_TICK,
  PRESS_START_FLASH_TICKS,
  SCORE_BCD_BYTES,
  SCORE_UNIT,
  SCREEN_SCALE,
  SUPER_BONUS_SCORE,
} from '../data/constants';
import { CELL_ADVANCE } from '../data/font';
import { MODELS } from '../data/models';
import { COPYRIGHT, LIVES_TANK, MESSAGES, PHONOGRAM, type MessageEntry } from '../data/pictures';
import type { Picture2D, WireModel } from '../data/types';
import type { HighScoreEntry } from '../game/types';
import { drawText } from './text';
import type { VectorDisplay } from './vectorDisplay';

/** Message positions are stored in quarter units (`MessageEntry`). */
export const MESSAGE_POSITION_SCALE = 4;

/** Text is drawn at intensity 12 (reference section 6). */
export const TEXT_INTENSITY = 12 / INTENSITY_MAX;

/**
 * Strings up to index `$12` are drawn at the ROM's SCAL 2, half the size of the
 * rest (`DrawStringPtr`, reference section 6).
 */
const HALF_SIZE_LAST_INDEX = 0x12;
const FULL_SIZE_SCALE = 1;
const HALF_SIZE_SCALE = 0.5;

const MESSAGES_BY_LABEL = new Map(MESSAGES.map((m) => [m.label, m]));

/** One entry of the ROM string table, by the label the disassembly gives it. */
export function message(label: string): MessageEntry {
  const entry = MESSAGES_BY_LABEL.get(label);
  if (!entry) throw new Error(`screens: no message labelled ${label}`);
  return entry;
}

/** The size the ROM draws a string at: half for the low indices, full for the rest. */
export function messageScale(entry: MessageEntry): number {
  return entry.index <= HALF_SIZE_LAST_INDEX ? HALF_SIZE_SCALE : FULL_SIZE_SCALE;
}

/**
 * Draws one ROM string at its stored position and size, with `text` substituted
 * for the ROM's own where the string carries digits.
 */
export function drawMessage(d: VectorDisplay, entry: MessageEntry, text = entry.text): void {
  drawText(
    d,
    text,
    entry.x * MESSAGE_POSITION_SCALE,
    entry.y * MESSAGE_POSITION_SCALE,
    messageScale(entry),
    { intensity: TEXT_INTENSITY },
  );
}

/** Draws a 2D picture with its ROM coordinates offset to (dx, dy). */
export function drawPicture(
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

/**
 * One logo vertex on screen.  ROM vertices are [forward, left, up]; for the logo
 * the forward component is the letter's own height (see the deviation note above),
 * so the sign is drawn upright and projected by the same `SCREEN_SCALE / depth`
 * divide as everything else.
 */
function logoPoint(
  vertex: readonly [number, number, number],
  depth: number,
  height: number,
): readonly [number, number] {
  // vertex[0] is the ROM's "forward", read here as the letter's height, and
  // vertex[2], the remainder of the pre-tilt, is dropped.
  const [letterY, left] = vertex;
  return [(SCREEN_SCALE * -left) / depth, (SCREEN_SCALE * (letterY + height)) / depth];
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

/** Four BCD digits are drawn in front of the literal thousands. */
const SCORE_DIGITS = SCORE_BCD_BYTES * 2;

/**
 * One row of the table: `SSSS000 III` - four score digits with leading zeros
 * blanked, the literal `000 ` string, then the three initials
 * (BZONE.MAC.txt:54c6-54e8).
 */
export function highScoreRowText(entry: HighScoreEntry): string {
  const units = Math.min(Math.floor(entry.score / SCORE_UNIT), 10 ** SCORE_DIGITS - 1);
  const digits = (units === 0 ? '' : String(units)).padStart(SCORE_DIGITS, ' ');
  return `${digits}${THOUSANDS.text}${entry.initials}`;
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
function rowOrigin(row: number): readonly [number, number] {
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
