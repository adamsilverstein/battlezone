import { describe, expect, it } from 'vitest';
import {
  ENEMY_IN_RANGE_UNITS,
  INTENSITY_MAX,
  LIVES_ICON_ORIGIN,
  LIVES_ICON_SPACING,
  MESSAGE_FLASH_MASK,
  RADAR_BLIP_BRIGHTNESS,
  RADAR_BLIP_DECAY,
  RADAR_CENTRE,
  RADAR_ENEMY_SHELL_INTENSITY,
  RADAR_PLAYER_SHELL_INTENSITY,
  RADAR_RADIUS,
  RETICLE_BLINK_TICKS,
  SCREEN_HALF_HEIGHT,
  SCREEN_HALF_WIDTH,
} from '../../src/data/constants';
import { LIVES_TANK, RADAR, RETICLE_LOCKED, RETICLE_NORMAL } from '../../src/data/pictures';
import type { Picture2D } from '../../src/data/types';
import { TAU } from '../../src/engine/math';
import type { Enemy, Shell, World } from '../../src/game/types';
import { createAttractWorld } from '../../src/game/world';
import {
  createRadarBlips,
  drawHud,
  drawRadar,
  drawReticle,
  type RadarBlips,
} from '../../src/render/hud';
import { drawText } from '../../src/render/text';
import {
  createRecordingDisplay,
  type RecordedLine,
  type VectorDisplay,
} from '../../src/render/vectorDisplay';

const [CX, CY] = RADAR_CENTRE;
const TEXT_INTENSITY = 12 / INTENSITY_MAX;
const INTENSITY_BYTE_MAX = 0xff;

function record(draw: (d: VectorDisplay) => void): RecordedLine[] {
  const d = createRecordingDisplay();
  d.beginFrame();
  draw(d);
  d.endFrame();
  return d.lines;
}

/**
 * The blip levels a world produces on its own: the renderer advances them once
 * per simulated tick, so one advance is one tick of this world's radar sweep.
 */
function blipsFor(world: World, ticks = 1): RadarBlips {
  const blips = createRadarBlips();
  for (let i = 0; i < ticks; i += 1) blips.advance(world);
  return blips;
}

/** The radar as the renderer draws it: this world, and the blips it just produced. */
function radar(world: World, blips: RadarBlips = blipsFor(world)): RecordedLine[] {
  return record((d) => drawRadar(d, world, blips));
}

const keys = (lines: readonly RecordedLine[]): string[] =>
  lines.map((l) => `${l.x0},${l.y0},${l.x1},${l.y1}`).sort();

/** A picture's segments as comparable keys, optionally shifted on screen. */
function pictureKeys(picture: Picture2D, dx = 0, dy = 0): string[] {
  const out: string[] = [];
  for (const stroke of picture.polylines) {
    for (let i = 1; i < stroke.length; i += 1) {
      const [x0, y0] = stroke[i - 1]!;
      const [x1, y1] = stroke[i]!;
      out.push(`${x0 + dx},${y0 + dy},${x1 + dx},${y1 + dy}`);
    }
  }
  return out.sort();
}

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

const dots = (lines: readonly RecordedLine[]): RecordedLine[] =>
  lines.filter((l) => l.x0 === l.x1 && l.y0 === l.y1);

/** A battlefield with nothing on it but what a test puts there. */
function worldWith(parts: Partial<World>): World {
  return { ...createAttractWorld(), obstacles: [], ...parts };
}

function tankAt(x: number, z: number, parts: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: 'tank',
    pos: { x, z },
    heading: 0,
    y: 0,
    alive: true,
    state: 'chase',
    timer: 0,
    ...parts,
  };
}

const playerShell: Shell = {
  id: 2,
  owner: 'player',
  pos: { x: 0, z: 1000 },
  y: 0,
  heading: 0,
  ticksLeft: 20,
};

const HUD_OPTS = {
  showReticle: true,
  blinkTick: 0,
  highScore: 0,
  showRadar: true,
  showAlert: true,
  blips: createRadarBlips(),
};

describe('drawRadar', () => {
  it('draws the ROM tick marks and wedge, and no circle', () => {
    const lines = radar(worldWith({}));
    for (const segment of pictureKeys(RADAR)) expect(keys(lines)).toContain(segment);
    // Four 8-unit ticks, a two-stroke wedge and the sweep line: no arc segments.
    expect(lines).toHaveLength(pictureKeys(RADAR).length + 1);
  });

  it('draws the tick marks brighter than the view wedge', () => {
    const lines = radar(worldWith({}));
    const tick = lines.find((l) => l.x0 === 68 && l.y0 === CY)!;
    const wedge = lines.find((l) => l.x1 === -36 && l.y1 === 368)!;
    expect(tick.intensity).toBeCloseTo(14 / INTENSITY_MAX, 6);
    expect(wedge.intensity).toBeCloseTo(10 / INTENSITY_MAX, 6);
  });

  it('draws the sweep line from the centre at the world sweep angle', () => {
    const lines = radar(worldWith({ radarAngle: TAU / 4 }));
    // The one line exactly a radius long out of the centre; the wedge legs
    // reach a little past the rim.
    const sweep = lines.filter(
      (l) => l.x0 === CX && l.y0 === CY && round(Math.hypot(l.x1 - CX, l.y1 - CY)) === RADAR_RADIUS,
    );
    expect(sweep).toHaveLength(1);
    expect(round(sweep[0]!.x1)).toBe(round(CX + RADAR_RADIUS));
    expect(round(sweep[0]!.y1)).toBe(round(CY));
  });

  it('puts the blip at the enemy bearing and range, refreshed by the sweep', () => {
    // Dead abeam to the right at half of radar range, with the sweep on it.
    const enemy = tankAt(ENEMY_IN_RANGE_UNITS / 2, 0);
    const world = worldWith({ enemies: [enemy], radarAngle: TAU / 4 });
    const blip = dots(radar(world));
    // Emitted twice, as `DRADAR` does, so the dot comes up bright.
    expect(blip).toHaveLength(2);
    expect(blip[0]).toEqual(blip[1]);
    expect(round(blip[0]!.x0)).toBe(round(CX + RADAR_RADIUS / 2));
    expect(round(blip[0]!.y0)).toBe(round(CY));
    expect(blip[0]!.intensity).toBeCloseTo(RADAR_BLIP_BRIGHTNESS / INTENSITY_BYTE_MAX, 6);
  });

  it('turns the blip with the player, so the wedge stays ahead', () => {
    const enemy = tankAt(0, ENEMY_IN_RANGE_UNITS / 2);
    const player = { ...createAttractWorld().player, heading: TAU / 4 };
    const world = worldWith({ enemies: [enemy], player, radarAngle: -TAU / 4 });
    const blip = dots(radar(world))[0]!;
    // The enemy is dead ahead in world terms but 90 degrees to the player's left.
    expect(round(blip.x0)).toBe(round(CX - RADAR_RADIUS / 2));
    expect(round(blip.y0)).toBe(round(CY));
  });

  it('draws nothing for a blip that has never been lit', () => {
    // The sweep has not been near this enemy, so `BLIP` was never loaded.
    const enemy = tankAt(ENEMY_IN_RANGE_UNITS / 2, 0);
    expect(dots(radar(worldWith({ enemies: [enemy], radarAngle: 0 })))).toHaveLength(0);
  });

  it('draws no blip for an enemy out of radar range', () => {
    const enemy = tankAt(ENEMY_IN_RANGE_UNITS, 0);
    expect(dots(radar(worldWith({ enemies: [enemy] })))).toHaveLength(0);
  });

  it('never shows the saucer on radar', () => {
    const saucer = tankAt(1000, 1000, { kind: 'saucer' });
    expect(dots(radar(worldWith({ enemies: [saucer] })))).toHaveLength(0);
  });

  it('tracks the nearest unit, the one the rest of the game is aiming at', () => {
    // Two units on the field: the alert, the reticle lock and the ping in the
    // simulation all follow the nearest, so the blip has to as well.
    const far = tankAt(0, ENEMY_IN_RANGE_UNITS * 0.75, { id: 1 });
    const near = tankAt(ENEMY_IN_RANGE_UNITS / 4, 0, { id: 2, kind: 'missile' });
    const world = worldWith({ enemies: [far, near], radarAngle: TAU / 4 });
    const blip = dots(radar(world))[0]!;
    expect(round(blip.x0)).toBe(round(CX + RADAR_RADIUS / 4));
    expect(round(blip.y0)).toBe(round(CY));
  });

  it('draws no blip for a dead enemy', () => {
    const enemy = tankAt(1000, 1000, { alive: false });
    expect(dots(radar(worldWith({ enemies: [enemy] })))).toHaveLength(0);
  });
});

describe('drawRadar shells', () => {
  const shellAt = (x: number, z: number, parts: Partial<Shell> = {}): Shell => ({
    ...playerShell,
    pos: { x, z },
    ...parts,
  });

  it('puts a shell at its own bearing and range', () => {
    const shell = shellAt(ENEMY_IN_RANGE_UNITS / 2, 0, { owner: 'enemy' });
    const dot = dots(radar(worldWith({ shells: [shell] })));
    // One pass, not the enemy blip's two: a shell is a lighter mark.
    expect(dot).toHaveLength(1);
    expect(round(dot[0]!.x0)).toBe(round(CX + RADAR_RADIUS / 2));
    expect(round(dot[0]!.y0)).toBe(round(CY));
  });

  it('does not wait for the sweep to come round', () => {
    // A shell lives about two seconds and the sweep takes one and a half, so a
    // sweep-gated dot would be missing exactly when it mattered.  These are
    // drawn from the world every frame and hold no level of their own.
    const shell = shellAt(0, ENEMY_IN_RANGE_UNITS / 2, { owner: 'enemy' });
    const world = worldWith({ shells: [shell], radarAngle: 0 });
    const fresh = record((d) => drawRadar(d, world, createRadarBlips()));
    expect(dots(fresh)).toHaveLength(1);
  });

  it("draws an incoming shell brighter than the player's own", () => {
    const incoming = dots(radar(worldWith({ shells: [shellAt(1000, 0, { owner: 'enemy' })] })));
    const outgoing = dots(radar(worldWith({ shells: [shellAt(1000, 0, { owner: 'player' })] })));
    expect(incoming[0]!.intensity).toBeCloseTo(RADAR_ENEMY_SHELL_INTENSITY / INTENSITY_BYTE_MAX, 6);
    expect(outgoing[0]!.intensity).toBeCloseTo(
      RADAR_PLAYER_SHELL_INTENSITY / INTENSITY_BYTE_MAX,
      6,
    );
    expect(outgoing[0]!.intensity).toBeLessThan(incoming[0]!.intensity);
  });

  it('turns shells with the player, as it turns the enemy blip', () => {
    const shell = shellAt(0, ENEMY_IN_RANGE_UNITS / 2, { owner: 'enemy' });
    const player = { ...createAttractWorld().player, heading: TAU / 4 };
    const dot = dots(radar(worldWith({ shells: [shell], player })))[0]!;
    expect(round(dot.x0)).toBe(round(CX - RADAR_RADIUS / 2));
    expect(round(dot.y0)).toBe(round(CY));
  });

  it('draws nothing for a shell past the rim', () => {
    const shell = shellAt(ENEMY_IN_RANGE_UNITS, 0, { owner: 'enemy' });
    expect(dots(radar(worldWith({ shells: [shell] })))).toHaveLength(0);
  });

  it('draws shells alongside the enemy blip, not instead of it', () => {
    // The enemy blip gives up early in several ways - no unit, out of range, a
    // level that has faded out - and the shells must survive every one of them.
    const enemy = tankAt(ENEMY_IN_RANGE_UNITS / 2, 0);
    const shell = shellAt(-ENEMY_IN_RANGE_UNITS / 4, 0, { owner: 'enemy' });
    const world = worldWith({ enemies: [enemy], shells: [shell], radarAngle: TAU / 4 });
    // Sweep on the enemy: two blip passes plus the one shell dot.
    expect(dots(radar(world))).toHaveLength(3);
    // Sweep nowhere near it, so the enemy blip was never lit: the shell remains.
    const dark = worldWith({ enemies: [enemy], shells: [shell], radarAngle: 0 });
    expect(dots(radar(dark))).toHaveLength(1);
  });

  it('draws every shell in the air', () => {
    const shells = [
      shellAt(1000, 0, { id: 1, owner: 'enemy' }),
      shellAt(-1000, 0, { id: 2, owner: 'enemy' }),
      shellAt(0, 1000, { id: 3, owner: 'player' }),
    ];
    expect(dots(radar(worldWith({ shells })))).toHaveLength(3);
  });
});

describe('createRadarBlips', () => {
  const enemy = tankAt(ENEMY_IN_RANGE_UNITS / 2, 0);
  /** The sweep sitting exactly on that enemy's bearing. */
  const swept = (): World => worldWith({ enemies: [enemy], radarAngle: TAU / 4 });
  /** The sweep well away from it. */
  const elsewhere = (): World => worldWith({ enemies: [enemy], radarAngle: 0 });

  it('lights the blip when the sweep passes and fades it a step a tick', () => {
    const blips = createRadarBlips();
    blips.advance(swept());
    expect(blips.levelFor(enemy.id)).toBe(RADAR_BLIP_BRIGHTNESS);
    for (const step of [1, 2, 3]) {
      blips.advance(elsewhere());
      expect(blips.levelFor(enemy.id)).toBe(RADAR_BLIP_BRIGHTNESS - RADAR_BLIP_DECAY * step);
    }
    // And it goes out rather than going negative.
    for (let i = 0; i < RADAR_BLIP_BRIGHTNESS / RADAR_BLIP_DECAY; i += 1)
      blips.advance(elsewhere());
    expect(blips.levelFor(enemy.id)).toBe(0);
  });

  it('holds the level steady while the player turns', () => {
    // The bearing is measured from the player's heading, so a pivot slides the
    // enemy under the sweep - and a level derived from those angles would jump
    // about while the tank turns. `BLIP` is a byte in RAM and does not.
    const blips = createRadarBlips();
    blips.advance(swept());
    const turned = swept();
    turned.player = { ...turned.player, heading: TAU / 8 };
    blips.advance(turned);
    expect(blips.levelFor(enemy.id)).toBe(RADAR_BLIP_BRIGHTNESS - RADAR_BLIP_DECAY);
  });

  it('forgets the field it was holding when it is reset', () => {
    const blips = createRadarBlips();
    blips.advance(swept());
    blips.reset();
    expect(blips.levelFor(enemy.id)).toBe(0);
  });

  it('draws the held level rather than one derived from the angles', () => {
    const blips = createRadarBlips();
    blips.advance(swept());
    blips.advance(elsewhere());
    // The sweep is on the enemy again, but the held blip has been faded once, so
    // the dot is dimmer than the sweep alone would make it.
    const lines = dots(radar(swept(), blips));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.intensity).toBeCloseTo(
      (RADAR_BLIP_BRIGHTNESS - RADAR_BLIP_DECAY) / INTENSITY_BYTE_MAX,
      6,
    );
  });
});

describe('drawReticle', () => {
  it('draws the plain gunsight at intensity 6', () => {
    const lines = record((d) => drawReticle(d, false));
    expect(keys(lines)).toEqual(pictureKeys(RETICLE_NORMAL));
    expect([...new Set(lines.map((l) => l.intensity))]).toEqual([6 / INTENSITY_MAX]);
  });

  it('flares open and brightens to 14 when locked', () => {
    const lines = record((d) => drawReticle(d, true));
    expect(keys(lines)).toEqual(pictureKeys(RETICLE_LOCKED));
    expect([...new Set(lines.map((l) => l.intensity))]).toEqual([14 / INTENSITY_MAX]);
    expect(keys(lines)).not.toEqual(pictureKeys(RETICLE_NORMAL));
  });
});

describe('drawHud', () => {
  const hud = (world: World, opts: Partial<typeof HUD_OPTS> = {}): RecordedLine[] =>
    record((d) => drawHud(d, world, { ...HUD_OPTS, ...opts }));

  const textKeys = (text: string, x: number, y: number, scale: number): string[] =>
    keys(record((d) => drawText(d, text, x, y, scale, { intensity: TEXT_INTENSITY })));

  it('draws the score at the ROM position with the trailing thousands', () => {
    const drawn = keys(hud(worldWith({ score: 3000 })));
    for (const line of textKeys('SCORE    3000', 128, 320, 1)) expect(drawn).toContain(line);
  });

  it('blanks the leading zeros of the score, as the original does', () => {
    const drawn = keys(hud(worldWith({ score: 0 })));
    // Every digit cell blank leaves the ROM string's own literal thousands.
    for (const line of textKeys('SCORE     000', 128, 320, 1)) expect(drawn).toContain(line);
  });

  it('draws the high score from the options at half size', () => {
    const drawn = keys(hud(worldWith({ score: 1000 }), { highScore: 25000 }));
    for (const line of textKeys('HIGH SCORE    25000', 128, 280, 0.5)) {
      expect(drawn).toContain(line);
    }
  });

  it('draws the score text at intensity 12', () => {
    const plain = record((d) => drawHud(d, worldWith({ score: 7000 }), HUD_OPTS));
    const scoreLines = plain.filter((l) => l.y0 >= 320 && l.y0 <= 344);
    expect(scoreLines.length).toBeGreaterThan(10);
    expect(scoreLines.every((l) => l.intensity === TEXT_INTENSITY)).toBe(true);
  });

  it('draws one reserve tank icon per life, stepping right', () => {
    const [x, y] = LIVES_ICON_ORIGIN;
    const drawn = keys(hud(worldWith({ lives: 3 })));
    for (let life = 0; life < 3; life += 1) {
      for (const segment of pictureKeys(LIVES_TANK, x + life * LIVES_ICON_SPACING, y)) {
        expect(drawn).toContain(segment);
      }
    }
    const none = keys(hud(worldWith({ lives: 0 })));
    expect(drawn.length - none.length).toBe(3 * pictureKeys(LIVES_TANK).length);
  });

  it('flashes ENEMY IN RANGE in its top-left slot while the enemy is in range', () => {
    const world = worldWith({ enemyInRange: true });
    const expected = textKeys('ENEMY IN RANGE', -440, 360, 0.5);
    const on = keys(hud(world, { blinkTick: 0 }));
    for (const line of expected) expect(on).toContain(line);
    // Bit 1 of the frame counter blanks it for two ticks in four.
    const off = keys(hud(world, { blinkTick: MESSAGE_FLASH_MASK }));
    for (const line of expected) expect(off).not.toContain(line);
  });

  it('leaves ENEMY IN RANGE off when no enemy is in range', () => {
    const quiet = keys(hud(worldWith({ enemyInRange: false })));
    const shown = keys(hud(worldWith({ enemyInRange: true })));
    expect(shown.length).toBeGreaterThan(quiet.length);
    for (const line of textKeys('ENEMY IN RANGE', -440, 360, 0.5)) {
      expect(quiet).not.toContain(line);
    }
  });

  it('leaves the reticle off when the caller hides it, as the logo does', () => {
    const world = worldWith({});
    const hidden = keys(hud(world, { showReticle: false }));
    for (const line of pictureKeys(RETICLE_NORMAL)) expect(hidden).not.toContain(line);
    // Only the gunsight goes: the strip is still up.
    expect(hidden.length).toBeGreaterThan(0);
    expect(keys(hud(world)).length).toBeGreaterThan(hidden.length);
  });

  it('switches to the locked reticle when the target is in the sights', () => {
    const locked = keys(hud(worldWith({ targetInSights: true })));
    for (const line of pictureKeys(RETICLE_LOCKED)) expect(locked).toContain(line);
    const plain = keys(hud(worldWith({ targetInSights: false })));
    for (const line of pictureKeys(RETICLE_NORMAL)) expect(plain).toContain(line);
  });

  it('blinks the reticle while the player shell is in flight', () => {
    const world = worldWith({ shells: [playerShell] });
    const lit = keys(hud(world, { blinkTick: 0 }));
    const dark = keys(hud(world, { blinkTick: RETICLE_BLINK_TICKS }));
    for (const line of pictureKeys(RETICLE_NORMAL)) {
      expect(lit).toContain(line);
      expect(dark).not.toContain(line);
    }
  });

  it('keeps the reticle solid for an enemy shell', () => {
    const world = worldWith({ shells: [{ ...playerShell, owner: 'enemy' }] });
    const drawn = keys(hud(world, { blinkTick: RETICLE_BLINK_TICKS }));
    for (const line of pictureKeys(RETICLE_NORMAL)) expect(drawn).toContain(line);
  });

  it('leaves the radar out for the screens that have no 3D view behind them', () => {
    const world = worldWith({ enemies: [tankAt(3000, 3000)] });
    const blips = blipsFor(world);
    const withRadar = keys(hud(world, { blips }));
    const without = keys(hud(world, { blips, showRadar: false }));

    for (const line of keys(radar(world, blips))) {
      expect(withRadar).toContain(line);
      expect(without).not.toContain(line);
    }
    // The score, high score and reserve tanks stay.
    expect(without.length).toBeGreaterThan(0);
  });

  it('leaves the range alert out where the ROM never reaches it', () => {
    const world = worldWith({ enemyInRange: true });
    const alert = textKeys('ENEMY IN RANGE', -440, 360, 0.5);

    const shown = keys(hud(world, { blinkTick: 0 }));
    const hidden = keys(hud(world, { blinkTick: 0, showAlert: false }));

    for (const line of alert) {
      expect(shown).toContain(line);
      expect(hidden).not.toContain(line);
    }
  });

  it('draws one reserve tank per life, counting the tank being played', () => {
    // `INFO` outputs one TSYMBL per LIVES and nothing at zero
    // (BZONE.MAC.txt:8287-8299); LIVES still counts the current tank, since it is
    // decremented by the hit that kills it (BZONE.MAC.txt:4607).
    const icons = pictureKeys(LIVES_TANK).length;
    const none = keys(hud(worldWith({ lives: 0 }))).length;

    expect(keys(hud(worldWith({ lives: 3 }))).length - none).toBe(3 * icons);
    expect(keys(hud(worldWith({ lives: 1 }))).length - none).toBe(icons);
  });

  it('keeps every HUD element on the screen', () => {
    const world = worldWith({
      score: 9999000,
      lives: 3,
      enemyInRange: true,
      enemies: [tankAt(3000, 3000)],
    });
    for (const l of hud(world, { highScore: 9999000 })) {
      for (const x of [l.x0, l.x1]) expect(Math.abs(x)).toBeLessThanOrEqual(SCREEN_HALF_WIDTH);
      for (const y of [l.y0, l.y1]) expect(Math.abs(y)).toBeLessThanOrEqual(SCREEN_HALF_HEIGHT);
    }
  });
});
