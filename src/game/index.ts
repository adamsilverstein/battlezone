/**
 * The simulation's entry point: import this, not `./world`, to get a world that
 * has enemies in it.
 *
 * `world.ts` deliberately knows nothing about the enemy - the enemy systems push
 * themselves onto its `systems` list - so something has to import
 * `./enemies` for that registration to happen.  It cannot be `world.ts` itself:
 * `enemies/index.ts` imports `systems` from `world.ts`, so the two importing each
 * other would be a module cycle, and the cycle would fail at load time rather than
 * politely - `systems` is a `const`, so the enemy module would find it in its
 * temporal dead zone and throw.  This module breaks that by sitting above both.
 *
 * So: the game state machine, the renderer host and `main.ts` import from here.
 * A test that wants the bare world without enemies still imports `./world`
 * directly.
 */

import './enemies';

export {
  RADAR_SWEEP_RADIANS,
  createAttractWorld,
  createWorld,
  systems,
  updateWorld,
} from './world';
export { PLAYER_START, resetPlayer } from './player';
export { registerEnemySystems } from './enemies';
