import { describe, expect, it } from 'vitest';
import {
  DEATH_SEQUENCE_TICKS,
  DEFAULT_HIGH_SCORE,
  DEFAULT_OPTIONS,
  GAME_OVER_TICKS,
  INITIALS_LENGTH,
  INITIALS_REPEAT_TICKS,
  SHELL_STEPS_PER_TICK,
  SHELL_STEP_UNITS,
} from '../../src/data/constants';
import { createRng } from '../../src/engine/rng';
import {
  ATTRACT_DEMO_TICKS,
  ATTRACT_HIGH_SCORE_TICKS,
  ATTRACT_TITLE_TICKS,
  HIGH_SCORE_ENTRY_TICKS,
  createGame,
  isAttractPhase,
  type Game,
} from '../../src/game/game';
import { defaultHighScores } from '../../src/game/highScores';
import type { Enemy, GameEvent, GamePhase } from '../../src/game/types';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

const START: InputState = { ...NEUTRAL_INPUT, startPressed: true };
const FIRE: InputState = { ...NEUTRAL_INPUT, fire: true, firePressed: true };
const STICK = (rightTread: -1 | 0 | 1): InputState => ({ ...NEUTRAL_INPUT, rightTread });

function newGame(seed = 7): Game {
  return createGame({ rng: createRng(seed), highScores: defaultHighScores() });
}

/** Runs `n` ticks with one input and returns everything that happened. */
function run(game: Game, n: number, input: InputState = NEUTRAL_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let tick = 0; tick < n; tick += 1) events.push(...game.update(input));
  return events;
}

/** Ticks until the phase changes, or gives up after `limit` ticks. */
function runUntilPhaseChanges(game: Game, limit = 4096): { phase: GamePhase; ticks: number } {
  const from = game.state.phase;
  for (let tick = 1; tick <= limit; tick += 1) {
    game.update(NEUTRAL_INPUT);
    if (game.state.phase !== from) return { phase: game.state.phase, ticks: tick };
  }
  throw new Error(`game stayed in ${from} for ${limit} ticks`);
}

/** One tick of shell flight, which is what the collision test sweeps over. */
const SHELL_TICK_UNITS = SHELL_STEP_UNITS * SHELL_STEPS_PER_TICK;

/**
 * Puts an enemy shell exactly one tick of flight short of the player, so the next
 * update flies it into them and the death sequence begins.
 */
function killPlayer(game: Game): GameEvent[] {
  const { world } = game.state;
  world.shells.push({
    id: 9000 + world.tick,
    owner: 'enemy',
    pos: { x: world.player.pos.x, z: world.player.pos.z - SHELL_TICK_UNITS },
    y: 0,
    heading: 0,
    ticksLeft: 4,
  });
  return game.update(NEUTRAL_INPUT);
}

/** Starts a game from attract mode. */
function play(seed = 7): Game {
  const game = newGame(seed);
  game.update(START);
  expect(game.state.phase).toBe('playing');
  return game;
}

describe('attract mode', () => {
  it('boots into the title with the battlefield up', () => {
    const game = newGame();

    expect(game.state.phase).toBe('attractTitle');
    expect(game.state.phaseTicks).toBe(0);
    expect(game.state.world.obstacles.length).toBeGreaterThan(0);
  });

  it('plays itself: the demo world ticks on and an enemy turns up', () => {
    const game = newGame();
    const events = run(game, 40);

    expect(game.state.world.tick).toBe(40);
    expect(events.some((e) => e.type === 'enemySpawned')).toBe(true);
  });

  it('cycles title, high scores and demo on the ROM segment lengths', () => {
    const game = newGame();

    expect(runUntilPhaseChanges(game)).toEqual({
      phase: 'attractHighScores',
      ticks: ATTRACT_TITLE_TICKS,
    });
    expect(runUntilPhaseChanges(game)).toEqual({
      phase: 'attractDemo',
      ticks: ATTRACT_HIGH_SCORE_TICKS,
    });
    expect(runUntilPhaseChanges(game)).toEqual({
      phase: 'attractTitle',
      ticks: ATTRACT_DEMO_TICKS,
    });
  });

  it('holds the world still while the high score table is up', () => {
    const game = newGame();
    run(game, ATTRACT_TITLE_TICKS);
    expect(game.state.phase).toBe('attractHighScores');

    const frozen = game.state.world.tick;
    run(game, 10);

    expect(game.state.world.tick).toBe(frozen);
  });

  it('takes the start button in every attract phase', () => {
    for (const phase of ['attractTitle', 'attractHighScores', 'attractDemo'] as const) {
      const game = newGame();
      while (game.state.phase !== phase) game.update(NEUTRAL_INPUT);

      game.update(START);

      expect(game.state.phase, phase).toBe('playing');
    }
  });

  it('never lets the demo pilot start a game by itself', () => {
    const game = newGame();
    run(game, ATTRACT_TITLE_TICKS + ATTRACT_HIGH_SCORE_TICKS + ATTRACT_DEMO_TICKS);

    expect(isAttractPhase(game.state.phase)).toBe(true);
  });

  it('puts the demo player back on the field if the demo gets shot', () => {
    const game = newGame();
    run(game, 20);
    killPlayer(game);

    expect(game.state.phase).toBe('attractTitle');
    expect(game.state.world.player.alive).toBe(true);
    // A demo life costs nothing.
    expect(game.state.world.lives).toBe(DEFAULT_OPTIONS.lives);
  });
});

describe('starting a game', () => {
  it('opens a fresh battlefield with the cabinet lives and no score', () => {
    const game = newGame();
    run(game, 30);
    game.update(START);

    expect(game.state.phase).toBe('playing');
    expect(game.state.phaseTicks).toBe(0);
    expect(game.state.world.tick).toBe(0);
    expect(game.state.world.score).toBe(0);
    expect(game.state.world.lives).toBe(DEFAULT_OPTIONS.lives);
    expect(game.state.world.enemies).toHaveLength(0);
  });

  it('hands the real sticks to the player', () => {
    const game = play();
    const before = { ...game.state.world.player.pos };

    run(game, 5, { ...NEUTRAL_INPUT, leftTread: 1, rightTread: 1 });

    expect(game.state.world.player.pos).not.toEqual(before);
  });

  it('fires the player cannon on the trigger', () => {
    const game = play();
    const events = run(game, 1, FIRE);

    expect(events).toContainEqual({ type: 'playerFired' });
  });
});

describe('the death sequence', () => {
  it('freezes the game and starts the crack when the player is destroyed', () => {
    const game = play();
    run(game, 10);
    const events = killPlayer(game);

    expect(events.some((e) => e.type === 'playerDestroyed')).toBe(true);
    expect(game.state.phase).toBe('playerDead');
    // phaseTicks is what the renderer grows the crack from, and the ROM already
    // has one group up on the tick of the hit.
    expect(game.state.phaseTicks).toBe(0);
    expect(game.state.world.player.alive).toBe(false);
  });

  it('spends one of the reserve tanks', () => {
    const game = play();
    killPlayer(game);

    expect(game.state.world.lives).toBe(DEFAULT_OPTIONS.lives - 1);
  });

  it('holds the frozen world still while the crack spreads', () => {
    const game = play();
    run(game, 10);
    killPlayer(game);
    const frozen = game.state.world.tick;

    run(game, DEATH_SEQUENCE_TICKS - 2);

    expect(game.state.phase).toBe('playerDead');
    expect(game.state.world.tick).toBe(frozen);
  });

  it('puts the player back on the field once the sequence runs out', () => {
    const game = play();
    run(game, 10);
    killPlayer(game);

    expect(runUntilPhaseChanges(game)).toEqual({ phase: 'playing', ticks: DEATH_SEQUENCE_TICKS });
    expect(game.state.world.player.alive).toBe(true);
    expect(game.state.world.shells.every((s) => s.owner !== 'player')).toBe(true);
  });

  it('respawns somewhere else on the battlefield, facing anywhere', () => {
    const spots = new Set<string>();
    const headings = new Set<number>();

    for (let seed = 0; seed < 8; seed += 1) {
      const game = play(seed);
      run(game, 5);
      killPlayer(game);
      run(game, DEATH_SEQUENCE_TICKS);
      const { player } = game.state.world;
      spots.add(`${player.pos.x},${player.pos.z}`);
      headings.add(player.heading);
    }

    expect(spots.size).toBeGreaterThan(1);
    expect(headings.size).toBeGreaterThan(1);
  });

  it('lets a shell already in flight score from beyond the grave', () => {
    const game = play();
    const { world } = game.state;
    const enemy: Enemy = {
      id: 500,
      kind: 'tank',
      pos: { x: 0, z: 4000 },
      heading: Math.PI,
      y: 0,
      alive: true,
      state: 'approach',
      timer: 40,
    };
    world.enemies = [enemy];
    world.player.pos = { x: 0, z: 0 };
    world.player.heading = 0;
    // The player's shell is one tick short of the tank when the player is hit.
    world.shells.push({
      id: 700,
      owner: 'player',
      pos: { x: 0, z: 3000 },
      y: 0,
      heading: 0,
      ticksLeft: 5,
    });

    const death = killPlayer(game);
    expect(game.state.phase).toBe('playerDead');

    const events = [...death, ...run(game, 4)];
    expect(events.some((e) => e.type === 'enemyDestroyed')).toBe(true);
    expect(game.state.world.score).toBeGreaterThan(0);
  });

  it('waits for that shell before it respawns', () => {
    const game = play();
    game.state.world.shells.push({
      id: 701,
      owner: 'player',
      pos: { x: 0, z: 1000 },
      y: 0,
      heading: 0,
      // Long enough to outlast the crack.
      ticksLeft: DEATH_SEQUENCE_TICKS + 6,
    });
    killPlayer(game);

    run(game, DEATH_SEQUENCE_TICKS);

    expect(game.state.phase).toBe('playerDead');
    expect(runUntilPhaseChanges(game).phase).toBe('playing');
  });
});

describe('game over', () => {
  /** Kills the player until the reserve tanks run out. */
  function loseEveryLife(game: Game): GameEvent[] {
    const events: GameEvent[] = [];
    while (game.state.phase === 'playing' || game.state.phase === 'playerDead') {
      if (game.state.phase === 'playing') events.push(...killPlayer(game));
      else events.push(...game.update(NEUTRAL_INPUT));
    }
    return events;
  }

  it('shows GAME OVER over the battlefield when the last life goes', () => {
    const game = play();
    loseEveryLife(game);

    expect(game.state.phase).toBe('gameOver');
    expect(game.state.world.lives).toBe(0);
    expect(game.state.message).toBe('GAME OVER');
  });

  it('goes straight back to the high score table with nothing to show for it', () => {
    const game = play();
    loseEveryLife(game);

    expect(runUntilPhaseChanges(game)).toEqual({
      phase: 'attractHighScores',
      ticks: GAME_OVER_TICKS,
    });
    expect(game.state.message).toBeUndefined();
    // A fresh demo, not the wreck of the last game.
    expect(game.state.world.score).toBe(0);
    expect(game.state.world.player.alive).toBe(true);
  });

  it('asks for initials, with the fanfare, when the score made the table', () => {
    const game = play();
    game.state.world.score = 50000;
    loseEveryLife(game);
    const events = run(game, GAME_OVER_TICKS);

    expect(game.state.phase).toBe('highScoreEntry');
    expect(events).toContainEqual({ type: 'fanfare' });
    expect(game.state.entry).toEqual({ initials: 'A__', cursor: 0, score: 50000 });
  });

  it('runs the whole lifecycle from attract back to attract', () => {
    const game = newGame();
    const seen: GamePhase[] = [game.state.phase];
    const note = (): void => {
      if (seen[seen.length - 1] !== game.state.phase) seen.push(game.state.phase);
    };

    run(game, 20);
    game.update(START);
    note();
    game.state.world.score = 60000;
    loseEveryLife(game);
    note();
    run(game, GAME_OVER_TICKS);
    note();
    // Three letters, each committed with the trigger.
    for (let letter = 0; letter < INITIALS_LENGTH; letter += 1) game.update(FIRE);
    note();
    run(game, ATTRACT_HIGH_SCORE_TICKS);
    note();

    expect(seen).toEqual([
      'attractTitle',
      'playing',
      'gameOver',
      'highScoreEntry',
      'attractHighScores',
      'attractDemo',
    ]);
    expect(game.state.highScores[0]).toEqual({ initials: 'AAA', score: 60000 });
  });
});

describe('high score entry', () => {
  /** Loses every life on a qualifying score and waits for the entry screen. */
  function reachEntry(score = 50000): Game {
    const game = play();
    game.state.world.score = score;
    for (let tick = 0; tick < 512; tick += 1) {
      if (game.state.phase === 'highScoreEntry') return game;
      if (game.state.phase === 'playing') killPlayer(game);
      else game.update(NEUTRAL_INPUT);
    }
    throw new Error(`never reached the entry screen: ${game.state.phase}`);
  }

  it('steps the letter no faster than the ROM repeat delay', () => {
    const game = reachEntry();

    game.update(STICK(1));
    expect(game.state.entry?.initials[0]).toBe('B');

    // The next few ticks with the stick still over are ignored.
    run(game, INITIALS_REPEAT_TICKS - 1, STICK(1));
    expect(game.state.entry?.initials[0]).toBe('B');

    game.update(STICK(1));
    expect(game.state.entry?.initials[0]).toBe('C');
  });

  it('commits three letters and shows the table with the new entry in it', () => {
    const game = reachEntry();

    game.update(FIRE);
    game.update(STICK(1));
    game.update(FIRE);
    game.update(FIRE);

    expect(game.state.phase).toBe('attractHighScores');
    expect(game.state.entry).toBeUndefined();
    expect(game.state.highScores[0]).toEqual({ initials: 'ABA', score: 50000 });
    expect(game.state.highScores).toHaveLength(10);
    expect(game.state.highScores[9]!.score).toBe(DEFAULT_HIGH_SCORE);
  });

  it('stores whatever is on screen when the player walks away', () => {
    const game = reachEntry();
    run(game, HIGH_SCORE_ENTRY_TICKS);

    expect(game.state.phase).toBe('attractHighScores');
    expect(game.state.highScores[0]).toEqual({ initials: 'A__', score: 50000 });
  });

  it('asks the player to sign a score that only just made the table', () => {
    expect(reachEntry(DEFAULT_HIGH_SCORE + 1000).state.entry?.score).toBe(
      DEFAULT_HIGH_SCORE + 1000,
    );
  });
});

describe('audioSnapshot', () => {
  it('runs the engine only while a game is being played', () => {
    const game = newGame();
    expect(game.audioSnapshot().engineRunning).toBe(false);

    game.update(START);
    expect(game.audioSnapshot().engineRunning).toBe(true);

    killPlayer(game);
    expect(game.audioSnapshot().engineRunning).toBe(false);
  });

  it('revs for a pivot as well as a drive, as the ROM does', () => {
    const game = play();

    run(game, 1, { ...NEUTRAL_INPUT, leftTread: 1, rightTread: -1 });
    expect(game.state.world.player.moving).toBe(false);
    expect(game.audioSnapshot().moving).toBe(true);

    run(game, 1);
    expect(game.audioSnapshot().moving).toBe(false);
  });

  it('reports the live missile and how far away it is', () => {
    const game = play();
    expect(game.audioSnapshot().missileActive).toBe(false);
    expect(game.audioSnapshot().missileDistance).toBeNull();

    game.state.world.enemies = [
      {
        id: 1,
        kind: 'missile',
        pos: { x: 0, z: 2000 },
        heading: Math.PI,
        y: 400,
        alive: true,
        state: 'swoop',
        timer: 0,
      },
    ];

    expect(game.audioSnapshot().missileActive).toBe(true);
    expect(game.audioSnapshot().missileDistance).toBeGreaterThan(0);
  });

  it('reports the saucer and the range alert from the world', () => {
    const game = play();
    game.state.world.enemies = [
      {
        id: 2,
        kind: 'saucer',
        pos: { x: 500, z: 500 },
        heading: 0,
        y: 900,
        alive: true,
        state: 'hover',
        timer: 0,
      },
    ];
    game.state.world.enemyInRange = true;

    expect(game.audioSnapshot().saucerActive).toBe(true);
    expect(game.audioSnapshot().enemyInRange).toBe(true);
  });
});
