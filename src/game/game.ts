/**
 * The game state machine: attract mode, a game, the death sequence, game over and
 * high score entry - `MAIN` plus the bits of the NMI that start a game.
 *
 * THE PHASES AND THEIR LENGTHS
 * ----------------------------
 * The original has two attract displays and toggles between them every `TIMOUT`
 * step, 256 ticks (`ATTRACT_PHASE_TICKS`, 16.384 s): the high score table, and
 * demo play with the flying logo over it (BZONE.MAC.txt:829-879).  `GamePhase`
 * splits that demo segment in two so the logo gets a phase of its own, and the
 * cycle runs in the ROM's own order - the list, then the logo over the demo, then
 * the demo carrying on once the logo has flown:
 *
 * | phase              | ticks                                | what it shows                  |
 * | ------------------ | ------------------------------------ | ------------------------------ |
 * | `attractHighScores`| `ATTRACT_PHASE_TICKS` = 256          | the table, world held still    |
 * | `attractTitle`     | `LOGO_TICKS` = 192                   | the demo, with the logo flying |
 * | `attractDemo`      | 256 - 192 = 64                       | the demo, logo gone            |
 * | `playerDead`       | `DEATH_SEQUENCE_TICKS` = 16          | the crack, then respawn        |
 * | `gameOver`         | `GAME_OVER_TICKS` (an estimate)      | GAME OVER over the field       |
 * | `highScoreEntry`   | up to `HIGH_SCORE_ENTRY_TICKS`       | the initials editor            |
 *
 * The two demo phases together are exactly the ROM's 256-tick demo segment, and
 * the logo flies its own 192-tick course at the start of it - "after the high
 * score list, the logo is shown" (docs/reference/original-game.md section 4).  A
 * cold boot therefore opens on the table, as the ROM does.
 *
 * DEATH
 * -----
 * The player's death freezes the world and the renderer grows the crack from
 * `phaseTicks`, one group per tick.  The exception is a player shell still in
 * flight: `WNSHLD` "waits for any shell still in flight before resetting", so a
 * kill from beyond the grave still scores and can even earn the bonus tank that
 * clears the game-over flag (docs/reference/original-game.md section 4).  So the
 * world keeps ticking, on neutral sticks, for exactly as long as that shell is up,
 * and is frozen otherwise; the respawn waits for both the sequence and the shell.
 *
 * WHAT THIS MODULE MAY NOT DO
 * ---------------------------
 * No DOM, no `Math.random`, no `Date`: the only source of chance is the injected
 * `Rng`, and the high score table arrives as data and leaves as data - `main.ts`
 * owns `localStorage` and the audio mute.
 */

import {
  ATTRACT_PHASE_TICKS,
  DEATH_SEQUENCE_TICKS,
  DEFAULT_OPTIONS,
  GAME_OVER_TICKS,
  INITIALS_REPEAT_TICKS,
  INITIALS_TIMEOUT_TIMOUT,
  LOGO_TICKS,
  PLAYER_OBSTACLE_RADIUS,
  TANK_TANK_RADIUS,
  TICKS_PER_TIMOUT,
  WORLD_SIZE,
} from '../data/constants';
import { TAU } from '../engine/math';
import { NEUTRAL_INPUT, type InputState } from '../input/types';
import { attractInput } from './attract';
import { circleHitsObstacle, octagonalDistance, wrapCoordinate } from './collision';
import { insertHighScore, newInitialsEntry, qualifies, updateInitialsEntry } from './highScores';
import { playerShellInFlight } from './shells';
// The simulation's entry point, which is also what installs the enemy systems.
import { createAttractWorld, createWorld, resetPlayer, updateWorld } from './index';
import type {
  AudioSnapshot,
  Enemy,
  GameEvent,
  GamePhase,
  GameState,
  HighScoreEntry,
  Rng,
  Vec2,
  World,
} from './types';
import { enemyBrain } from './worldState';

/** The flying logo's own flight is the length of the title phase. */
export const ATTRACT_TITLE_TICKS = LOGO_TICKS;

/** The table gets a whole `TIMOUT` segment, as in the original. */
export const ATTRACT_HIGH_SCORE_TICKS = ATTRACT_PHASE_TICKS;

/** The rest of the ROM's demo segment, once the logo has flown. */
export const ATTRACT_DEMO_TICKS = ATTRACT_PHASE_TICKS - LOGO_TICKS;

/** Entry times out when `TIMOUT` reaches 4 (BZONE.MAC.txt:1679-1683). */
export const HIGH_SCORE_ENTRY_TICKS = INITIALS_TIMEOUT_TIMOUT * TICKS_PER_TIMOUT;

/** `GAME OVER`, the one overlay the state machine names. */
const GAME_OVER_MESSAGE = 'GAME OVER';

/** How many spots the respawn tries before it settles for the start of a life. */
const RESPAWN_TRIES = 16;

/**
 * How close to an enemy a respawn may put the player: twice the distance at which
 * the two tanks are touching.  Inside `TANK_TANK_RADIUS` the player would be
 * against the enemy with nowhere to drive, which is exactly the collision the ROM
 * re-rolls the spot to avoid.
 */
const RESPAWN_CLEARANCE = TANK_TANK_RADIUS * 2;

/** The phases nobody is playing. */
type AttractPhase = 'attractTitle' | 'attractHighScores' | 'attractDemo';

/** The attract phases, in the order they cycle: table, logo over the demo, demo. */
const ATTRACT_CYCLE: Record<AttractPhase, GamePhase> = {
  attractHighScores: 'attractTitle',
  attractTitle: 'attractDemo',
  attractDemo: 'attractHighScores',
};

/** How long each attract phase lasts. */
const ATTRACT_LENGTH: Record<AttractPhase, number> = {
  attractTitle: ATTRACT_TITLE_TICKS,
  attractHighScores: ATTRACT_HIGH_SCORE_TICKS,
  attractDemo: ATTRACT_DEMO_TICKS,
};

/** Whether nobody is playing, which is when the start button is live and sound is muted. */
export function isAttractPhase(phase: GamePhase): phase is AttractPhase {
  return phase in ATTRACT_CYCLE;
}

/** The phases that run the demo pilot over a live battlefield. */
function isDemoPhase(phase: GamePhase): boolean {
  return phase === 'attractTitle' || phase === 'attractDemo';
}

/** The live missile, whose distance scales the buzz. */
function liveMissile(world: World): Enemy | null {
  return world.enemies.find((e) => e.kind === 'missile' && e.alive) ?? null;
}

export interface Game {
  state: GameState;
  update(input: InputState): GameEvent[];
  audioSnapshot(): AudioSnapshot;
}

export function createGame(opts: { rng: Rng; highScores: HighScoreEntry[] }): Game {
  const { rng } = opts;

  const state: GameState = {
    // The ROM comes up on the high score list, and the logo follows it.
    phase: 'attractHighScores',
    phaseTicks: 0,
    world: createAttractWorld(),
    highScores: opts.highScores,
  };

  /** `LTIMER`: ticks before the initials stick may step the letter again. */
  let letterTimer = 0;

  function enter(phase: GamePhase): void {
    state.phase = phase;
    state.phaseTicks = 0;
    state.message = phase === 'gameOver' ? GAME_OVER_MESSAGE : undefined;
  }

  /** Whether this update is the `n`th of the phase or later. */
  function afterTicks(n: number): boolean {
    return state.phaseTicks + 1 >= n;
  }

  /** Back to the attract cycle on a fresh demo battlefield. */
  function enterAttract(phase: GamePhase): void {
    state.world = createAttractWorld();
    state.entry = undefined;
    enter(phase);
  }

  /** The NMI's start: a clean battlefield, the cabinet's lives and no score. */
  function startGame(): void {
    state.world = createWorld(rng, { lives: DEFAULT_OPTIONS.lives });
    state.entry = undefined;
    enter('playing');
  }

  /** Whether a respawn may use this spot: no obstacle on it, no enemy against it. */
  function spotIsClear(spot: Vec2): boolean {
    const { world } = state;
    if (circleHitsObstacle(spot, PLAYER_OBSTACLE_RADIUS, world.obstacles)) return false;
    return !world.enemies.some(
      (enemy) => enemy.alive && octagonalDistance(spot, enemy.pos) < RESPAWN_CLEARANCE,
    );
  }

  /**
   * `RespawnPlayer`: a random spot that touches no obstacle and is clear of the
   * enemy, and a random facing.  The ROM re-rolls until the spot is free; this
   * gives up after `RESPAWN_TRIES` and leaves the player where `resetPlayer` put
   * them, so a crowded field cannot spin here forever.  The ROM also masks the Z
   * coordinate's high byte to `$3F` - the disassembly flags that as unexplained,
   * so it is not copied.
   */
  function respawnPlayer(): void {
    const { world } = state;
    resetPlayer(world);

    for (let attempt = 0; attempt < RESPAWN_TRIES; attempt += 1) {
      const spot = {
        x: wrapCoordinate(rng.int(WORLD_SIZE)),
        z: wrapCoordinate(rng.int(WORLD_SIZE)),
      };
      if (!spotIsClear(spot)) continue;
      world.player.pos = spot;
      break;
    }
    world.player.heading = rng.next() * TAU;

    // The enemy stands down: a random heading for about three seconds, and no
    // shot for two, which is what resetting `FTIMER` buys (docs/reference/
    // original-game.md section 4, "Respawn").
    for (const enemy of world.enemies) {
      const brain = enemyBrain(enemy);
      brain.ftimer = 0;
      brain.goal = rng.next() * TAU;
    }
  }

  /** One tick of the demo: the autopilot drives, and a shot demo tank stands up again. */
  function runDemo(): GameEvent[] {
    const { world } = state;
    const events = updateWorld(world, attractInput(world, world.tick, rng), rng);
    // Nothing is at stake in the demo, so a hit costs no life and shows no crack;
    // the ROM's demo enemy hardly ever attacks at all.
    if (!world.player.alive) resetPlayer(world);
    return events;
  }

  /** The crack, and what happens when it has finished spreading. */
  function runPlayerDead(): GameEvent[] {
    const { world } = state;
    // Only the shell keeps the world moving; everything else is held still.
    const events = playerShellInFlight(world) ? updateWorld(world, NEUTRAL_INPUT, rng) : [];

    if (!afterTicks(DEATH_SEQUENCE_TICKS) || playerShellInFlight(world)) return events;
    // A bonus tank earned by that last shell is a life like any other, which is
    // how the ROM lets a kill from beyond the grave call off the game over.
    if (world.lives > 0) {
      respawnPlayer();
      enter('playing');
    } else {
      enter('gameOver');
    }
    return events;
  }

  /** Game over: the score is weighed against the table once the message has had its time. */
  function runGameOver(): GameEvent[] {
    if (!afterTicks(GAME_OVER_TICKS)) return [];
    const { score } = state.world;
    if (!qualifies(state.highScores, score)) {
      enterAttract('attractHighScores');
      return [];
    }
    state.entry = { ...newInitialsEntry(), score };
    letterTimer = 0;
    enter('highScoreEntry');
    // `CKSCOR` plays the 1812 Overture on the way in (BZONE.MAC.txt:1569-1677).
    return [{ type: 'fanfare' }];
  }

  /** One tick of the initials editor, with `LTIMER` holding the stick back. */
  function runHighScoreEntry(input: InputState): GameEvent[] {
    const entry = state.entry;
    if (!entry) {
      enterAttract('attractHighScores');
      return [];
    }

    letterTimer = Math.max(letterTimer - 1, 0);
    const stepping = input.rightTread !== 0 && letterTimer === 0;
    if (stepping) letterTimer = INITIALS_REPEAT_TICKS;
    const next = updateInitialsEntry(entry, stepping ? input : { ...input, rightTread: 0 });
    state.entry = { ...entry, initials: next.initials, cursor: next.cursor };

    if (!next.done && !afterTicks(HIGH_SCORE_ENTRY_TICKS)) return [];
    // A timeout stores whatever is on screen, underlines and all, as the ROM does.
    state.highScores = insertHighScore(state.highScores, {
      initials: next.initials,
      score: entry.score,
    });
    enterAttract('attractHighScores');
    return [];
  }

  /** The phase's own work, which may move the machine on to the next phase. */
  function advance(input: InputState): GameEvent[] {
    const { phase } = state;

    if (isAttractPhase(phase)) {
      const events = isDemoPhase(phase) ? runDemo() : [];
      if (afterTicks(ATTRACT_LENGTH[phase])) enter(ATTRACT_CYCLE[phase]);
      return events;
    }

    switch (phase) {
      case 'playing': {
        const events = updateWorld(state.world, input, rng);
        if (events.some((event) => event.type === 'playerDestroyed')) {
          state.world.lives -= 1;
          enter('playerDead');
        }
        return events;
      }
      case 'playerDead':
        return runPlayerDead();
      case 'gameOver':
        return runGameOver();
      case 'highScoreEntry':
        return runHighScoreEntry(input);
    }
  }

  return {
    state,

    update(input: InputState): GameEvent[] {
      // A credit and the start button begin a game from any attract display
      // (BZONE.MAC.txt:2291-2363); this cabinet is on free play.
      if (isAttractPhase(state.phase) && input.startPressed) {
        startGame();
        return [];
      }

      const from = state.phase;
      const events = advance(input);
      // A phase that has just been entered is on tick zero of its own.
      if (state.phase === from) state.phaseTicks += 1;
      return events;
    },

    audioSnapshot(): AudioSnapshot {
      const { world } = state;
      const missile = liveMissile(world);
      // Every continuous voice belongs to a game in progress.  The world outlives
      // the game - it is still there, frozen, under GAME OVER and behind the
      // initials editor - so a snapshot taken straight off it would leave the
      // saucer humming and the missile buzzing after the player is done.  One-shots
      // are unaffected, which is what lets the high-score fanfare play.
      const inPlay = state.phase === 'playing';
      return {
        engineRunning: inPlay,
        // The ROM revs for any non-centred stick, a pivot included.
        moving: inPlay && (world.player.moving || world.player.turning),
        enemyInRange: inPlay && world.enemyInRange,
        missileActive: inPlay && missile !== null,
        saucerActive: inPlay && world.enemies.some((e) => e.kind === 'saucer' && e.alive),
        missileDistance:
          inPlay && missile ? octagonalDistance(world.player.pos, missile.pos) : null,
      };
    },
  };
}
