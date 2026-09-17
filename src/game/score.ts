/**
 * The score, and the bonus tanks it earns.
 *
 * The ROM keeps the score as four BCD digits in units of 1000 and prints a
 * literal "000" after them, so every score in the game is a multiple of 1000
 * (`HITS`, BZONE.MAC.txt:8329).  This module works in displayed points; the
 * `SCORE_*` constants are the per-kind unit values that `SCORE_UNIT` multiplies.
 *
 * `NEWLIF` (BZONE.MAC.txt:5011-5069) checks two awards on every score change: the
 * DIP-selected first threshold - 15000, 25000 or 50000, or nothing at all - which
 * gives one tank and four beeps, and a fixed 100000 "super bonus" which gives
 * another tank and the nine-note 1812 Overture instead.  There are no further
 * awards, which is why `World.nextBonusAt` ends up null.  The two sounds share a
 * POKEY channel in the original, so the events are deliberately exclusive: a
 * super bonus reports `fanfare` and no `extraLife`, even though it does add the
 * life.
 */

import {
  SCORE_MISSILE,
  SCORE_SAUCER,
  SCORE_SLOW_TANK,
  SCORE_SUPERTANK,
  SCORE_UNIT,
  SUPER_BONUS_SCORE,
} from '../data/constants';
import type { EnemyKind, GameEvent, World } from './types';

/** What each kind of enemy is worth, in displayed points. */
const POINTS: Record<EnemyKind, number> = {
  tank: SCORE_SLOW_TANK * SCORE_UNIT,
  missile: SCORE_MISSILE * SCORE_UNIT,
  supertank: SCORE_SUPERTANK * SCORE_UNIT,
  saucer: SCORE_SAUCER * SCORE_UNIT,
};

/** What destroying one of these is worth: 1000, 2000, 3000 or 5000 points. */
export function pointsFor(kind: EnemyKind): number {
  return POINTS[kind];
}

/**
 * Reads a packed BCD byte as the decimal number a player would see: `0x25` is
 * twenty-five, not thirty-seven.
 *
 * The ROM's score arithmetic runs in decimal mode (`SED`/`ADC`, BZONE.MAC.txt:
 * 4607-4637), so every score-shaped table byte - `BONTBL`, `MISLVL`, the missile's
 * `$25` swoop bias - is BCD, and any of them compared against a score in this
 * recreation has to come through here first.
 */
export function bcdToDecimal(byte: number): number {
  return (byte >> 4) * 10 + (byte & 0x0f);
}

/** The award after `threshold`: the super bonus, then nothing ever again. */
function bonusAfter(threshold: number): number | null {
  return threshold < SUPER_BONUS_SCORE ? SUPER_BONUS_SCORE : null;
}

/**
 * Adds `points` to the score and awards any bonus tanks that crosses.
 *
 * A single kill can cross both thresholds - the last shot of a 15000-point run
 * that lands on 100000 - so the awards are drained in a loop, in order.
 */
export function addScore(world: World, points: number): GameEvent[] {
  world.score += points;

  const events: GameEvent[] = [];
  while (world.nextBonusAt !== null && world.score >= world.nextBonusAt) {
    const threshold = world.nextBonusAt;
    world.nextBonusAt = bonusAfter(threshold);
    // A threshold of zero is the cabinet's "no bonus tank" setting, which the
    // fixed super bonus outlives.
    if (threshold <= 0) continue;
    world.lives += 1;
    events.push(threshold >= SUPER_BONUS_SCORE ? { type: 'fanfare' } : { type: 'extraLife' });
  }
  return events;
}
