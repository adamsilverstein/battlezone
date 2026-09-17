import { describe, expect, it } from 'vitest';
import {
  OBSTACLE_TANK_RADIUS,
  SAUCER_COURSE_TICKS_MAX,
  SAUCER_DEATH_TICKS,
  SAUCER_HOVER_HEIGHT,
  SAUCER_MIN_SCORE,
  SAUCER_RESPAWN_TICKS_MAX,
  SAUCER_SPAWN_GRANULARITY,
  SAUCER_SPEED_MAX_PER_TICK,
  SAUCER_SPIN_PER_TICK,
  SAUCER_VISIT_TICKS,
  TANGLE_UNIT_RADIANS,
} from '../../src/data/constants';
import { wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { updateSaucer } from '../../src/game/enemies/saucer';
import type { Enemy, GameEvent, World } from '../../src/game/types';
import { enemyBrain, internalState } from '../../src/game/worldState';
import { makeWorld } from './fixtures';

/** A world rich enough for the saucer to turn up in. */
function scored(score = SAUCER_MIN_SCORE) {
  const world = makeWorld();
  world.score = score;
  return world;
}

/** Runs the saucer system until one appears, and returns it. */
function summon(world: World, seed = 1): Enemy {
  const rng = createRng(seed);
  for (let tick = 0; tick < SAUCER_RESPAWN_TICKS_MAX + 2; tick += 1) {
    world.tick += 1;
    updateSaucer(world, rng);
    const saucer = world.enemies.find((enemy) => enemy.kind === 'saucer');
    if (saucer) return saucer;
  }
  throw new Error('no saucer arrived');
}

describe('updateSaucer', () => {
  it('stays away until the score reaches 2000', () => {
    const world = scored(SAUCER_MIN_SCORE - 1000);
    const rng = createRng(1);
    for (let tick = 0; tick < 600; tick += 1) {
      world.tick += 1;
      expect(updateSaucer(world, rng)).toEqual([]);
    }
    expect(world.enemies).toEqual([]);
  });

  it('arrives once the score allows, and says so', () => {
    const world = scored();
    const rng = createRng(1);
    const events: GameEvent[] = [];
    for (let tick = 0; tick < SAUCER_VISIT_TICKS / 2; tick += 1) {
      world.tick += 1;
      events.push(...updateSaucer(world, rng));
    }
    expect(events).toContainEqual<GameEvent>({ type: 'saucerAppeared' });
    expect(world.enemies.filter((enemy) => enemy.kind === 'saucer')).toHaveLength(1);
  });

  it('appears on the 256-unit grid, hovering above the battlefield', () => {
    const world = scored();
    const saucer = summon(world);
    expect(Math.abs(saucer.pos.x % SAUCER_SPAWN_GRANULARITY)).toBe(0);
    expect(Math.abs(saucer.pos.z % SAUCER_SPAWN_GRANULARITY)).toBe(0);
    expect(saucer.y).toBe(SAUCER_HOVER_HEIGHT);
    expect(saucer.alive).toBe(true);
  });

  it('spins and drifts, and re-randomises its course', () => {
    const world = scored();
    const saucer = summon(world);
    const rng = createRng(2);
    const facing = saucer.heading;
    const brain = enemyBrain(saucer);
    const firstDrift = { ...brain.drift };

    world.tick += 1;
    updateSaucer(world, rng);
    expect(wrapAngle(saucer.heading - facing)).toBeCloseTo(
      SAUCER_SPIN_PER_TICK * TANGLE_UNIT_RADIANS,
      9,
    );
    expect(Math.abs(brain.drift.x)).toBeLessThanOrEqual(SAUCER_SPEED_MAX_PER_TICK);
    expect(Math.abs(brain.drift.z)).toBeLessThanOrEqual(SAUCER_SPEED_MAX_PER_TICK);

    let changed = false;
    for (let tick = 0; tick < SAUCER_COURSE_TICKS_MAX + 2 && !changed; tick += 1) {
      world.tick += 1;
      updateSaucer(world, rng);
      changed = brain.drift.x !== firstDrift.x || brain.drift.z !== firstDrift.z;
    }
    expect(changed).toBe(true);
  });

  it('flies through obstacles, because nothing collides with it', () => {
    const world = scored();
    const saucer = summon(world);
    world.obstacles = [
      {
        kind: 'box',
        pos: { ...saucer.pos },
        heading: 0,
        radius: OBSTACLE_TANK_RADIUS.box,
      },
    ];
    const rng = createRng(3);
    const started = { ...saucer.pos };
    enemyBrain(saucer).drift = { x: 100, z: 0 };
    enemyBrain(saucer).courseTicks = 50; // no re-randomisation on this tick

    world.tick += 1;
    updateSaucer(world, rng);
    expect(saucer.pos.x).toBe(started.x + 100);
    expect(saucer.alive).toBe(true);
  });

  it('leaves when its visit is over, and a later one arrives', () => {
    const world = scored();
    const saucer = summon(world);
    const rng = createRng(4);
    const events: GameEvent[] = [];
    for (let tick = 0; tick < SAUCER_VISIT_TICKS + 1; tick += 1) {
      world.tick += 1;
      events.push(...updateSaucer(world, rng));
    }

    expect(events).toContainEqual<GameEvent>({ type: 'saucerLeft' });
    expect(world.enemies).not.toContain(saucer);
    // And the gap before the next one is the ROM's random wait.
    expect(internalState(world).saucerTimer).toBeGreaterThan(0);
    expect(internalState(world).saucerTimer).toBeLessThanOrEqual(SAUCER_RESPAWN_TICKS_MAX);
  });

  it('flares and fades for 32 ticks once it is shot, then makes way for another', () => {
    const world = scored();
    const saucer = summon(world);
    saucer.alive = false;
    saucer.state = 'dying';
    saucer.timer = SAUCER_DEATH_TICKS;
    const rng = createRng(5);
    const started = { ...saucer.pos };

    world.tick += 1;
    updateSaucer(world, rng);
    expect(saucer.timer).toBe(SAUCER_DEATH_TICKS - 1);
    // A dying saucer stops flying: it disintegrates where it was hit.
    expect(saucer.pos).toEqual(started);

    for (let tick = 0; tick < SAUCER_DEATH_TICKS; tick += 1) {
      world.tick += 1;
      updateSaucer(world, rng);
    }
    expect(world.enemies).not.toContain(saucer);
  });

  it('never fires and never leaves a shell behind', () => {
    const world = scored();
    const saucer = summon(world);
    const rng = createRng(6);
    for (let tick = 0; tick < 100; tick += 1) {
      world.tick += 1;
      updateSaucer(world, rng);
    }
    expect(world.shells).toEqual([]);
    expect(saucer.kind).toBe('saucer');
  });
});
