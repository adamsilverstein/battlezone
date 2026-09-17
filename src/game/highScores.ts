/**
 * The ten-entry high score table, its persistence and the initials editor.
 *
 * THE TABLE
 * ---------
 * `HSCNUM` is 10 and `PWRON` fills it with ten 5000-point entries whose initials
 * come from `FDGTBL` - `EDR MPH JED DES TKE VKB "EL " HAD ORR GJR`, the seventh
 * really ending in a space (docs/reference/atari-source-notes.md, "High scores and
 * initial entry").  `CKSCOR` finds the insertion point at game over, shuffles the
 * lower entries down and writes the new score in, which is `insertHighScore`.
 *
 * ENTRY
 * -----
 * `CKSCOR` initialises the three characters to 'A' and two underline glyphs, and
 * `LETCHK` reads the **right-hand** controller: one bit steps the letter forward
 * through 'A'..'Z' plus one blank, the other back, wrapping at both ends, with a
 * four-tick repeat delay in `LTIMER`; the fire button commits the letter and sets
 * the next one to 'A' (BZONE.MAC.txt:1817-1869).  `SW`'s claim that the left stick
 * does it is wrong - the ROM's own on-screen line says right hand controller.
 *
 * `updateInitialsEntry` is a pure function of the entry and one `InputState`, so
 * the four-tick repeat delay is **not** here: it is timing, and the game state
 * machine owns it - it simply withholds the stick until `LTIMER` has run down.
 *
 * PERSISTENCE
 * -----------
 * The cabinet kept the table in battery-backed RAM, so this recreation keeps it in
 * `localStorage`.  Nothing in `src/game` may touch the DOM, so the storage is
 * injected: `main.ts` hands in `window.localStorage` and the tests a Map.  Every
 * access is guarded, because a private window or blocked site data makes both
 * methods throw, and anything unreadable falls back to the ROM's own defaults.
 */

import {
  DEFAULT_HIGH_SCORE,
  DEFAULT_INITIALS,
  HSCNUM,
  INITIALS_FIRST_CODE,
  INITIALS_LAST_CODE,
  INITIALS_LENGTH,
  INITIALS_UNDERLINE_CODE,
} from '../data/constants';
import { CHAR_CODES } from '../data/font';
import type { InputState } from '../input/types';
import type { HighScoreEntry } from './types';

/** Where the table lives between sessions. */
export const HIGH_SCORES_STORAGE_KEY = 'battlezone.highScores';

/** The two methods of `Storage` this module uses; `main.ts` passes `localStorage`. */
export type HighScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** A character byte as the ROM's font decodes it. */
function charAt(code: number): string {
  const char = CHAR_CODES[code];
  if (char === undefined) throw new Error(`highScores: no character for byte ${code}`);
  return char;
}

/**
 * The letters `LETCHK` cycles through: character bytes `$16`..`$4A`, which decode
 * to 'A'..'Z' and the second blank the player can pick.
 */
export const INITIALS_ALPHABET: readonly string[] = Array.from(
  { length: (INITIALS_LAST_CODE - INITIALS_FIRST_CODE) / 2 + 1 },
  (_, i) => charAt(INITIALS_FIRST_CODE + i * 2),
);

/** The underline glyph shown at a position that has not been reached yet. */
export const INITIALS_CURSOR = charAt(INITIALS_UNDERLINE_CODE);

/** The first letter of the alphabet, which every fresh position starts on. */
const FIRST_LETTER = INITIALS_ALPHABET[0]!;

/** The ROM's power-on table: ten 5000-point entries with the factory initials. */
export function defaultHighScores(): HighScoreEntry[] {
  return DEFAULT_INITIALS.map((initials) => ({ initials, score: DEFAULT_HIGH_SCORE }));
}

/** The lowest score in the table, or 0 while it is short of `HSCNUM` entries. */
function cutoff(entries: readonly HighScoreEntry[]): number {
  if (entries.length < HSCNUM) return 0;
  return Math.min(...entries.map((e) => e.score));
}

/**
 * Whether a score makes the table.  A score has to *beat* the bottom entry, not
 * merely tie it, so the ten 5000s a fresh machine shows cannot be displaced by
 * another 5000; a scoreless game never qualifies however much room there is.
 */
export function qualifies(entries: readonly HighScoreEntry[], score: number): boolean {
  return score > 0 && score > cutoff(entries);
}

/**
 * Inserts an entry above the first one it beats and drops whatever falls off the
 * bottom, leaving the table it was given untouched.
 */
export function insertHighScore(
  entries: readonly HighScoreEntry[],
  entry: HighScoreEntry,
): HighScoreEntry[] {
  const at = entries.findIndex((existing) => entry.score > existing.score);
  const inserted =
    at === -1
      ? [...entries, { ...entry }]
      : [...entries.slice(0, at), { ...entry }, ...entries.slice(at)];
  return inserted.slice(0, HSCNUM);
}

/**
 * Whether a parsed value is a table entry: three characters of initials and a
 * score that is a real, non-negative number.  Anything else was not written by
 * this game - a hand-edited store, a half-finished write, a different version -
 * and is not worth guessing at.
 */
function isEntry(value: unknown): value is HighScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const { initials, score } = value as Partial<HighScoreEntry>;
  return (
    typeof initials === 'string' &&
    initials.length === INITIALS_LENGTH &&
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= 0
  );
}

/**
 * The stored table, or the ROM defaults if there is nothing sound to read.
 *
 * What comes back is always a full `HSCNUM` rows, sorted best first: the table is
 * ten entries in the ROM whatever has been played, and a short store - an older
 * version, a partial write - is topped up from the power-on table rather than
 * leaving the display with gaps and `qualifies` with a zero cutoff.
 */
export function loadHighScores(storage: HighScoreStorage): HighScoreEntry[] {
  let parsed: unknown;
  try {
    const stored = storage.getItem(HIGH_SCORES_STORAGE_KEY);
    if (stored === null) return defaultHighScores();
    parsed = JSON.parse(stored);
  } catch {
    return defaultHighScores();
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isEntry)) {
    return defaultHighScores();
  }

  const stored = parsed.slice(0, HSCNUM).map(({ initials, score }) => ({ initials, score }));
  const padded = [...stored, ...defaultHighScores()].slice(0, HSCNUM);
  return padded.sort((a, b) => b.score - a.score);
}

/** Writes the table back, ignoring a storage that will not have it. */
export function saveHighScores(
  storage: HighScoreStorage,
  entries: readonly HighScoreEntry[],
): void {
  try {
    storage.setItem(HIGH_SCORES_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A blocked or full store is not worth interrupting a game for.
  }
}

/** A fresh entry: an 'A' under the cursor and underlines for the other two. */
export function newInitialsEntry(): { initials: string; cursor: number } {
  return {
    initials: FIRST_LETTER + INITIALS_CURSOR.repeat(INITIALS_LENGTH - 1),
    cursor: 0,
  };
}

/** The alphabet index of a character, treating anything unknown as the first. */
function letterIndex(char: string | undefined): number {
  const at = char === undefined ? -1 : INITIALS_ALPHABET.indexOf(char);
  return at === -1 ? 0 : at;
}

/** Replaces one character of a fixed-length string. */
function withChar(text: string, at: number, char: string): string {
  return text.slice(0, at) + char + text.slice(at + 1);
}

/**
 * One tick of the initials editor: the stick steps the letter under the cursor and
 * the fire button commits it.
 *
 * `done` is true on the tick the third letter is committed, and the cursor then
 * sits one past the end - there is nothing left to edit, and the state machine
 * stores what it has.
 */
export function updateInitialsEntry(
  entry: { initials: string; cursor: number },
  input: InputState,
): { initials: string; cursor: number; done: boolean } {
  const { cursor } = entry;
  let { initials } = entry;

  if (input.rightTread !== 0) {
    const size = INITIALS_ALPHABET.length;
    const next = (letterIndex(initials[cursor]) + input.rightTread + size) % size;
    initials = withChar(initials, cursor, INITIALS_ALPHABET[next]!);
  }

  if (!input.firePressed) return { initials, cursor, done: false };

  const at = cursor + 1;
  if (at >= INITIALS_LENGTH) return { initials, cursor: at, done: true };
  // The ROM opens every fresh position on an 'A'.
  return { initials: withChar(initials, at, FIRST_LETTER), cursor: at, done: false };
}
