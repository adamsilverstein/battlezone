import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIGH_SCORE,
  DEFAULT_INITIALS,
  HSCNUM,
  INITIALS_LENGTH,
} from '../../src/data/constants';
import {
  HIGH_SCORES_STORAGE_KEY,
  INITIALS_ALPHABET,
  INITIALS_CURSOR,
  defaultHighScores,
  insertHighScore,
  loadHighScores,
  newInitialsEntry,
  qualifies,
  saveHighScores,
  updateInitialsEntry,
} from '../../src/game/highScores';
import type { HighScoreEntry } from '../../src/game/types';
import { NEUTRAL_INPUT, type InputState } from '../../src/input/types';

/** The two-method slice of `Storage` the module is handed, backed by a Map. */
function fakeStorage(seed?: Record<string, string>): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly items: Map<string, string>;
} {
  const items = new Map(Object.entries(seed ?? {}));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const entry = (initials: string, score: number): HighScoreEntry => ({ initials, score });

const stick = (rightTread: -1 | 0 | 1): InputState => ({ ...NEUTRAL_INPUT, rightTread });
const FIRE: InputState = { ...NEUTRAL_INPUT, fire: true, firePressed: true };

describe('defaultHighScores', () => {
  it('is the ROM power-on table: ten entries, all 5000', () => {
    const table = defaultHighScores();
    expect(table).toHaveLength(HSCNUM);
    expect(table.map((e) => e.initials)).toEqual([...DEFAULT_INITIALS]);
    expect(table.every((e) => e.score === DEFAULT_HIGH_SCORE)).toBe(true);
  });

  it('hands out a fresh copy each time', () => {
    const table = defaultHighScores();
    table[0]!.score = 99000;
    expect(defaultHighScores()[0]!.score).toBe(DEFAULT_HIGH_SCORE);
  });
});

describe('qualifies', () => {
  it('takes a score above the lowest entry', () => {
    expect(qualifies(defaultHighScores(), DEFAULT_HIGH_SCORE + 1000)).toBe(true);
  });

  it('turns away a score that only ties the lowest entry', () => {
    expect(qualifies(defaultHighScores(), DEFAULT_HIGH_SCORE)).toBe(false);
  });

  it('turns away a scoreless game even when the table has room', () => {
    expect(qualifies([], 0)).toBe(false);
  });

  it('takes anything while the table is short of its ten entries', () => {
    expect(qualifies([entry('ADS', 99000)], 1000)).toBe(true);
  });
});

describe('insertHighScore', () => {
  it('puts the score in its place and keeps the table ten long', () => {
    const table = insertHighScore(defaultHighScores(), entry('ADS', 6000));

    expect(table).toHaveLength(HSCNUM);
    expect(table[0]).toEqual(entry('ADS', 6000));
    expect(table[1]).toEqual(entry(DEFAULT_INITIALS[0]!, DEFAULT_HIGH_SCORE));
    // The tenth default entry is pushed off the bottom.
    expect(table.map((e) => e.initials)).not.toContain(DEFAULT_INITIALS[9]);
  });

  it('inserts above the entries it beats and below the ones it does not', () => {
    const table = insertHighScore(
      [entry('AAA', 30000), entry('BBB', 20000), entry('CCC', 10000)],
      entry('ADS', 20000),
    );

    expect(table.map((e) => e.initials)).toEqual(['AAA', 'BBB', 'ADS', 'CCC']);
  });

  it('leaves the table it was given alone', () => {
    const before = defaultHighScores();
    insertHighScore(before, entry('ADS', 999000));
    expect(before[0]!.initials).toBe(DEFAULT_INITIALS[0]);
  });
});

describe('loadHighScores', () => {
  it('starts from the ROM defaults when nothing is stored', () => {
    expect(loadHighScores(fakeStorage())).toEqual(defaultHighScores());
  });

  it('reads back what was saved', () => {
    const storage = fakeStorage();
    const table = insertHighScore(defaultHighScores(), entry('ADS', 42000));

    saveHighScores(storage, table);

    expect(storage.items.has(HIGH_SCORES_STORAGE_KEY)).toBe(true);
    expect(loadHighScores(storage)).toEqual(table);
  });

  it('falls back to the defaults on anything it cannot read', () => {
    for (const stored of ['', 'not json', '{}', '[]', '[{"initials":"ADS"}]', '[1,2,3]']) {
      const storage = fakeStorage({ [HIGH_SCORES_STORAGE_KEY]: stored });
      expect(loadHighScores(storage)).toEqual(defaultHighScores());
    }
  });

  it('survives a storage that throws, as a blocked or private one does', () => {
    const storage = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('denied');
      },
    };

    expect(loadHighScores(storage)).toEqual(defaultHighScores());
    expect(() => saveHighScores(storage, defaultHighScores())).not.toThrow();
  });

  it('keeps no more than ten entries, whatever was stored', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry('ADS', (20 - i) * 1000));
    const storage = fakeStorage({ [HIGH_SCORES_STORAGE_KEY]: JSON.stringify(many) });

    expect(loadHighScores(storage)).toHaveLength(HSCNUM);
  });

  it('tops a short table back up to ten from the ROM defaults', () => {
    const storage = fakeStorage({
      [HIGH_SCORES_STORAGE_KEY]: JSON.stringify([entry('ADS', 42000), entry('XYZ', 9000)]),
    });

    const table = loadHighScores(storage);

    expect(table).toHaveLength(HSCNUM);
    expect(table[0]).toEqual(entry('ADS', 42000));
    expect(table[1]).toEqual(entry('XYZ', 9000));
    // The rest are the power-on entries, so the tenth score is a real cutoff.
    expect(table[HSCNUM - 1]!.score).toBe(DEFAULT_HIGH_SCORE);
  });

  it('sorts what it read, so a jumbled store still reads best first', () => {
    const storage = fakeStorage({
      [HIGH_SCORES_STORAGE_KEY]: JSON.stringify([
        entry('LOW', 6000),
        entry('TOP', 99000),
        entry('MID', 20000),
      ]),
    });

    const scores = loadHighScores(storage).map((e) => e.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores[0]).toBe(99000);
  });

  it('refuses entries whose initials are the wrong length or whose score is negative', () => {
    for (const bad of [
      [{ initials: 'TOOLONG', score: 9000 }],
      [{ initials: 'AB', score: 9000 }],
      [{ initials: 'ADS', score: -1000 }],
    ]) {
      const storage = fakeStorage({ [HIGH_SCORES_STORAGE_KEY]: JSON.stringify(bad) });
      expect(loadHighScores(storage), JSON.stringify(bad)).toEqual(defaultHighScores());
    }
  });
});

describe('newInitialsEntry', () => {
  it("starts on an 'A' with the other two positions underlined", () => {
    expect(newInitialsEntry()).toEqual({
      initials: `A${INITIALS_CURSOR}${INITIALS_CURSOR}`,
      cursor: 0,
    });
  });
});

describe('updateInitialsEntry', () => {
  it('steps the current letter forward with the stick', () => {
    const stepped = updateInitialsEntry(newInitialsEntry(), stick(1));

    expect(stepped.initials[0]).toBe('B');
    expect(stepped.cursor).toBe(0);
    expect(stepped.done).toBe(false);
  });

  it('steps backwards from A round to the blank', () => {
    const stepped = updateInitialsEntry(newInitialsEntry(), stick(-1));

    expect(stepped.initials[0]).toBe(INITIALS_ALPHABET[INITIALS_ALPHABET.length - 1]);
  });

  it('wraps forward from the blank back to A', () => {
    const last = INITIALS_ALPHABET.length - 1;
    const stepped = updateInitialsEntry(
      { initials: `${INITIALS_ALPHABET[last]}__`, cursor: 0 },
      stick(1),
    );

    expect(stepped.initials[0]).toBe('A');
  });

  it('leaves the letter alone with the stick centred', () => {
    expect(updateInitialsEntry(newInitialsEntry(), NEUTRAL_INPUT).initials).toBe(
      newInitialsEntry().initials,
    );
  });

  it("commits a letter with fire and opens the next position on 'A'", () => {
    const committed = updateInitialsEntry({ initials: 'C__', cursor: 0 }, FIRE);

    expect(committed.initials).toBe(`CA${INITIALS_CURSOR}`);
    expect(committed.cursor).toBe(1);
    expect(committed.done).toBe(false);
  });

  it('is done once the third letter is committed', () => {
    const committed = updateInitialsEntry({ initials: 'ADS', cursor: INITIALS_LENGTH - 1 }, FIRE);

    expect(committed.initials).toBe('ADS');
    expect(committed.cursor).toBe(INITIALS_LENGTH);
    expect(committed.done).toBe(true);
  });

  it('spells out three letters over a scripted run of sticks and triggers', () => {
    let state = newInitialsEntry();
    const script: InputState[] = [
      stick(1), // A -> B
      FIRE,
      stick(1), // A -> B
      stick(1), // B -> C
      stick(1), // C -> D
      FIRE,
      stick(-1), // A -> blank
      stick(-1), // blank -> Z
      FIRE,
    ];

    let done = false;
    for (const input of script) ({ done, ...state } = updateInitialsEntry(state, input));

    expect(state.initials).toBe('BDZ');
    expect(done).toBe(true);
  });

  it('holds the whole alphabet: A to Z and one blank', () => {
    expect(INITIALS_ALPHABET).toHaveLength(27);
    expect(INITIALS_ALPHABET[0]).toBe('A');
    expect(INITIALS_ALPHABET[25]).toBe('Z');
    expect(INITIALS_ALPHABET[26]).toBe(' ');
  });
});
