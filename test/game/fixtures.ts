/**
 * Shared fixtures for the simulation tests.
 *
 * `makeWorld` is deliberately a bare literal rather than `createWorld`: the unit
 * tests want a battlefield with only the obstacles they put in it, so a change to
 * the real 21-obstacle layout cannot quietly change what they are asserting.
 */

import type { Obstacle, World } from '../../src/game/types';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

/** A bare world: a live player at the origin facing +Z, and nothing else. */
export function makeWorld(obstacles: Obstacle[] = []): World {
  return {
    tick: 0,
    player: { pos: { x: 0, z: 0 }, heading: 0, moving: false, turning: false, alive: true },
    enemies: [],
    shells: [],
    obstacles,
    debris: [],
    radarAngle: 0,
    enemyInRange: false,
    targetInSights: false,
    score: 0,
    lives: 3,
    nextBonusAt: null,
  };
}

/** The two tread sticks, with nothing else pressed. */
export const sticks = (leftTread: -1 | 0 | 1, rightTread: -1 | 0 | 1): InputState => ({
  ...NEUTRAL_INPUT,
  leftTread,
  rightTread,
});
