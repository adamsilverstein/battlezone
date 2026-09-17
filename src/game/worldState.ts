/**
 * The little bit of per-world bookkeeping the shared `World` type has no room
 * for.
 *
 * `game/types.ts` is the contract between the simulation, the renderer and the
 * audio system, and it deliberately describes only what those three need to see.
 * Two things the simulation needs are not in it: whether the player was already
 * grinding against an obstacle last tick (so "MOTION BLOCKED" is reported once
 * per contact, as the ROM plays `BOING` once) and the next shell id.  They live
 * here, in a `WeakMap` keyed on the world, so the contract stays as published and
 * the state still disappears with the world it belongs to.
 *
 * The enemy AI needs the same treatment twice over: the ladder's counters belong
 * to the world (`internalState`) and each unit's steering belongs to the unit
 * (`enemyBrain`).  `Enemy` publishes only the `state` name and the `timer` the
 * renderer and the tests read, so `RGOAL`, `FTIMER`, the saucer's drift and the
 * missile's collision flag live here instead.
 */

import { ENEMY_FTIMER_MAX } from '../data/constants';
import type { Enemy, Vec2, World } from './types';

interface InternalState {
  /** True while the player's move is being backed out every tick. */
  playerBlocked: boolean;
  /** Next `Shell.id`; ids are per-world so two worlds stay comparable. */
  nextShellId: number;
  /** Next `Enemy.id`, for the same reason. */
  nextEnemyId: number;
  /** `NOR2D3`: how many missiles have been launched, which brings on the supertank. */
  missilesLaunched: number;
  /** `HITS+2`: how many times the enemy has killed the player - its own score. */
  playerDeaths: number;
  /**
   * A forced choice for the next unit, overriding the ladder's coin flip: a tank
   * after a missile kill or a player death, "so we don't missile-spam the poor
   * player", and a missile when the player has stalled a tank out.
   */
  nextUnitOverride: 'tank' | 'missile' | null;
  /** `STIMER`: ticks until the next saucer arrives. */
  saucerTimer: number;
  /**
   * The tick the next enemy unit may appear on: the one the last chunk of the
   * previous unit's explosion lands, so there is no gap between enemies.
   */
  nextUnitAt: number;
}

/** One enemy unit's steering and timers. */
export interface EnemyBrain {
  /** `RGOAL`: the heading the unit is steering towards, in radians. */
  goal: number;
  /** `FTIMER`: ticks since the unit appeared, saturating at `ENEMY_FTIMER_MAX`. */
  ftimer: number;
  /** Ticks since the unit appeared, not saturating: the spawner's stall timer. */
  aliveTicks: number;
  /** Which way it swings while backing out of a collision. */
  retreatTurn: 1 | -1;
  /** `OBJCOL+2`: the missile is touching an obstacle, so it levitates. */
  blocked: boolean;
  /** The saucer's per-tick drift, re-randomised when its course timer expires. */
  drift: Vec2;
  /** `STIMER` while the saucer is flying: ticks until it picks a new course. */
  courseTicks: number;
  /** Ticks the unit has spent outside radar range; a missile is replaced at last. */
  outOfRangeTicks: number;
  /** The player shell this unit has already reacted to, so it dodges each shot once. */
  dodgedShell: number;
}

const states = new WeakMap<World, InternalState>();
const brains = new WeakMap<Enemy, EnemyBrain>();

/** The world's private state, created on first use. */
export function internalState(world: World): InternalState {
  const existing = states.get(world);
  if (existing) return existing;
  const fresh: InternalState = {
    playerBlocked: false,
    nextShellId: 1,
    nextEnemyId: 1,
    missilesLaunched: 0,
    playerDeaths: 0,
    nextUnitOverride: null,
    saucerTimer: 0,
    nextUnitAt: 0,
  };
  states.set(world, fresh);
  return fresh;
}

/**
 * The unit's private state, created on first use.  A brain made on first use
 * inherits the unit's current heading as its goal, which is what a freshly placed
 * enemy wants: it drives on until its first decision.
 */
export function enemyBrain(enemy: Enemy): EnemyBrain {
  const existing = brains.get(enemy);
  if (existing) return existing;
  const fresh: EnemyBrain = {
    goal: enemy.heading,
    ftimer: 0,
    aliveTicks: 0,
    retreatTurn: 1,
    blocked: false,
    drift: { x: 0, z: 0 },
    courseTicks: 0,
    outOfRangeTicks: 0,
    dodgedShell: 0,
  };
  brains.set(enemy, fresh);
  return fresh;
}

/** Ticks the unit's two age counters on; `FTIMER` saturates the way the ROM's byte does. */
export function ageEnemy(brain: EnemyBrain): void {
  brain.ftimer = Math.min(brain.ftimer + 1, ENEMY_FTIMER_MAX);
  brain.aliveTicks += 1;
}
