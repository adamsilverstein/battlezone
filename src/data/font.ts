// GENERATED FILE - do not edit by hand.
// Produced by tools/gen_data.py, which decodes the original Atari Battlezone
// (1980) ROM images: vector ROMs 036421.01 ($3800) and 036422.01 ($3000) and
// program ROMs 036409.01-036414.02 ($5000-$7FFF).

//
// The font lives in the vector ROM.  VGMSGA ($33F0) is a table of 41 JSRL
// instructions, one per glyph; a message byte is 2 * the glyph index, and the
// top bit of the byte marks the end of a string (MSGS, BZONE.MAC.txt:8109).
// Glyph 0 is a blank, 1..10 are '0'..'9' (VGHEX in VGUT.MAC maps digit d to
// index d + 1), 11..36 are 'A'..'Z', 37 is a second blank (the space the
// player can pick when entering initials), 38 is the underline, and 39/40 are
// the copyright and phonogram symbols (see ./pictures.ts).
//
// '0' shares its glyph with 'O' and '5' shares its glyph with 'S'.

import type { Glyph } from './types';

/** Glyph cell width in vector units (all strokes fall in x = 0..16). */
export const CELL_WIDTH = 16;
/** Glyph cell height in vector units (all strokes fall in y = 0..24). */
export const CELL_HEIGHT = 24;
/** Horizontal advance per character; every glyph in the ROM advances by 24. */
export const CELL_ADVANCE = 24;

/**
 * Every character the original vector font contains.  There is no lower case,
 * no punctuation other than the underline, and no digits beyond 0-9.
 */
export const FONT: Record<string, Glyph> = {
  // glyph index 0 (message byte 0x00) at $3326
  ' ': {
    polylines: [],
    advance: 24,
  },
  // glyph index 1 (message byte 0x02) at $331E
  '0': {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 0],
        [0, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 2 (message byte 0x04) at $339E
  '1': {
    polylines: [
      [
        [8, 24],
        [8, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 3 (message byte 0x06) at $33A2
  '2': {
    polylines: [
      [
        [0, 24],
        [16, 24],
        [16, 12],
        [0, 12],
        [0, 0],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 4 (message byte 0x08) at $33B2
  '3': {
    polylines: [
      [
        [0, 24],
        [16, 24],
        [16, 0],
        [0, 0],
      ],
      [
        [0, 12],
        [16, 12],
      ],
    ],
    advance: 24,
  },
  // glyph index 5 (message byte 0x0A) at $33C2
  '4': {
    polylines: [
      [
        [0, 24],
        [0, 12],
        [16, 12],
      ],
      [
        [16, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 6 (message byte 0x0C) at $3352
  '5': {
    polylines: [
      [
        [0, 0],
        [16, 0],
        [16, 12],
        [0, 12],
        [0, 24],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 7 (message byte 0x0E) at $33CC
  '6': {
    polylines: [
      [
        [0, 12],
        [16, 12],
        [16, 0],
        [0, 0],
        [0, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 8 (message byte 0x10) at $33DA
  '7': {
    polylines: [
      [
        [0, 24],
        [16, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 9 (message byte 0x12) at $33E4
  '8': {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 0],
        [0, 0],
      ],
      [
        [0, 12],
        [16, 12],
      ],
    ],
    advance: 24,
  },
  // glyph index 10 (message byte 0x14) at $33E8
  '9': {
    polylines: [
      [
        [16, 12],
        [0, 12],
        [0, 24],
        [16, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 11 (message byte 0x16) at $3282
  A: {
    polylines: [
      [
        [0, 0],
        [0, 16],
        [8, 24],
        [16, 16],
        [16, 0],
      ],
      [
        [0, 8],
        [16, 8],
      ],
    ],
    advance: 24,
  },
  // glyph index 12 (message byte 0x18) at $3292
  B: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [12, 24],
        [16, 20],
        [16, 16],
        [12, 12],
        [0, 12],
      ],
      [
        [12, 12],
        [16, 8],
        [16, 4],
        [12, 0],
        [0, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 13 (message byte 0x1A) at $32AA
  C: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
      ],
      [
        [0, 0],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 14 (message byte 0x1C) at $32B2
  D: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [8, 24],
        [16, 16],
        [16, 8],
        [8, 0],
        [0, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 15 (message byte 0x1E) at $32C0
  E: {
    polylines: [
      [
        [0, 0],
        [16, 0],
      ],
      [
        [0, 0],
        [0, 24],
        [16, 24],
      ],
      [
        [12, 12],
        [0, 12],
      ],
    ],
    advance: 24,
  },
  // glyph index 16 (message byte 0x20) at $32C4
  F: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
      ],
      [
        [12, 12],
        [0, 12],
      ],
    ],
    advance: 24,
  },
  // glyph index 17 (message byte 0x22) at $32D0
  G: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 16],
      ],
      [
        [8, 8],
        [16, 8],
        [16, 0],
        [0, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 18 (message byte 0x24) at $32DE
  H: {
    polylines: [
      [
        [0, 0],
        [0, 24],
      ],
      [
        [0, 12],
        [16, 12],
      ],
      [
        [16, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 19 (message byte 0x26) at $32E8
  I: {
    polylines: [
      [
        [0, 0],
        [16, 0],
      ],
      [
        [0, 24],
        [16, 24],
      ],
      [
        [8, 24],
        [8, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 20 (message byte 0x28) at $32F6
  J: {
    polylines: [
      [
        [0, 8],
        [8, 0],
        [16, 0],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 21 (message byte 0x2A) at $32FE
  K: {
    polylines: [
      [
        [0, 0],
        [0, 24],
      ],
      [
        [12, 24],
        [0, 12],
        [12, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 22 (message byte 0x2C) at $330A
  L: {
    polylines: [
      [
        [0, 24],
        [0, 0],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 23 (message byte 0x2E) at $3310
  M: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [8, 16],
        [16, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 24 (message byte 0x30) at $3318
  N: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 0],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 25 (message byte 0x32) at $331E
  O: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 0],
        [0, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 26 (message byte 0x34) at $332A
  P: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 12],
        [0, 12],
      ],
    ],
    advance: 24,
  },
  // glyph index 27 (message byte 0x36) at $3334
  Q: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 8],
        [8, 0],
        [0, 0],
      ],
      [
        [8, 8],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 28 (message byte 0x38) at $3344
  R: {
    polylines: [
      [
        [0, 0],
        [0, 24],
        [16, 24],
        [16, 12],
        [0, 12],
      ],
      [
        [4, 12],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 29 (message byte 0x3A) at $3352
  S: {
    polylines: [
      [
        [0, 0],
        [16, 0],
        [16, 12],
        [0, 12],
        [0, 24],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 30 (message byte 0x3C) at $335E
  T: {
    polylines: [
      [
        [0, 24],
        [16, 24],
      ],
      [
        [8, 24],
        [8, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 31 (message byte 0x3E) at $3362
  U: {
    polylines: [
      [
        [0, 24],
        [0, 0],
        [16, 0],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 32 (message byte 0x40) at $336E
  V: {
    polylines: [
      [
        [0, 24],
        [8, 0],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 33 (message byte 0x42) at $3376
  W: {
    polylines: [
      [
        [0, 24],
        [0, 0],
        [8, 8],
        [16, 0],
        [16, 24],
      ],
    ],
    advance: 24,
  },
  // glyph index 34 (message byte 0x44) at $3380
  X: {
    polylines: [
      [
        [0, 0],
        [16, 24],
      ],
      [
        [0, 24],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 35 (message byte 0x46) at $3388
  Y: {
    polylines: [
      [
        [8, 0],
        [8, 16],
        [0, 24],
      ],
      [
        [16, 24],
        [8, 16],
      ],
    ],
    advance: 24,
  },
  // glyph index 36 (message byte 0x48) at $3396
  Z: {
    polylines: [
      [
        [0, 24],
        [16, 24],
        [0, 0],
        [16, 0],
      ],
    ],
    advance: 24,
  },
  // glyph index 38 (message byte 0x4C) at $33AC
  _: {
    polylines: [
      [
        [0, 0],
        [16, 0],
      ],
    ],
    advance: 24,
  },
};

/** Message byte -> character, for decoding the original string tables. */
export const CHAR_CODES: Record<number, string> = {
  0x00: ' ',
  0x02: '0',
  0x04: '1',
  0x06: '2',
  0x08: '3',
  0x0a: '4',
  0x0c: '5',
  0x0e: '6',
  0x10: '7',
  0x12: '8',
  0x14: '9',
  0x16: 'A',
  0x18: 'B',
  0x1a: 'C',
  0x1c: 'D',
  0x1e: 'E',
  0x20: 'F',
  0x22: 'G',
  0x24: 'H',
  0x26: 'I',
  0x28: 'J',
  0x2a: 'K',
  0x2c: 'L',
  0x2e: 'M',
  0x30: 'N',
  0x32: 'O',
  0x34: 'P',
  0x36: 'Q',
  0x38: 'R',
  0x3a: 'S',
  0x3c: 'T',
  0x3e: 'U',
  0x40: 'V',
  0x42: 'W',
  0x44: 'X',
  0x46: 'Y',
  0x48: 'Z',
  0x4c: '_',
  0x4a: ' ', // second blank, selectable when entering initials
};
