import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  SCORE_SLOW_TANK,
  SCORE_UNIT,
  SUPER_BONUS_SCORE,
} from '../../src/data/constants';
import { addScore, pointsFor } from '../../src/game/score';
import type { GameEvent } from '../../src/game/types';
import { makeWorld } from './fixtures';

/** A world on the DIP defaults: the first bonus tank still to come. */
function scoring(score = 0) {
  const world = makeWorld();
  world.score = score;
  world.lives = 3;
  world.nextBonusAt = DEFAULT_OPTIONS.bonusThreshold;
  return world;
}

describe('pointsFor', () => {
  it('is the ROM table: tank 1000, missile 2000, supertank 3000, saucer 5000', () => {
    expect(pointsFor('tank')).toBe(1000);
    expect(pointsFor('missile')).toBe(2000);
    expect(pointsFor('supertank')).toBe(3000);
    expect(pointsFor('saucer')).toBe(5000);
  });
});

describe('addScore', () => {
  it('adds the points and says nothing when no threshold is crossed', () => {
    const world = scoring();
    expect(addScore(world, SCORE_SLOW_TANK * SCORE_UNIT)).toEqual([]);
    expect(world.score).toBe(1000);
    expect(world.lives).toBe(3);
  });

  it('awards the bonus tank on reaching the threshold, and only once', () => {
    const world = scoring(DEFAULT_OPTIONS.bonusThreshold - 1000);
    expect(addScore(world, 1000)).toEqual<GameEvent[]>([{ type: 'extraLife' }]);
    expect(world.lives).toBe(4);
    // The next award is the fixed super bonus, so scoring on does nothing more.
    expect(world.nextBonusAt).toBe(SUPER_BONUS_SCORE);
    expect(addScore(world, 5000)).toEqual([]);
    expect(addScore(world, 5000)).toEqual([]);
    expect(world.lives).toBe(4);
  });

  it('plays the fanfare instead of the beeps at the super bonus, and still awards the life', () => {
    const world = scoring(SUPER_BONUS_SCORE - 1000);
    world.nextBonusAt = SUPER_BONUS_SCORE;
    expect(addScore(world, 1000)).toEqual<GameEvent[]>([{ type: 'fanfare' }]);
    expect(world.lives).toBe(4);
    expect(world.nextBonusAt).toBeNull();
  });

  it('has no more bonuses after the super bonus', () => {
    const world = scoring(SUPER_BONUS_SCORE);
    world.nextBonusAt = null;
    expect(addScore(world, 50000)).toEqual([]);
    expect(world.lives).toBe(3);
  });

  it('awards both tanks when one kill crosses both thresholds', () => {
    const world = scoring(SUPER_BONUS_SCORE - 1000);
    expect(addScore(world, 1000)).toEqual<GameEvent[]>([
      { type: 'extraLife' },
      { type: 'fanfare' },
    ]);
    expect(world.lives).toBe(5);
    expect(world.nextBonusAt).toBeNull();
  });

  it('skips the first bonus when the cabinet has it switched off', () => {
    // BONTBL entry 0 disables the bonus tank; the fixed super bonus survives it.
    const world = scoring();
    world.nextBonusAt = 0;
    expect(addScore(world, 20000)).toEqual([]);
    expect(world.lives).toBe(3);
    expect(world.nextBonusAt).toBe(SUPER_BONUS_SCORE);
  });
});
