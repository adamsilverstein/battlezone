/**
 * The world: entity lists and the systems that advance them.
 *
 * For now this is only the empty starting state the renderer and the boot code
 * need; the simulation itself lands with the player and enemy tasks.
 */

import type { World } from './types';

/** A fresh, empty battlefield with the player at the origin facing the moon. */
export function createEmptyWorld(): World {
  return {
    tick: 0,
    player: { pos: { x: 0, z: 0 }, heading: 0, moving: false, turning: false, alive: true },
    enemies: [],
    shells: [],
    obstacles: [],
    debris: [],
    radarAngle: 0,
    enemyInRange: false,
    targetInSights: false,
    score: 0,
    lives: 0,
    nextBonusAt: null,
  };
}
