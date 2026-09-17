import { describe, expect, it } from 'vitest';
import {
  ENEMY_FIRE_GRACE_TICKS,
  MOVE_STEP_UNITS,
  SUPERTANK_DODGE_TICKS,
  SUPERTANK_PIVOT_STEPS,
  SUPERTANK_SPEED_MULTIPLIER,
  SUPERTANK_STOP_CLOSING_UNITS,
} from '../../src/data/constants';
import { TAU, wrapAngle } from '../../src/engine/math';
import { createRng } from '../../src/engine/rng';
import { bearingTo, octagonalDistance } from '../../src/game/collision';
import { updateTank } from '../../src/game/enemies/tank';
import { SUPERTANK_PROFILE, updateSupertank } from '../../src/game/enemies/supertank';
import { TURN_STEP_RADIANS } from '../../src/game/player';
import type { Enemy, World } from '../../src/game/types';
import { enemyBrain } from '../../src/game/worldState';
import { makeWorld } from './fixtures';

/** A supertank up the +Z axis, lined up on the player and free to fire. */
function duel(z = 6000) {
  const world = makeWorld();
  world.score = 5000;
  const enemy: Enemy = {
    id: 1,
    kind: 'supertank',
    pos: { x: 0, z },
    heading: Math.PI,
    y: 0,
    alive: true,
    state: 'approach',
    timer: 60,
  };
  world.enemies = [enemy];
  const brain = enemyBrain(enemy);
  brain.ftimer = ENEMY_FIRE_GRACE_TICKS;
  brain.goal = bearingTo(enemy.pos, world.player.pos);
  return { world, enemy, brain };
}

/** Puts a player shell in the air, as if the trigger had just been pulled. */
function playerFires(world: World, id = 1): void {
  world.shells.push({
    id,
    owner: 'player',
    pos: { ...world.player.pos },
    y: 0,
    heading: world.player.heading,
    ticksLeft: 8,
  });
}

describe('SUPERTANK_PROFILE', () => {
  it('is twice as quick as a tank in both senses, and keeps further off', () => {
    expect(SUPERTANK_PROFILE.speedMultiplier).toBe(SUPERTANK_SPEED_MULTIPLIER);
    expect(SUPERTANK_PROFILE.pivotSteps).toBe(SUPERTANK_PIVOT_STEPS);
    expect(SUPERTANK_PROFILE.stopClosing).toBe(SUPERTANK_STOP_CLOSING_UNITS);
  });
});

describe('updateSupertank', () => {
  it('covers twice the ground of a tank on the same approach', () => {
    const fast = duel();
    const slow = duel();
    slow.enemy.kind = 'tank';

    updateSupertank(fast.world, fast.enemy, createRng(1));
    updateTank(slow.world, slow.enemy, createRng(1));

    const fastMoved = 6000 - fast.enemy.pos.z;
    const slowMoved = 6000 - slow.enemy.pos.z;
    expect(fastMoved).toBeCloseTo(SUPERTANK_SPEED_MULTIPLIER * slowMoved, 9);
    expect(fastMoved).toBeCloseTo(2 * SUPERTANK_SPEED_MULTIPLIER * MOVE_STEP_UNITS, 9);
  });

  it('pivots four steps a tick while it is off target', () => {
    const { world, enemy, brain } = duel();
    enemy.heading = 0;
    brain.goal = Math.PI / 2;

    updateSupertank(world, enemy, createRng(1));
    expect(enemy.heading).toBeCloseTo(SUPERTANK_PIVOT_STEPS * TURN_STEP_RADIANS, 9);
  });

  it('breaks off its approach the moment the player fires', () => {
    const { world, enemy, brain } = duel();
    const bearing = bearingTo(enemy.pos, world.player.pos);
    // Pointing away, so the tick reports the dodge rather than a shot.
    enemy.heading = 0;
    playerFires(world);

    updateSupertank(world, enemy, createRng(1));

    expect(enemy.state).toBe('dodge');
    expect(enemy.timer).toBe(SUPERTANK_DODGE_TICKS);
    // It slides across the shell's path rather than backing off down it.
    expect(Math.abs(wrapAngle(brain.goal - bearing))).toBeCloseTo(TAU / 4, 9);
  });

  it('dodges each shot once, and a fresh shot cannot extend the break-off', () => {
    const { world, enemy, brain } = duel();
    playerFires(world);
    updateSupertank(world, enemy, createRng(1));
    const dodgeGoal = brain.goal;

    // Same shell still in the air: the goal stands and the timer runs down.
    updateSupertank(world, enemy, createRng(1));
    expect(brain.goal).toBe(dodgeGoal);
    expect(enemy.timer).toBe(SUPERTANK_DODGE_TICKS - 1);

    // A second shot mid-dodge does not restart it - a player firing repeatedly
    // cannot hold the supertank sideways for ever.
    world.shells = [];
    playerFires(world, 2);
    updateSupertank(world, enemy, createRng(2));
    expect(enemy.timer).toBe(SUPERTANK_DODGE_TICKS - 2);
    expect(brain.goal).toBe(dodgeGoal);

    // Once this dodge has run out - with the field clear, so nothing new triggers
    // one meanwhile - the next shot starts a fresh one.
    world.shells = [];
    for (let tick = 0; tick < SUPERTANK_DODGE_TICKS; tick += 1) {
      updateSupertank(world, enemy, createRng(2));
    }
    playerFires(world, 3);
    updateSupertank(world, enemy, createRng(3));
    expect(enemy.state).toBe('dodge');
    expect(enemy.timer).toBe(SUPERTANK_DODGE_TICKS);
  });

  it('does not abandon a back-out to dodge', () => {
    // The retreat has its own goal and timer; cancelling it would leave the
    // supertank grinding against whatever it drove into.
    const { world, enemy, brain } = duel();
    enemy.state = 'retreat';
    enemy.timer = 20;
    brain.goal = 0;
    playerFires(world);

    updateSupertank(world, enemy, createRng(1));

    expect(enemy.state).toBe('retreat');
    expect(enemy.timer).toBe(19);
    expect(brain.goal).toBe(0);
    expect(brain.dodgeTicksLeft).toBe(0);
  });

  it('gets out of the way of a shell coming straight at it', () => {
    const { world, enemy } = duel(4000);
    playerFires(world);
    const across = Math.abs(enemy.pos.x);

    for (let tick = 0; tick < SUPERTANK_DODGE_TICKS; tick += 1) {
      updateSupertank(world, enemy, createRng(3));
    }
    expect(Math.abs(enemy.pos.x)).toBeGreaterThan(across);
  });

  it('goes back to attacking once the dodge is over', () => {
    const { world, enemy } = duel();
    playerFires(world);
    for (let tick = 0; tick <= SUPERTANK_DODGE_TICKS; tick += 1) {
      updateSupertank(world, enemy, createRng(4));
    }
    world.shells = [];
    updateSupertank(world, enemy, createRng(4));
    expect(enemy.state).not.toBe('dodge');
  });

  it('keeps its distance further out than a tank does', () => {
    const { world, enemy, brain } = duel(SUPERTANK_STOP_CLOSING_UNITS + 400);
    brain.goal = bearingTo(enemy.pos, world.player.pos);
    enemy.heading = brain.goal;

    for (let tick = 0; tick < 20; tick += 1) updateSupertank(world, enemy, createRng(5));

    expect(octagonalDistance(enemy.pos, world.player.pos)).toBeGreaterThanOrEqual(
      SUPERTANK_STOP_CLOSING_UNITS - SUPERTANK_SPEED_MULTIPLIER * 2 * MOVE_STEP_UNITS,
    );
  });
});
