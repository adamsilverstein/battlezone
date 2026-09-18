import { describe, expect, it } from 'vitest';

import * as constants from '../src/data/constants';
import { CELL_ADVANCE, CELL_HEIGHT, CELL_WIDTH, CHAR_CODES, FONT } from '../src/data/font';
import {
  DOT_MODEL_NAMES,
  MISSILE_DEBRIS,
  MODELS,
  TANK_DEBRIS,
  TREAD_FRAMES,
} from '../src/data/models';
import {
  MOUNTAIN_RANGE,
  MOUNTAIN_SEGMENTS,
  SEGMENT_COUNT,
  SEGMENT_WIDTH,
  WRAP_WIDTH,
  rangeToScreenX,
} from '../src/data/mountains';
import {
  MESSAGES,
  PICTURES,
  RETICLE_LOCKED,
  RETICLE_NORMAL,
  SCREEN_CRACK_GROUPS,
} from '../src/data/pictures';

describe('models', () => {
  it('has every object the game draws', () => {
    for (const name of [
      'pyramid',
      'pyramidWide',
      'box',
      'boxShort',
      'tank',
      'supertank',
      'missile',
      'saucer',
      'shell',
      'radarDish',
      'logoBA',
      'logoTTLE',
      'logoZONE',
      'debrisHull',
      'debrisPiece1',
      'debrisPiece2',
      'debrisPiece3',
      'debrisPiece4',
    ]) {
      expect(MODELS, name).toHaveProperty(name);
    }
    // 26 line models + 8 dot-only exhaust puffs.
    expect(Object.keys(MODELS)).toHaveLength(34);
  });

  it('gives every model at least four vertices', () => {
    for (const [name, model] of Object.entries(MODELS)) {
      expect(model.vertices.length, name).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps every edge index in range and non-degenerate', () => {
    for (const [name, model] of Object.entries(MODELS)) {
      for (const [a, b] of model.edges) {
        expect(a, `${name} edge start`).toBeGreaterThanOrEqual(0);
        expect(b, `${name} edge end`).toBeGreaterThanOrEqual(0);
        expect(a, `${name} edge start`).toBeLessThan(model.vertices.length);
        expect(b, `${name} edge end`).toBeLessThan(model.vertices.length);
        expect(a, `${name} self-edge`).not.toBe(b);
      }
    }
  });

  it('gives every model integer coordinates and a matching name', () => {
    for (const [key, model] of Object.entries(MODELS)) {
      expect(model.name).toBe(key);
      for (const v of model.vertices) {
        expect(v).toHaveLength(3);
        for (const c of v) {
          expect(Number.isInteger(c)).toBe(true);
        }
      }
    }
  });

  it('only leaves the dot-only models without edges', () => {
    for (const [name, model] of Object.entries(MODELS)) {
      if (DOT_MODEL_NAMES.includes(name)) {
        expect(model.edges, name).toHaveLength(0);
      } else {
        expect(model.edges.length, name).toBeGreaterThan(0);
      }
    }
    expect(DOT_MODEL_NAMES).toHaveLength(8);
  });

  it('rests the obstacles and tank on the same ground plane', () => {
    for (const name of ['pyramid', 'pyramidWide', 'box', 'boxShort', 'tank', 'supertank']) {
      const model = MODELS[name];
      expect(model, name).toBeDefined();
      const lowest = Math.min(...model!.vertices.map((v) => v[2]));
      expect(lowest, name).toBe(-320);
    }
  });

  it('names debris and tread frames that exist', () => {
    for (const name of [
      ...TANK_DEBRIS,
      ...MISSILE_DEBRIS,
      ...TREAD_FRAMES.rear,
      ...TREAD_FRAMES.front,
    ]) {
      expect(MODELS, name).toHaveProperty(name);
    }
    expect(TANK_DEBRIS).toHaveLength(6);
    expect(MISSILE_DEBRIS).toHaveLength(6);
  });
});

describe('font', () => {
  it('has every letter and digit', () => {
    for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c += 1) {
      expect(FONT, String.fromCharCode(c)).toHaveProperty(String.fromCharCode(c));
    }
    for (let d = 0; d <= 9; d += 1) {
      expect(FONT, String(d)).toHaveProperty(String(d));
    }
    expect(FONT).toHaveProperty(' ');
    expect(FONT).toHaveProperty('_');
    // 26 letters + 10 digits + space + underline.
    expect(Object.keys(FONT)).toHaveLength(38);
  });

  it('keeps every glyph inside its cell and advances uniformly', () => {
    for (const [ch, glyph] of Object.entries(FONT)) {
      expect(glyph.advance, ch).toBe(CELL_ADVANCE);
      for (const line of glyph.polylines) {
        expect(line.length, ch).toBeGreaterThanOrEqual(2);
        for (const [x, y] of line) {
          expect(x, `${ch} x`).toBeGreaterThanOrEqual(0);
          expect(x, `${ch} x`).toBeLessThanOrEqual(CELL_WIDTH);
          expect(y, `${ch} y`).toBeGreaterThanOrEqual(0);
          expect(y, `${ch} y`).toBeLessThanOrEqual(CELL_HEIGHT);
        }
      }
    }
  });

  it('draws something for every glyph except the space', () => {
    for (const [ch, glyph] of Object.entries(FONT)) {
      if (ch === ' ') {
        expect(glyph.polylines).toHaveLength(0);
      } else {
        expect(glyph.polylines.length, ch).toBeGreaterThan(0);
      }
    }
  });

  it('maps the original message bytes back to characters', () => {
    expect(CHAR_CODES[0x00]).toBe(' ');
    expect(CHAR_CODES[0x16]).toBe('A');
    expect(CHAR_CODES[0x48]).toBe('Z');
    expect(CHAR_CODES[0x02]).toBe('0');
    expect(CHAR_CODES[0x14]).toBe('9');
    expect(CHAR_CODES[0x4c]).toBe('_');
  });

  it("shares the '0'/'O' and '5'/'S' glyphs, as the ROM does", () => {
    expect(FONT['0']!.polylines).toEqual(FONT['O']!.polylines);
    expect(FONT['5']!.polylines).toEqual(FONT['S']!.polylines);
  });
});

describe('mountains', () => {
  it('has a non-empty polyline for every segment', () => {
    expect(MOUNTAIN_SEGMENTS).toHaveLength(SEGMENT_COUNT);
    for (const seg of MOUNTAIN_SEGMENTS) {
      expect(seg.polylines.length, seg.name).toBeGreaterThan(0);
      for (const line of seg.polylines) {
        expect(line.length, seg.name).toBeGreaterThanOrEqual(2);
      }
    }
    expect(MOUNTAIN_RANGE.polylines.length).toBeGreaterThan(0);
  });

  it('keeps every segment inside its 512-unit slot and above the horizon', () => {
    for (const seg of MOUNTAIN_SEGMENTS) {
      for (const line of seg.polylines) {
        for (const [x, y] of line) {
          expect(x, seg.name).toBeGreaterThanOrEqual(0);
          expect(x, seg.name).toBeLessThanOrEqual(SEGMENT_WIDTH);
          expect(y, seg.name).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('lays the whole range out across the wrap width', () => {
    const xs = MOUNTAIN_RANGE.polylines.flat().map(([x]) => x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(WRAP_WIDTH);
  });

  it('wraps the range-to-screen mapping', () => {
    // The moon sits at range coordinate ~480 and is centred at heading 0.
    expect(rangeToScreenX(480, 0)).toBe(-32);
    expect(rangeToScreenX(480, 256)).toBe(224);
    // The volcano crater sits at range ~3064 and is centred at TANGLE 0x60,
    // i.e. heading12 = 0x600.
    expect(Math.abs(rangeToScreenX(3064, 0x600))).toBeLessThan(16);
    // Half a turn away must be off screen.
    expect(Math.abs(rangeToScreenX(480, 2048))).toBeGreaterThan(1024);
  });
});

describe('pictures', () => {
  it('has both reticle states', () => {
    expect(RETICLE_NORMAL.polylines.length).toBeGreaterThan(0);
    expect(RETICLE_LOCKED.polylines.length).toBeGreaterThan(0);
    expect(RETICLE_NORMAL.polylines).not.toEqual(RETICLE_LOCKED.polylines);
  });

  it('has the eight accumulating screen-crack groups', () => {
    expect(SCREEN_CRACK_GROUPS).toHaveLength(constants.CRACK_GROUPS);
    for (const group of SCREEN_CRACK_GROUPS) {
      expect(group.polylines.length, group.name).toBeGreaterThan(0);
    }
  });

  it('has the radar, horizon, lives icon and copyright marks', () => {
    for (const name of [
      'radar',
      'horizon',
      'livesTank',
      'copyright',
      'phonogram',
      'explosionDots',
      'screenCrackFull',
    ]) {
      expect(PICTURES, name).toHaveProperty(name);
      expect(PICTURES[name]!.polylines.length, name).toBeGreaterThan(0);
    }
  });

  it('gives every picture integer coordinates', () => {
    const all = [...Object.values(PICTURES), ...SCREEN_CRACK_GROUPS, ...MOUNTAIN_SEGMENTS];
    for (const pic of all) {
      for (const line of pic.polylines) {
        for (const point of line) {
          expect(point).toHaveLength(2);
          expect(Number.isInteger(point[0]), pic.name).toBe(true);
          expect(Number.isInteger(point[1]), pic.name).toBe(true);
        }
      }
    }
  });

  it('carries the 24 English messages with their positions', () => {
    expect(MESSAGES).toHaveLength(24);
    const byLabel = new Map(MESSAGES.map((m) => [m.label, m]));
    expect(byLabel.get('ERANGE')?.text).toBe('ENEMY IN RANGE');
    expect(byLabel.get('GAMOVR')?.text).toBe('GAME OVER');
    expect(byLabel.get('PRSTRT')?.text).toBe('PRESS START');
    expect(byLabel.get('HISCOR')?.text).toBe('HIGH SCORES');
    expect(byLabel.get('BONPLN')?.text).toBe('BONUS TANK AT ');
    expect(byLabel.get('LINE2')?.text).toBe('ENTER YOUR INITIALS');
    for (const m of MESSAGES) {
      expect(Number.isInteger(m.x), m.label).toBe(true);
      expect(Number.isInteger(m.y), m.label).toBe(true);
      expect(m.text.length, m.label).toBeGreaterThan(0);
    }
  });
});

describe('constants', () => {
  it('exports numbers for every scalar constant', () => {
    const scalars = [
      'NMI_HZ',
      'NMI_PER_TICK',
      'TICK_HZ',
      'TICK_SECONDS',
      'NMI_PER_REFRESH',
      'REFRESH_HZ',
      'SOUND_FRAME_HZ',
      'SCORE_SLOW_TANK',
      'SCORE_MISSILE',
      'SCORE_SUPERTANK',
      'SCORE_SAUCER',
      'SUPER_BONUS_SCORE',
      'SHELL_LIFE_STEPS',
      'SHELL_RANGE_UNITS',
      'MOVE_STEP_UNITS',
      'PLAYER_MOVE_STEP_UNITS',
      'PLAYER_SPEED_MULTIPLIER',
      'PLAYER_SPEED_UNITS_PER_SEC',
      'TURN_STEP_DEGREES',
      'RADAR_SWEEP_PER_TICK',
      'RADAR_SWEEP_PERIOD_SECONDS',
      'ENEMY_IN_RANGE_UNITS',
      'ENEMY_SPAWN_NEAR_UNITS',
      'ENEMY_SPAWN_FAR_UNITS',
      'ENEMY_SPAWN_HEADING_SCATTER',
      'ROM_ENEMY_SPAWN_NEAR_UNITS',
      'ENEMY_FIRE_GRACE_TICKS',
      'ROM_ENEMY_FIRE_GRACE_TICKS',
      'ROOKIE_FIRE_MAX_SCORE',
      'ROM_ROOKIE_FIRE_MAX_SCORE',
      'WORLD_SIZE',
      'OBSTACLE_COUNT',
      'HSCNUM',
      'DEFAULT_HIGH_SCORE',
      'NEAR_CLIP_UNITS',
      'FAR_CLIP_UNITS',
      'ROM_FAR_CLIP_UNITS',
      'HALF_FOV_DEGREES',
      'SCREEN_SCALE',
      'CRACK_GROUPS',
      'DEATH_SEQUENCE_TICKS',
      'GRAVITY_PER_TICK',
      'ATTRACT_PHASE_TICKS',
      'PLAYERS',
    ] as const;
    for (const key of scalars) {
      expect(typeof constants[key], key).toBe('number');
      expect(Number.isFinite(constants[key] as number), key).toBe(true);
    }
  });

  it('keeps the eased difficulty numbers tied to what they are derived from', () => {
    // ENEMY_SPAWN_NEAR_UNITS is spelled out rather than divided, because
    // ENEMY_IN_RANGE_UNITS is declared below it and would be in the temporal dead
    // zone.  This is what stops the two drifting apart silently.
    expect(constants.ENEMY_SPAWN_NEAR_UNITS).toBe(constants.ENEMY_IN_RANGE_UNITS / 2);
    // The firing grace is quoted in seconds in the README; keep it honest.
    expect(constants.ENEMY_FIRE_GRACE_TICKS / constants.TICK_HZ).toBeGreaterThanOrEqual(3);
    // Each eased number has to actually ease something.
    expect(constants.ENEMY_SPAWN_NEAR_UNITS).toBeGreaterThan(constants.ROM_ENEMY_SPAWN_NEAR_UNITS);
    expect(constants.ENEMY_FIRE_GRACE_TICKS).toBeGreaterThan(constants.ROM_ENEMY_FIRE_GRACE_TICKS);
    expect(constants.ROOKIE_FIRE_MAX_SCORE).toBeGreaterThan(constants.ROM_ROOKIE_FIRE_MAX_SCORE);
    // The scatter has to clear the window FIREIT will fire from, or it buys nothing.
    expect(constants.ENEMY_SPAWN_HEADING_SCATTER).toBeGreaterThan(
      constants.ENEMY_FIRE_ANGLE_TOLERANCE,
    );
  });

  it('records the timing the original runs at', () => {
    expect(constants.TICK_HZ).toBe(15.625);
    expect(constants.NMI_HZ / constants.NMI_PER_TICK).toBe(constants.TICK_HZ);
    expect(constants.REFRESH_HZ).toBeCloseTo(41.667, 3);
  });

  it('describes the 21 fixed obstacles', () => {
    expect(constants.OBSTACLES).toHaveLength(21);
    expect(constants.OBSTACLE_COUNT).toBe(21);
    for (const obstacle of constants.OBSTACLES) {
      expect(MODELS, obstacle.model).toHaveProperty(obstacle.model);
      expect(obstacle.x).toBeGreaterThanOrEqual(0);
      expect(obstacle.x).toBeLessThan(constants.WORLD_SIZE);
      expect(obstacle.y).toBeGreaterThanOrEqual(0);
      expect(obstacle.y).toBeLessThan(constants.WORLD_SIZE);
      expect(obstacle.orientation).toBeGreaterThanOrEqual(0);
      expect(obstacle.orientation).toBeLessThan(256);
    }
  });

  it('has ten default high score initials', () => {
    expect(constants.DEFAULT_INITIALS).toHaveLength(constants.HSCNUM);
    for (const initials of constants.DEFAULT_INITIALS) {
      expect(initials).toHaveLength(3);
      for (const ch of initials) {
        expect(FONT, ch).toHaveProperty(ch);
      }
    }
  });

  it('has four options for each of the DIP-selected tables', () => {
    expect(constants.BONUS_TABLE_BCD).toHaveLength(4);
    expect(constants.BONUS_THRESHOLDS).toHaveLength(4);
    expect(constants.MISSILE_LEVEL_BCD).toHaveLength(4);
    expect(constants.MISSILE_THRESHOLDS).toHaveLength(4);
    expect(constants.LIVES_OPTIONS).toHaveLength(4);
    expect(constants.LANGUAGES).toHaveLength(4);
  });

  it('has a complete sound table for all eight sounds', () => {
    expect(constants.SOUND_TABLES).toHaveLength(8);
    for (const table of constants.SOUND_TABLES) {
      expect(table.channels).toHaveLength(4);
      expect(table.bit).toBeGreaterThan(0);
      const active = table.channels.filter((c) => c !== null);
      expect(active.length, table.name).toBeGreaterThan(0);
      for (const channel of active) {
        for (const s of channel!) {
          expect(Number.isInteger(s.start)).toBe(true);
          expect(Number.isInteger(s.frames)).toBe(true);
          expect(Number.isInteger(s.delta)).toBe(true);
          expect(s.steps).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives a collision radius for every obstacle model', () => {
    for (const model of ['pyramid', 'box', 'pyramidWide', 'boxShort']) {
      expect(constants.OBSTACLE_TANK_RADIUS, model).toHaveProperty(model);
      expect(constants.SHELL_OBSTACLE_RADIUS_QUARTERS, model).toHaveProperty(model);
    }
  });
});
