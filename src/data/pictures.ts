// GENERATED FILE - do not edit by hand.
// Produced by tools/gen_data.py, which decodes the original Atari Battlezone
// (1980) ROM images: vector ROMs 036421.01 ($3800) and 036422.01 ($3000) and
// program ROMs 036409.01-036414.02 ($5000-$7FFF).

//
// 2D screen-space pictures from the vector ROM.  All coordinates are in vector
// units with +X right and +Y up, relative to the point at which the picture is
// invoked; the pictures that start with a CNTR instruction are relative to the
// centre of the screen, which is noted below.

import type { Picture2D } from './types';

/**
 * XCROSS - the gunsight when nothing is locked on: a vertical tick above and below plus two square brackets.
 * Drawn at intensity 3.
 *
 * Vector ROM $34CC. Stroke intensities: [3, 3, 3, 3].
 * Begins with CNTR, so its coordinates are screen-centre relative.
 */
export const RETICLE_NORMAL: Picture2D = {
  name: 'reticleNormal',
  polylines: [
    [
      [0, -175],
      [0, -75],
    ],
    [
      [-75, -50],
      [-75, -75],
      [75, -75],
      [75, -50],
    ],
    [
      [75, 50],
      [75, 75],
      [-75, 75],
      [-75, 50],
    ],
    [
      [0, 75],
      [0, 175],
    ],
  ],
};

/**
 * XCROS1 - the gunsight when the enemy is in the sights: the brackets splay outward into corners and the intensity jumps to 7 (the short stubs stay at 3).
 *
 * Vector ROM $3500. Stroke intensities: [7, 7, 7, 3].
 * Begins with CNTR, so its coordinates are screen-centre relative.
 */
export const RETICLE_LOCKED: Picture2D = {
  name: 'reticleLocked',
  polylines: [
    [
      [0, -175],
      [0, -75],
      [0, -35],
    ],
    [
      [-35, -35],
      [-75, -75],
      [75, -75],
      [35, -35],
    ],
    [
      [35, 35],
      [75, 75],
      [-75, 75],
      [-35, 35],
    ],
    [
      [0, 35],
      [0, 75],
      [0, 175],
    ],
  ],
};

/**
 * RDRING - the radar: four tick marks at the compass points of a circle that is never actually drawn, plus the V-shaped field-of-view wedge (intensity 5).
 * The sweep line and the enemy blip are built at run time by DRADAR.
 *
 * Vector ROM $353C. Stroke intensities: [7, 7, 7, 5, 7, 5].
 * Begins with CNTR, so its coordinates are screen-centre relative.
 */
export const RADAR: Picture2D = {
  name: 'radar',
  polylines: [
    [
      [68, 316],
      [60, 316],
    ],
    [
      [0, 256],
      [0, 248],
    ],
    [
      [-60, 316],
      [-68, 316],
    ],
    [
      [0, 316],
      [-36, 368],
    ],
    [
      [0, 376],
      [0, 384],
    ],
    [
      [36, 368],
      [0, 316],
    ],
  ],
};

/**
 * HORIZN - the horizon line: one 1536-unit vector drawn right to left, exactly three mountain segments wide.
 *
 * Vector ROM $3000. Stroke intensities: [3].
 */
export const HORIZON: Picture2D = {
  name: 'horizon',
  polylines: [
    [
      [0, 0],
      [-1536, 0],
    ],
  ],
};

/**
 * CPYRIT - the circled C of the copyright notice (font glyph 39, byte 0x4E).
 *
 * Vector ROM $3454. Stroke intensities: [6, 6].
 */
export const COPYRIGHT: Picture2D = {
  name: 'copyright',
  polylines: [
    [
      [0, 4],
      [0, 20],
      [8, 24],
      [16, 20],
      [16, 4],
      [8, 0],
      [0, 4],
    ],
    [
      [11, 5],
      [5, 5],
      [5, 19],
      [11, 19],
    ],
  ],
};

/**
 * PNTNT - the circled P that follows it (font glyph 40, byte 0x50).
 *
 * Vector ROM $3466. Stroke intensities: [6, 6].
 */
export const PHONOGRAM: Picture2D = {
  name: 'phonogram',
  polylines: [
    [
      [0, 4],
      [0, 20],
      [8, 24],
      [16, 20],
      [16, 4],
      [8, 0],
      [0, 4],
    ],
    [
      [5, 5],
      [5, 19],
      [11, 19],
      [11, 13],
      [5, 13],
    ],
  ],
};

/**
 * TANKS - the little side-on tank drawn once per reserve life, and once per
 * 1000 points beside each high score.
 *
 * Vector ROM $3568. TSYMBL ($3590) is a bare JSRL word that INFO
 * (BZONE.MAC.txt:8275) copies straight into the display list, once per life.
 * Stroke intensities: [6, 6].
 */
export const LIVES_TANK: Picture2D = {
  name: 'livesTank',
  polylines: [
    [
      [0, 0],
      [-6, 6],
      [3, 9],
      [6, 15],
      [42, 6],
      [36, 0],
      [0, 0],
    ],
    [
      [18, 12],
      [39, 12],
      [39, 9],
      [30, 9],
    ],
  ],
};

/**
 * EXPIC - the shell-impact / distant-explosion picture: ten dots, drawn as
 * zero-length lit vectors at intensity 7.  DRAW's TSPCL command scales it
 * with SCAL from the object's orientation byte (BZONE.MAC.txt:3805).
 *
 * Vector ROM $347A.  Each entry here is a one-point polyline (a dot).
 */
export const EXPLOSION_DOTS: Picture2D = {
  name: 'explosionDots',
  polylines: [
    [[-64, 0]],
    [[-128, -64]],
    [[-64, -128]],
    [[32, -96]],
    [[96, -128]],
    [[96, -64]],
    [[128, 32]],
    [[96, 128]],
    [[-32, 96]],
    [[-128, 128]],
  ],
};

/**
 * The cracked screen drawn when the player is killed.  CRACKS ($36F8) is a
 * list of eight JSRL words; WNSHLD (BZONE.MAC.txt:1231) copies the first
 * CRACK/2 of them into the display list each tick, so the crack grows one
 * group per tick for eight ticks and then holds.
 *
 * Group 0 begins with CNTR (screen-centre relative); groups 1-7 continue
 * from wherever the previous group left the beam, so they must be drawn in
 * order, accumulating the pen position.
 */
export const SCREEN_CRACK_GROUPS: readonly Picture2D[] = [
  {
    name: 'screenCrack0', // vector ROM $3592
    polylines: [
      [
        [-100, 50],
        [-175, 50],
      ],
      [
        [-140, -50],
        [-100, 50],
        [-200, 150],
      ],
      [
        [50, 175],
        [-100, 50],
        [0, 0],
      ],
    ],
  },
  {
    name: 'screenCrack1', // vector ROM $35B6
    polylines: [
      [
        [0, 0],
        [80, 0],
      ],
      [
        [-140, -50],
        [-75, -100],
      ],
      [
        [-175, 50],
        [-175, 5],
      ],
      [
        [-200, 150],
        [-350, 195],
      ],
      [
        [-125, 225],
        [-200, 150],
      ],
      [
        [50, 175],
        [60, 270],
      ],
      [
        [50, 175],
        [150, 235],
      ],
    ],
  },
  {
    name: 'screenCrack2', // vector ROM $35EC
    polylines: [
      [
        [0, 0],
        [100, 60],
      ],
      [
        [0, 105],
        [0, 0],
      ],
      [
        [-275, -10],
        [-380, 85],
      ],
      [
        [-500, -40],
        [-550, -30],
      ],
      [
        [-500, -40],
        [-630, -160],
      ],
      [
        [-325, -230],
        [-415, -235],
      ],
      [
        [-225, -335],
        [-180, -475],
      ],
      [
        [-70, -235],
        [-70, -275],
      ],
    ],
  },
  {
    name: 'screenCrack3', // vector ROM $362A
    polylines: [
      [
        [0, 0],
        [105, 0],
      ],
      [
        [-110, -200],
        [-190, -350],
      ],
      [
        [-345, 40],
        [-345, -10],
      ],
      [
        [-345, 40],
        [-430, 65],
      ],
      [
        [-310, 360],
        [-430, 475],
      ],
      [
        [-255, 490],
        [-310, 360],
      ],
      [
        [170, 335],
        [240, 335],
      ],
      [
        [45, 440],
        [70, 380],
        [145, 465],
      ],
    ],
  },
  {
    name: 'screenCrack4', // vector ROM $366C
    polylines: [
      [
        [0, 0],
        [-15, 65],
      ],
      [
        [35, 25],
        [0, 0],
      ],
      [
        [-40, -465],
        [65, -365],
      ],
      [
        [-15, -525],
        [-40, -465],
        [-50, -525],
      ],
      [
        [-300, -875],
        [-335, -815],
        [-375, -875],
      ],
      [
        [-490, -475],
        [-525, -505],
      ],
    ],
  },
  {
    name: 'screenCrack5', // vector ROM $36A2
    polylines: [
      [
        [0, 0],
        [50, -70],
      ],
      [
        [-50, -40],
        [0, 0],
      ],
      [
        [475, -20],
        [425, -70],
      ],
      [
        [560, 530],
        [575, 480],
      ],
      [
        [590, 140],
        [685, 30],
      ],
    ],
  },
  {
    name: 'screenCrack6', // vector ROM $36C8
    polylines: [
      [
        [0, 0],
        [115, 75],
      ],
      [
        [25, -40],
        [0, 0],
      ],
      [
        [-735, -70],
        [-800, -85],
      ],
    ],
  },
  {
    name: 'screenCrack7', // vector ROM $36DE
    polylines: [
      [
        [0, 0],
        [-85, 45],
      ],
      [
        [-35, -50],
        [0, 0],
      ],
      [
        [855, -15],
        [825, 45],
        [905, 75],
      ],
    ],
  },
];

/** All eight crack groups in one picture, pen position accumulated. */
export const SCREEN_CRACK_FULL: Picture2D = {
  name: 'screenCrackFull',
  polylines: [
    [
      [-100, 50],
      [-175, 50],
    ],
    [
      [-140, -50],
      [-100, 50],
      [-200, 150],
    ],
    [
      [50, 175],
      [-100, 50],
      [0, 0],
      [80, 0],
    ],
    [
      [-140, -50],
      [-75, -100],
    ],
    [
      [-175, 50],
      [-175, 5],
    ],
    [
      [-200, 150],
      [-350, 195],
    ],
    [
      [-125, 225],
      [-200, 150],
    ],
    [
      [50, 175],
      [60, 270],
    ],
    [
      [50, 175],
      [150, 235],
      [250, 295],
    ],
    [
      [150, 340],
      [150, 235],
    ],
    [
      [-125, 225],
      [-230, 320],
    ],
    [
      [-350, 195],
      [-400, 205],
    ],
    [
      [-350, 195],
      [-480, 75],
    ],
    [
      [-175, 5],
      [-265, 0],
    ],
    [
      [-75, -100],
      [-30, -240],
    ],
    [
      [80, 0],
      [80, -40],
      [185, -40],
    ],
    [
      [-30, -240],
      [-110, -390],
    ],
    [
      [-265, 0],
      [-265, -50],
    ],
    [
      [-265, 0],
      [-350, 25],
    ],
    [
      [-230, 320],
      [-350, 435],
    ],
    [
      [-175, 450],
      [-230, 320],
    ],
    [
      [250, 295],
      [320, 295],
    ],
    [
      [125, 400],
      [150, 340],
      [225, 425],
      [210, 490],
    ],
    [
      [260, 450],
      [225, 425],
    ],
    [
      [185, -40],
      [290, 60],
    ],
    [
      [210, -100],
      [185, -40],
      [175, -100],
    ],
    [
      [-75, -450],
      [-110, -390],
      [-150, -450],
    ],
    [
      [-265, -50],
      [-300, -80],
      [-250, -150],
    ],
    [
      [-350, -120],
      [-300, -80],
    ],
    [
      [175, -100],
      [125, -150],
    ],
    [
      [260, 450],
      [275, 400],
    ],
    [
      [290, 60],
      [385, -50],
      [500, 25],
    ],
    [
      [410, -90],
      [385, -50],
    ],
    [
      [-350, -120],
      [-415, -135],
      [-500, -90],
    ],
    [
      [-450, -185],
      [-415, -135],
    ],
    [
      [440, -150],
      [410, -90],
      [490, -60],
    ],
  ],
};

/** Every 2D screen picture, keyed by name. */
export const PICTURES: Record<string, Picture2D> = {
  reticleNormal: RETICLE_NORMAL,
  reticleLocked: RETICLE_LOCKED,
  radar: RADAR,
  horizon: HORIZON,
  copyright: COPYRIGHT,
  phonogram: PHONOGRAM,
  livesTank: LIVES_TANK,
  explosionDots: EXPLOSION_DOTS,
  screenCrackFull: SCREEN_CRACK_FULL,
};

/**
 * Every English text message in the ROM with the screen position stored
 * alongside it.  The two position bytes are quarter-units: MSGS loads them
 * through VGVTR, which multiplies by 4, so the beam lands at (4x, 4y)
 * relative to screen centre.  x = y = 0 means 'draw at the current beam
 * position', which the callers use to chain fragments together.
 *
 * Messages before GAMOVR are drawn at SCAL 2 (quarter size); GAMOVR and
 * everything after it at SCAL 1 (half size) - MSGS, BZONE.MAC.txt:8165.
 */
export interface MessageEntry {
  /** Label used in the original source. */
  readonly label: string;
  /** Message number, as passed to MSGS in X (already doubled). */
  readonly index: number;
  readonly text: string;
  /** Quarter-unit screen position; multiply by 4 for vector units. */
  readonly x: number;
  readonly y: number;
}

export const MESSAGES: readonly MessageEntry[] = [
  { label: 'ETO', index: 0x00, text: 'ENEMY TO ', x: -110, y: 74 },
  { label: 'LEFT', index: 0x02, text: 'LEFT', x: 0, y: 0 },
  { label: 'RIGHT', index: 0x04, text: 'RIGHT', x: 0, y: 0 },
  { label: 'REAR', index: 0x06, text: 'REAR', x: 0, y: 0 },
  { label: 'LINE2', index: 0x08, text: 'ENTER YOUR INITIALS', x: 7, y: 26 },
  { label: 'LINE3', index: 0x0a, text: 'CHANGE LETTER WITH RIGHT HAND CONTROLLER', x: -60, y: 16 },
  { label: 'LINE4', index: 0x0c, text: 'SELECT LETTER WITH FIRE BUTTON', x: -45, y: 8 },
  { label: 'CHISCR', index: 0x0e, text: 'HIGH SCORE      000', x: 32, y: 70 },
  { label: 'ERANGE', index: 0x10, text: 'ENEMY IN RANGE', x: -110, y: 90 },
  { label: 'BLOCKD', index: 0x12, text: 'MOTION BLOCKED BY OBJECT', x: -110, y: 82 },
  { label: 'GAMOVR', index: 0x14, text: 'GAME OVER', x: -28, y: 24 },
  { label: 'PRSTRT', index: 0x16, text: 'PRESS START', x: -34, y: 0 },
  { label: 'YSCORE', index: 0x18, text: 'SCORE     000', x: 32, y: 80 },
  { label: 'HISCOR', index: 0x1a, text: 'HIGH SCORES', x: -28, y: 40 },
  { label: 'ZEROS', index: 0x1c, text: '000 ', x: 0, y: 0 },
  { label: 'LINE1', index: 0x1e, text: 'GREAT SCORE', x: -64, y: 24 },
  { label: 'MODE1', index: 0x20, text: '1       2     S', x: -50, y: 0 },
  { label: 'MODE2', index: 0x22, text: '1       1', x: -50, y: 0 },
  { label: 'MODE3', index: 0x24, text: '2     S 1', x: -50, y: 0 },
  { label: 'CONPLY', index: 0x26, text: '  COIN    PLAY', x: -50, y: 0 },
  { label: 'INSCON', index: 0x28, text: 'INSERT COIN', x: -36, y: -22 },
  { label: 'BONPLN', index: 0x2a, text: 'BONUS TANK AT ', x: -87, y: -70 },
  { label: 'BONPL1', index: 0x2c, text: '000 AND 100000', x: 0, y: 0 },
  { label: 'COPYRT', index: 0x2e, text: '(C)(P)  ATARI 1980', x: -42, y: -60 },
];
