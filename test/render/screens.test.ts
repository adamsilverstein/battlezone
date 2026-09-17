import { describe, expect, it } from 'vitest';
import {
  GAME_OVER_TICKS,
  HIGH_SCORE_FIRST_LINE_Y_QUARTERS,
  HIGH_SCORE_LINE_SPACING_QUARTERS,
  HIGH_SCORE_LINE_X_QUARTERS,
  HIGH_SCORE_LINE_X_SLANT,
  HIGH_SCORE_MAX_TANK_ICONS,
  HIGH_SCORE_TANK_ICON_ADVANCE,
  HSCNUM,
  INITIALS_ENTRY_ORIGIN,
  LOGO_TICKS,
  PRESS_START_FLASH_TICKS,
  SUPER_BONUS_SCORE,
} from '../../src/data/constants';
import { CELL_ADVANCE } from '../../src/data/font';
import { LIVES_TANK, MESSAGES } from '../../src/data/pictures';
import { defaultHighScores, newInitialsEntry } from '../../src/game/highScores';
import type { HighScoreEntry } from '../../src/game/types';
import {
  MESSAGE_POSITION_SCALE,
  drawGameOver,
  drawHighScoreTable,
  drawInitialsEntry,
  drawPressStart,
  drawTitle,
  highScoreRowText,
} from '../../src/render/screens';
import { drawText } from '../../src/render/text';
import { createRecordingDisplay, type RecordedLine } from '../../src/render/vectorDisplay';

const message = (label: string) => MESSAGES.find((m) => m.label === label)!;

/** Characters in a table row: `SSSS000 III`. */
const ROW_LENGTH = 11;

/** Every line `drawText` would emit for a string at a message's own position. */
function textLines(text: string, x: number, y: number, scale: number): RecordedLine[] {
  const d = createRecordingDisplay();
  drawText(d, text, x, y, scale, { intensity: 12 / 15 });
  return d.lines;
}

/** Whether `lines` contains the whole of `wanted`, in order, somewhere. */
function contains(lines: RecordedLine[], wanted: RecordedLine[]): boolean {
  if (wanted.length === 0) return true;
  const key = (l: RecordedLine): string => `${l.x0},${l.y0},${l.x1},${l.y1}`;
  const haystack = lines.map(key).join('|');
  return haystack.includes(wanted.map(key).join('|'));
}

function record(draw: (d: ReturnType<typeof createRecordingDisplay>) => void): RecordedLine[] {
  const d = createRecordingDisplay();
  draw(d);
  return d.lines;
}

describe('drawTitle', () => {
  it('draws the logo letters', () => {
    expect(record((d) => drawTitle(d, 30)).length).toBeGreaterThan(20);
  });

  it('holds ZONE back until the group has risen far enough', () => {
    const early = record((d) => drawTitle(d, 0));
    const late = record((d) => drawTitle(d, LOGO_TICKS - 1));

    expect(late.length).toBeGreaterThan(early.length);
  });

  it('shrinks the letters as the logo recedes', () => {
    const spread = (lines: RecordedLine[]): number =>
      Math.max(...lines.map((l) => Math.abs(l.x0))) - Math.min(...lines.map((l) => Math.abs(l.x0)));

    expect(spread(record((d) => drawTitle(d, LOGO_TICKS - 1)))).toBeLessThan(
      spread(record((d) => drawTitle(d, LOGO_TICKS / 2))),
    );
  });

  it('draws the letters at the ROM full brightness', () => {
    expect(record((d) => drawTitle(d, 30)).every((l) => l.intensity === 1)).toBe(true);
  });
});

describe('drawPressStart', () => {
  it('flashes the ROM string on and off', () => {
    const entry = message('PRSTRT');
    const lit = textLines(
      entry.text,
      entry.x * MESSAGE_POSITION_SCALE,
      entry.y * MESSAGE_POSITION_SCALE,
      1,
    );

    expect(
      contains(
        record((d) => drawPressStart(d, 0)),
        lit,
      ),
    ).toBe(true);
    expect(record((d) => drawPressStart(d, PRESS_START_FLASH_TICKS))).toHaveLength(0);
    expect(record((d) => drawPressStart(d, 2 * PRESS_START_FLASH_TICKS)).length).toBeGreaterThan(0);
  });
});

describe('drawGameOver', () => {
  it('draws the ROM string steadily, at its own position', () => {
    const entry = message('GAMOVR');
    const lit = textLines(
      entry.text,
      entry.x * MESSAGE_POSITION_SCALE,
      entry.y * MESSAGE_POSITION_SCALE,
      1,
    );

    expect(
      contains(
        record((d) => drawGameOver(d)),
        lit,
      ),
    ).toBe(true);
    expect(record((d) => drawGameOver(d))).toEqual(record((d) => drawGameOver(d)));
    expect(GAME_OVER_TICKS).toBeGreaterThan(0);
  });
});

describe('highScoreRowText', () => {
  it('is four score digits, the literal thousands, then the initials', () => {
    expect(highScoreRowText({ initials: 'EDR', score: 5000 })).toBe('   5000 EDR');
    expect(highScoreRowText({ initials: 'ADS', score: 123000 })).toBe(' 123000 ADS');
    expect(highScoreRowText({ initials: 'EL ', score: 5000 })).toBe('   5000 EL ');
  });
});

describe('drawHighScoreTable', () => {
  const table = defaultHighScores();

  it('draws the HIGH SCORES heading', () => {
    const entry = message('HISCOR');
    const lit = textLines(
      entry.text,
      entry.x * MESSAGE_POSITION_SCALE,
      entry.y * MESSAGE_POSITION_SCALE,
      1,
    );

    expect(
      contains(
        record((d) => drawHighScoreTable(d, table)),
        lit,
      ),
    ).toBe(true);
  });

  it('draws every row at its slanted place', () => {
    const lines = record((d) => drawHighScoreTable(d, table));

    table.forEach((entry, row) => {
      const x = HIGH_SCORE_LINE_X_QUARTERS * MESSAGE_POSITION_SCALE + row * HIGH_SCORE_LINE_X_SLANT;
      const y =
        (HIGH_SCORE_FIRST_LINE_Y_QUARTERS - row * HIGH_SCORE_LINE_SPACING_QUARTERS) *
        MESSAGE_POSITION_SCALE;
      expect(contains(lines, textLines(highScoreRowText(entry), x, y, 1)), `row ${row}`).toBe(true);
    });
  });

  it('stops at the first zero score, as DISTBL does', () => {
    const short: HighScoreEntry[] = [
      { initials: 'ADS', score: 9000 },
      { initials: '   ', score: 0 },
      { initials: 'XYZ', score: 8000 },
    ];
    const lines = record((d) => drawHighScoreTable(d, short));

    expect(contains(lines, textLines(highScoreRowText(short[2]!), -128, 0, 1))).toBe(false);
  });

  it('adds one tank icon per 100,000 points, up to the cap', () => {
    /** The icon picture as it would be recorded in slot `icon` of the first row. */
    const iconLines = (icon: number): RecordedLine[] => {
      const d = createRecordingDisplay();
      const x =
        HIGH_SCORE_LINE_X_QUARTERS * MESSAGE_POSITION_SCALE +
        ROW_LENGTH * CELL_ADVANCE +
        icon * HIGH_SCORE_TANK_ICON_ADVANCE;
      const y = HIGH_SCORE_FIRST_LINE_Y_QUARTERS * MESSAGE_POSITION_SCALE;
      for (const stroke of LIVES_TANK.polylines) {
        d.polyline(stroke.map(([sx, sy]) => [sx + x, sy + y] as const));
      }
      return d.lines;
    };
    const table = (score: number): RecordedLine[] =>
      record((d) => drawHighScoreTable(d, [{ initials: 'ADS', score }]));

    expect(contains(table(99000), iconLines(0))).toBe(false);
    expect(contains(table(SUPER_BONUS_SCORE), iconLines(0))).toBe(true);
    expect(contains(table(SUPER_BONUS_SCORE), iconLines(1))).toBe(false);
    expect(contains(table(2 * SUPER_BONUS_SCORE), iconLines(1))).toBe(true);

    const over = table((HIGH_SCORE_MAX_TANK_ICONS + 5) * SUPER_BONUS_SCORE);
    expect(contains(over, iconLines(HIGH_SCORE_MAX_TANK_ICONS - 1))).toBe(true);
    expect(contains(over, iconLines(HIGH_SCORE_MAX_TANK_ICONS))).toBe(false);
  });

  it('spells out the bonus tank line under the table', () => {
    const entry = message('BONPLN');
    const lines = record((d) => drawHighScoreTable(d, table, { bonusThreshold: 15000 }));
    const lit = textLines(
      'BONUS TANK AT 15000 AND 100000',
      entry.x * MESSAGE_POSITION_SCALE,
      entry.y * MESSAGE_POSITION_SCALE,
      1,
    );

    expect(contains(lines, lit)).toBe(true);
  });

  it('leaves the bonus line out when the cabinet awards no bonus tank', () => {
    const with0 = record((d) => drawHighScoreTable(d, table, { bonusThreshold: 0 }));
    const plain = record((d) => drawHighScoreTable(d, table, { bonusThreshold: 15000 }));

    expect(with0.length).toBeLessThan(plain.length);
  });

  it('draws all ten rows of a full table', () => {
    const rows = (lines: RecordedLine[]): number =>
      table.filter((entry, row) =>
        contains(
          lines,
          textLines(
            highScoreRowText(entry),
            HIGH_SCORE_LINE_X_QUARTERS * MESSAGE_POSITION_SCALE + row * HIGH_SCORE_LINE_X_SLANT,
            (HIGH_SCORE_FIRST_LINE_Y_QUARTERS - row * HIGH_SCORE_LINE_SPACING_QUARTERS) *
              MESSAGE_POSITION_SCALE,
            1,
          ),
        ),
      ).length;

    expect(rows(record((d) => drawHighScoreTable(d, table)))).toBe(HSCNUM);
  });
});

describe('drawInitialsEntry', () => {
  it('draws the prompts and the three characters at the ROM position', () => {
    const lines = record((d) => drawInitialsEntry(d, newInitialsEntry()));
    const [x, y] = INITIALS_ENTRY_ORIGIN;

    for (const label of ['LINE1', 'LINE2', 'LINE3', 'LINE4']) {
      const entry = message(label);
      const scale = entry.index <= 0x12 ? 0.5 : 1;
      const lit = textLines(
        entry.text,
        entry.x * MESSAGE_POSITION_SCALE,
        entry.y * MESSAGE_POSITION_SCALE,
        scale,
      );
      expect(contains(lines, lit), label).toBe(true);
    }

    expect(contains(lines, textLines('A__', x, y, 1))).toBe(true);
  });

  it('shows the letters already chosen and the cursor under the rest', () => {
    const lines = record((d) => drawInitialsEntry(d, { initials: 'AD_', cursor: 1 }));
    const [x, y] = INITIALS_ENTRY_ORIGIN;

    expect(contains(lines, textLines('AD_', x, y, 1))).toBe(true);
  });
});
