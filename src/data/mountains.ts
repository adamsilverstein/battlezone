// GENERATED FILE - do not edit by hand.
// Produced by tools/gen_data.py, which decodes the original Atari Battlezone
// (1980) ROM images: vector ROMs 036421.01 ($3800) and 036422.01 ($3000) and
// program ROMs 036409.01-036414.02 ($5000-$7FFF).

//
// The horizon mountain range.  MTNS ($3006) is a table of eight JSRL words,
// one per 512-unit-wide segment; eight segments cover the full 360 degrees,
// so the range is a cyclic strip 4096 vector units wide.
//
// MOUNTS (BZONE.MAC.txt:2437) draws it like this:
//   H     = ((TANGLE << 8) | LANGLE) >> 4        the heading in 1/4096 turn
//   start = 512 + (H & 0x1FF)                    beam moved right from centre
//   HORIZN is drawn from there, 1536 units to the LEFT
//   then three consecutive segments are drawn left to right from that point,
//   beginning with segment index 7 - floor(H / 512).
//
// Solving that out gives the mapping used below: a feature at range coordinate
// R (0..4095) appears at screen x = wrap(R + H - 512), where wrap() folds the
// result into -2048..2047.  Only |x| < ~512 is on screen.
//
// Each segment is stored as polylines with y = 0 at the horizon and +Y up; the
// pen always returns to y = 0 and advances exactly 512 units in x.

import type { Picture2D } from './types';

/** Width of one mountain segment in vector units. */
export const SEGMENT_WIDTH = 512;
/** Number of segments in the range. */
export const SEGMENT_COUNT = 8;
/** Total width of the cyclic range: 4096 units == 360 degrees of heading. */
export const WRAP_WIDTH = SEGMENT_WIDTH * SEGMENT_COUNT;
/** Heading units per full turn in the 12-bit value MOUNTS uses. */
export const HEADING_UNITS = 4096;
/** Constant offset in the range-to-screen mapping (the 512-unit pre-shift). */
export const SCROLL_BIAS = 512;

/**
 * Screen x for a range coordinate at a given heading.
 *
 * @param rangeX  0..4095, the position along the cyclic mountain strip.
 * @param heading12  ((TANGLE << 8) | LANGLE) >> 4, i.e. 0..4095 for a full turn.
 */
export function rangeToScreenX(rangeX: number, heading12: number): number {
  const x = (((rangeX + heading12 - SCROLL_BIAS) % WRAP_WIDTH) + WRAP_WIDTH) % WRAP_WIDTH;
  return x >= WRAP_WIDTH / 2 ? x - WRAP_WIDTH : x;
}

/**
 * The eight segments, in range order.  Segment i occupies range coordinates
 * i * 512 .. i * 512 + 512.
 */
export const MOUNTAIN_SEGMENTS: readonly Picture2D[] = [
  {
    name: 'mtn0', // vector ROM $3016
    polylines: [
      [
        [0, 64],
        [32, 32],
      ],
      [
        [16, 24],
        [96, 64],
        [128, 64],
        [160, 32],
        [96, 64],
      ],
      [
        [96, 0],
        [224, 64],
        [288, 0],
      ],
      [
        [320, 0],
        [256, 32],
      ],
      [
        [224, 64],
        [288, 32],
        [352, 16],
        [448, 0],
      ],
      [
        [496, 160],
        [501, 148],
        [501, 136],
        [493, 124],
        [481, 112],
        [469, 109],
        [457, 112],
        [469, 103],
        [481, 100],
        [493, 103],
        [505, 112],
        [511, 124],
        [511, 136],
        [507, 148],
        [496, 160],
        [483, 163],
        [468, 159],
        [458, 151],
        [453, 140],
        [451, 127],
        [457, 112],
      ],
      [
        [484, 115],
        [484, 111],
        [490, 110],
        [496, 121],
        [492, 120],
        [491, 122],
      ],
      [
        [509, 142],
        [506, 139],
        [507, 142],
        [504, 143],
        [504, 149],
        [505, 150],
      ],
    ],
  },
  {
    name: 'mtn1', // vector ROM $30CA
    polylines: [
      [
        [32, 0],
        [96, 48],
        [128, 0],
      ],
      [
        [96, 48],
        [128, 32],
        [192, 64],
        [352, 0],
        [224, 32],
        [192, 64],
      ],
      [
        [128, 32],
        [224, 0],
      ],
      [
        [352, 0],
        [512, 32],
      ],
    ],
  },
  {
    name: 'mtn2', // vector ROM $3104
    polylines: [
      [
        [0, 32],
        [64, 32],
      ],
      [
        [64, 0],
        [0, 32],
      ],
      [
        [64, 32],
        [128, 64],
      ],
      [
        [64, 32],
        [160, 0],
        [192, 32],
        [128, 64],
        [160, 64],
        [192, 32],
        [224, 48],
        [256, 32],
        [160, 0],
      ],
      [
        [256, 32],
        [320, 64],
        [384, 32],
      ],
      [
        [288, 48],
        [320, 32],
        [352, 48],
      ],
      [
        [352, 0],
        [448, 8],
        [384, 32],
        [416, 48],
        [480, 32],
        [448, 8],
        [416, 48],
      ],
      [
        [480, 32],
        [512, 32],
      ],
    ],
  },
  {
    name: 'mtn3', // vector ROM $3182
    polylines: [
      [
        [0, 32],
        [64, 0],
      ],
      [
        [0, 32],
        [128, 0],
      ],
      [
        [288, 0],
        [384, 32],
        [416, 0],
      ],
      [
        [384, 32],
        [416, 64],
        [448, 0],
      ],
      [
        [480, 0],
        [416, 64],
      ],
      [
        [448, 32],
        [480, 64],
        [512, 32],
      ],
    ],
  },
  {
    name: 'mtn4', // vector ROM $31C4
    polylines: [
      [
        [0, 32],
        [64, 64],
        [96, 0],
      ],
      [
        [128, 0],
        [64, 64],
      ],
      [
        [96, 32],
        [128, 48],
        [224, 0],
      ],
      [
        [352, 0],
        [512, 32],
      ],
    ],
  },
  {
    name: 'mtn5', // vector ROM $31F2
    polylines: [
      [
        [0, 32],
        [64, 32],
        [288, 0],
        [256, 48],
        [192, 16],
      ],
      [
        [288, 0],
        [384, 64],
        [448, 24],
      ],
      [
        [432, 0],
        [496, 96],
        [499, 89],
        [504, 94],
        [507, 88],
        [512, 96],
      ],
    ],
  },
  {
    name: 'mtn6', // vector ROM $322E
    polylines: [
      [
        [0, 96],
        [64, 0],
        [160, 64],
        [224, 0],
      ],
      [
        [288, 0],
        [160, 64],
      ],
      [
        [224, 32],
        [288, 64],
        [416, 0],
      ],
      [
        [352, 32],
        [416, 48],
        [448, 0],
      ],
      [
        [416, 48],
        [512, 0],
      ],
    ],
  },
  {
    name: 'mtn7', // vector ROM $3268
    polylines: [
      [
        [192, 0],
        [416, 32],
        [480, 0],
      ],
      [
        [448, 16],
        [512, 64],
      ],
    ],
  },
];

/** The whole range as one picture, segments laid end to end from x = 0. */
export const MOUNTAIN_RANGE: Picture2D = {
  name: 'mountainRange',
  polylines: [
    [
      [0, 64],
      [32, 32],
    ], // mtn0
    [
      [16, 24],
      [96, 64],
      [128, 64],
      [160, 32],
      [96, 64],
    ], // mtn0
    [
      [96, 0],
      [224, 64],
      [288, 0],
    ], // mtn0
    [
      [320, 0],
      [256, 32],
    ], // mtn0
    [
      [224, 64],
      [288, 32],
      [352, 16],
      [448, 0],
    ], // mtn0
    [
      [496, 160],
      [501, 148],
      [501, 136],
      [493, 124],
      [481, 112],
      [469, 109],
      [457, 112],
      [469, 103],
      [481, 100],
      [493, 103],
      [505, 112],
      [511, 124],
      [511, 136],
      [507, 148],
      [496, 160],
      [483, 163],
      [468, 159],
      [458, 151],
      [453, 140],
      [451, 127],
      [457, 112],
    ], // mtn0
    [
      [484, 115],
      [484, 111],
      [490, 110],
      [496, 121],
      [492, 120],
      [491, 122],
    ], // mtn0
    [
      [509, 142],
      [506, 139],
      [507, 142],
      [504, 143],
      [504, 149],
      [505, 150],
    ], // mtn0
    [
      [544, 0],
      [608, 48],
      [640, 0],
    ], // mtn1
    [
      [608, 48],
      [640, 32],
      [704, 64],
      [864, 0],
      [736, 32],
      [704, 64],
    ], // mtn1
    [
      [640, 32],
      [736, 0],
    ], // mtn1
    [
      [864, 0],
      [1024, 32],
    ], // mtn1
    [
      [1024, 32],
      [1088, 32],
    ], // mtn2
    [
      [1088, 0],
      [1024, 32],
    ], // mtn2
    [
      [1088, 32],
      [1152, 64],
    ], // mtn2
    [
      [1088, 32],
      [1184, 0],
      [1216, 32],
      [1152, 64],
      [1184, 64],
      [1216, 32],
      [1248, 48],
      [1280, 32],
      [1184, 0],
    ], // mtn2
    [
      [1280, 32],
      [1344, 64],
      [1408, 32],
    ], // mtn2
    [
      [1312, 48],
      [1344, 32],
      [1376, 48],
    ], // mtn2
    [
      [1376, 0],
      [1472, 8],
      [1408, 32],
      [1440, 48],
      [1504, 32],
      [1472, 8],
      [1440, 48],
    ], // mtn2
    [
      [1504, 32],
      [1536, 32],
    ], // mtn2
    [
      [1536, 32],
      [1600, 0],
    ], // mtn3
    [
      [1536, 32],
      [1664, 0],
    ], // mtn3
    [
      [1824, 0],
      [1920, 32],
      [1952, 0],
    ], // mtn3
    [
      [1920, 32],
      [1952, 64],
      [1984, 0],
    ], // mtn3
    [
      [2016, 0],
      [1952, 64],
    ], // mtn3
    [
      [1984, 32],
      [2016, 64],
      [2048, 32],
    ], // mtn3
    [
      [2048, 32],
      [2112, 64],
      [2144, 0],
    ], // mtn4
    [
      [2176, 0],
      [2112, 64],
    ], // mtn4
    [
      [2144, 32],
      [2176, 48],
      [2272, 0],
    ], // mtn4
    [
      [2400, 0],
      [2560, 32],
    ], // mtn4
    [
      [2560, 32],
      [2624, 32],
      [2848, 0],
      [2816, 48],
      [2752, 16],
    ], // mtn5
    [
      [2848, 0],
      [2944, 64],
      [3008, 24],
    ], // mtn5
    [
      [2992, 0],
      [3056, 96],
      [3059, 89],
      [3064, 94],
      [3067, 88],
      [3072, 96],
    ], // mtn5
    [
      [3072, 96],
      [3136, 0],
      [3232, 64],
      [3296, 0],
    ], // mtn6
    [
      [3360, 0],
      [3232, 64],
    ], // mtn6
    [
      [3296, 32],
      [3360, 64],
      [3488, 0],
    ], // mtn6
    [
      [3424, 32],
      [3488, 48],
      [3520, 0],
    ], // mtn6
    [
      [3488, 48],
      [3584, 0],
    ], // mtn6
    [
      [3776, 0],
      [4000, 32],
      [4064, 0],
    ], // mtn7
    [
      [4032, 16],
      [4096, 64],
    ], // mtn7
  ],
};
