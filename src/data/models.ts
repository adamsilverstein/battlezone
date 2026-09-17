// GENERATED FILE - do not edit by hand.
// Produced by tools/gen_data.py, which decodes the original Atari Battlezone
// (1980) ROM images: vector ROMs 036421.01 ($3800) and 036422.01 ($3000) and
// program ROMs 036409.01-036414.02 ($5000-$7FFF).

//
// Vertex tables come from OBJPNT ($388E); the edge lists are derived from the
// matching draw lists in OBJTBL, as interpreted by DRAW (BZONE.MAC.txt:3651).
// Coordinates are raw ROM words: see COORDINATE CONVENTION in ./types.ts.

import type { WireModel } from './types';

/**
 * Narrow pyramid obstacle (PYRTBL + PYROBJ), 1024 units across the base.
 *
 * OBJTBL/OBJPNT slot 0 (object number 0x00); vertices at $38E6, draw list at $74CB.
 */
export const PYRAMID: WireModel = {
  name: 'pyramid',
  vertices: [
    [-512, -512, -320],
    [-512, 512, -320],
    [512, 512, -320],
    [512, -512, -320],
    [0, 0, 320],
  ],
  edges: [
    [0, 4],
    [4, 1],
    [1, 0],
    [0, 3],
    [3, 4],
    [4, 2],
    [2, 3],
    [2, 1],
  ],
};

/**
 * Tall cube obstacle (CUBTBL + CUBOBJ), 1024 units on a side.
 *
 * OBJTBL/OBJPNT slot 1 (object number 0x01); vertices at $3905, draw list at $74D7.
 */
export const BOX: WireModel = {
  name: 'box',
  vertices: [
    [-512, -512, -320],
    [-512, 512, -320],
    [512, 512, -320],
    [512, -512, -320],
    [-512, -512, 320],
    [-512, 512, 320],
    [512, 512, 320],
    [512, -512, 320],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [5, 1],
    [2, 6],
    [7, 3],
  ],
};

/**
 * Enemy 'slow tank' hull, turret and gun (TNKTBL + TNKOBJ).
 *
 * OBJTBL/OBJPNT slot 2 (object number 0x02); vertices at $3955, draw list at $74E9.
 */
export const TANK: WireModel = {
  name: 'tank',
  vertices: [
    [-736, -512, -320],
    [-736, 512, -320],
    [968, 512, -320],
    [968, -512, -320],
    [-1024, -568, -208],
    [-1024, 568, -208],
    [1248, 568, -208],
    [1248, -568, -208],
    [-680, -344, -120],
    [-680, 344, -120],
    [680, 344, -120],
    [680, -344, -120],
    [-512, -168, 48],
    [-512, 168, 48],
    [-128, -40, -8],
    [-128, 40, -8],
    [128, 40, -48],
    [128, -40, -48],
    [1120, 40, -8],
    [1120, 40, -48],
    [1120, -40, -8],
    [1120, -40, -48],
    [-512, 0, 48],
    [-512, 0, 80],
  ],
  edges: [
    [23, 22],
    [12, 13],
    [14, 20],
    [20, 18],
    [18, 15],
    [15, 14],
    [14, 17],
    [17, 16],
    [16, 19],
    [19, 21],
    [21, 17],
    [15, 16],
    [19, 18],
    [20, 21],
    [3, 0],
    [0, 4],
    [4, 7],
    [7, 6],
    [6, 2],
    [2, 3],
    [3, 7],
    [7, 11],
    [11, 10],
    [10, 6],
    [6, 5],
    [5, 9],
    [9, 10],
    [10, 13],
    [13, 9],
    [9, 8],
    [8, 11],
    [11, 12],
    [12, 8],
    [8, 4],
    [4, 5],
    [5, 1],
    [1, 2],
    [1, 0],
  ],
};

/**
 * Shell / projectile, a tiny 5-point pyramid (SHLTBL + SHLOBJ).
 *
 * OBJTBL/OBJPNT slot 3 (object number 0x03); vertices at $3936, draw list at $7519.
 */
export const SHELL: WireModel = {
  name: 'shell',
  vertices: [
    [-40, -40, -48],
    [-40, -40, -8],
    [-40, 40, -8],
    [-40, 40, -48],
    [80, 0, -28],
  ],
  edges: [
    [0, 4],
    [4, 1],
    [1, 0],
    [0, 3],
    [3, 4],
    [4, 2],
    [2, 3],
    [2, 1],
  ],
};

/**
 * Rear tread segment, animation frame 0 (TREAD4).
 *
 * OBJTBL/OBJPNT slot 7 (object number 0x07); vertices at $39E6, draw list at $7525.
 */
export const TREAD4: WireModel = {
  name: 'tread4',
  vertices: [
    [-1024, -568, -208],
    [-1024, 568, -208],
    [-920, -548, -248],
    [-920, 548, -248],
    [-816, -532, -288],
    [-816, 532, -288],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Rear tread segment, animation frame 1 (TREAD5).
 *
 * OBJTBL/OBJPNT slot 6 (object number 0x06); vertices at $3A0B, draw list at $7525.
 */
export const TREAD5: WireModel = {
  name: 'tread5',
  vertices: [
    [-1000, -564, -216],
    [-1000, 564, -216],
    [-896, -544, -256],
    [-896, 544, -256],
    [-792, -528, -296],
    [-792, 528, -296],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Rear tread segment, animation frame 2 (TREAD6).
 *
 * OBJTBL/OBJPNT slot 5 (object number 0x05); vertices at $3A30, draw list at $7525.
 */
export const TREAD6: WireModel = {
  name: 'tread6',
  vertices: [
    [-972, -556, -228],
    [-972, 556, -228],
    [-868, -540, -268],
    [-868, 540, -268],
    [-764, -520, -308],
    [-764, 520, -308],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Rear tread segment, animation frame 3 (TREAD7).
 *
 * OBJTBL/OBJPNT slot 4 (object number 0x04); vertices at $3A55, draw list at $7525.
 */
export const TREAD7: WireModel = {
  name: 'tread7',
  vertices: [
    [-948, -552, -236],
    [-948, 552, -236],
    [-844, -536, -276],
    [-844, 536, -276],
    [-736, -516, -316],
    [-736, 516, -316],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Front tread segment, animation frame 0 (TREAD8).
 *
 * OBJTBL/OBJPNT slot 8 (object number 0x08); vertices at $3A7A, draw list at $7525.
 */
export const TREAD8: WireModel = {
  name: 'tread8',
  vertices: [
    [1248, -568, -208],
    [1248, 568, -208],
    [1152, -548, -248],
    [1152, 548, -248],
    [1056, -532, -288],
    [1056, 532, -288],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Front tread segment, animation frame 1 (TREAD9).
 *
 * OBJTBL/OBJPNT slot 9 (object number 0x09); vertices at $3A9F, draw list at $7525.
 */
export const TREAD9: WireModel = {
  name: 'tread9',
  vertices: [
    [1224, -564, -216],
    [1224, 564, -216],
    [1128, -544, -256],
    [1128, 544, -256],
    [1032, -528, -296],
    [1032, 528, -296],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Front tread segment, animation frame 2 (TREADA).
 *
 * OBJTBL/OBJPNT slot 10 (object number 0x0A); vertices at $3AC4, draw list at $7525.
 */
export const TREADA: WireModel = {
  name: 'treadA',
  vertices: [
    [1200, -556, -228],
    [1200, 556, -228],
    [1104, -540, -268],
    [1104, 540, -268],
    [1008, -520, -308],
    [1008, 520, -308],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Front tread segment, animation frame 3 (TREADB).
 *
 * OBJTBL/OBJPNT slot 11 (object number 0x0B); vertices at $3AE9, draw list at $7525.
 */
export const TREADB: WireModel = {
  name: 'treadB',
  vertices: [
    [1176, -552, -236],
    [1176, 552, -236],
    [1080, -536, -276],
    [1080, 536, -276],
    [984, -516, -316],
    [984, 516, -316],
  ],
  edges: [
    [0, 1],
    [2, 3],
    [4, 5],
  ],
};

/**
 * Wide pyramid obstacle (ROCK1 + PYROBJ), 1600 units across the base.
 *
 * OBJTBL/OBJPNT slot 12 (object number 0x0C); vertices at $3C3B, draw list at $74CB.
 */
export const PYRAMIDWIDE: WireModel = {
  name: 'pyramidWide',
  vertices: [
    [-800, -800, -320],
    [-800, 800, -320],
    [800, 800, -320],
    [800, -800, -320],
    [0, 0, 400],
  ],
  edges: [
    [0, 4],
    [4, 1],
    [1, 0],
    [0, 3],
    [3, 4],
    [4, 2],
    [2, 3],
    [2, 1],
  ],
};

/**
 * The rotating radar antenna on top of the enemy tank (RDRTBL + RDROBJ).
 *
 * OBJTBL/OBJPNT slot 13 (object number 0x0D); vertices at $3B0E, draw list at $752D.
 */
export const RADARDISH: WireModel = {
  name: 'radarDish',
  vertices: [
    [0, -80, 80],
    [80, -160, 100],
    [80, -160, 120],
    [0, -80, 140],
    [0, 80, 80],
    [80, 160, 100],
    [80, 160, 120],
    [0, 80, 140],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [7, 3],
  ],
};

/**
 * Short/wide box obstacle (ROCK2 + CUBOBJ), 1280 wide and only 280 tall.
 *
 * OBJTBL/OBJPNT slot 15 (object number 0x0F); vertices at $3C5A, draw list at $74D7.
 */
export const BOXSHORT: WireModel = {
  name: 'boxShort',
  vertices: [
    [-640, -640, -320],
    [-640, 640, -320],
    [640, 640, -320],
    [640, -640, -320],
    [-640, -640, -40],
    [-640, 640, -40],
    [640, 640, -40],
    [640, -640, -40],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [5, 1],
    [2, 6],
    [7, 3],
  ],
};

/**
 * Tank explosion fragment (EX1TBL + EX1OBJ).
 *
 * OBJTBL/OBJPNT slot 16 (object number 0x10); vertices at $3B9B, draw list at $755C.
 */
export const DEBRISPIECE1: WireModel = {
  name: 'debrisPiece1',
  vertices: [
    [220, 0, -272],
    [-320, -80, -188],
    [340, 80, -96],
    [-184, 0, -356],
    [-124, -80, -256],
    [-116, 80, -208],
  ],
  edges: [
    [0, 3],
    [3, 5],
    [5, 2],
    [2, 0],
    [0, 1],
    [1, 2],
    [2, 5],
    [5, 4],
    [4, 1],
    [4, 3],
  ],
};

/**
 * Tank explosion fragment (EX2TBL + EX2OBJ).
 *
 * OBJTBL/OBJPNT slot 17 (object number 0x11); vertices at $3BC0, draw list at $756A.
 */
export const DEBRISPIECE2: WireModel = {
  name: 'debrisPiece2',
  vertices: [
    [-240, -120, -320],
    [-376, 64, -280],
    [720, 160, -384],
    [640, -120, -320],
    [-40, -64, -80],
    [0, 32, -60],
    [56, -160, -200],
    [120, 200, -240],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [4, 6],
    [6, 7],
    [7, 5],
    [5, 4],
    [5, 1],
    [7, 2],
    [3, 6],
  ],
};

/**
 * Tank explosion fragment: the hull/chassis (EX0TBL + EX0OBJ).
 *
 * OBJTBL/OBJPNT slot 18 (object number 0x12); vertices at $3B46, draw list at $753E.
 */
export const DEBRISHULL: WireModel = {
  name: 'debrisHull',
  vertices: [
    [-588, -344, -148],
    [-588, 344, -148],
    [588, 344, -488],
    [588, -344, -488],
    [-272, -168, -48],
    [-272, 168, -48],
    [0, -40, -188],
    [0, 40, -188],
    [180, 40, -288],
    [180, -40, -288],
    [1080, 40, -500],
    [1040, 40, -536],
    [1080, -40, -500],
    [1040, -40, -536],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [4, 5],
    [5, 1],
    [5, 2],
    [3, 4],
    [6, 12],
    [12, 10],
    [10, 7],
    [7, 6],
    [6, 9],
    [9, 8],
    [8, 11],
    [11, 13],
    [13, 9],
    [7, 8],
    [11, 10],
    [12, 13],
  ],
};

/**
 * Guided missile, called the 'buzz bomb' / R2D3 in the source (R2D3TB).
 *
 * OBJTBL/OBJPNT slot 22 (object number 0x16); vertices at $3C8B, draw list at $757C.
 */
export const MISSILE: WireModel = {
  name: 'missile',
  vertices: [
    [-384, 144, 0],
    [-384, 72, 48],
    [-384, -72, 48],
    [-384, -144, 0],
    [-384, -72, -48],
    [-384, 72, -48],
    [-96, 288, 0],
    [-96, 192, 96],
    [-96, -192, 96],
    [-96, -288, 0],
    [-96, -192, -96],
    [-96, 192, -96],
    [1152, 0, 0],
    [1392, 0, 0],
    [-144, -144, -168],
    [-144, 144, -168],
    [144, 144, -168],
    [144, -144, -168],
    [-48, -48, -92],
    [-48, 48, -92],
    [48, 48, -84],
    [48, -48, -84],
    [-96, 0, 96],
    [528, 72, 48],
    [528, -72, 48],
    [48, 0, 144],
  ],
  edges: [
    [13, 12],
    [12, 6],
    [6, 0],
    [0, 1],
    [1, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 6],
    [6, 7],
    [7, 12],
    [12, 8],
    [8, 2],
    [2, 3],
    [3, 9],
    [9, 12],
    [12, 10],
    [10, 4],
    [4, 5],
    [5, 11],
    [11, 12],
    [24, 23],
    [23, 22],
    [22, 24],
    [24, 25],
    [25, 23],
    [25, 22],
    [1, 2],
    [3, 4],
    [5, 0],
    [18, 19],
    [19, 20],
    [20, 21],
    [21, 18],
    [18, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 14],
    [15, 19],
    [20, 16],
    [17, 21],
  ],
};

/**
 * 'BA' of the BATTLE ZONE logo (BATBL + BT0OBJ).
 *
 * OBJTBL/OBJPNT slot 23 (object number 0x17); vertices at $76D5, draw list at $762F.
 */
export const LOGOBA: WireModel = {
  name: 'logoBA',
  vertices: [
    [224, 5120, 32],
    [224, 3840, 32],
    [672, 3200, 88],
    [1120, 3520, 144],
    [1600, 3200, 200],
    [2048, 3840, 256],
    [2048, 5120, 256],
    [672, 4480, 88],
    [672, 4160, 88],
    [1120, 4480, 144],
    [1600, 4160, 200],
    [1600, 4480, 200],
    [224, 3200, 32],
    [32, 2240, 88],
    [224, 1280, 32],
    [2048, 2240, 256],
    [896, 2560, 112],
    [1024, 2240, 128],
    [896, 1920, 112],
    [1344, 2240, 168],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 0],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 7],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 12],
    [16, 17],
    [17, 18],
    [18, 19],
    [19, 16],
  ],
};

/**
 * Missile explosion fragment (EX4TBL + EX4OBJ).
 *
 * OBJTBL/OBJPNT slot 25 (object number 0x19); vertices at $3C0A, draw list at $75E6.
 */
export const DEBRISPIECE4: WireModel = {
  name: 'debrisPiece4',
  vertices: [
    [-300, -72, -184],
    [-232, -168, -184],
    [-232, -272, -236],
    [-300, -272, -284],
    [-96, 168, -204],
    [40, 12, -192],
    [40, -260, -324],
    [-96, -232, -404],
  ],
  edges: [
    [1, 2],
    [2, 3],
    [3, 7],
    [7, 6],
    [6, 5],
    [5, 4],
    [4, 0],
    [0, 1],
    [1, 5],
    [6, 2],
  ],
};

/**
 * Missile explosion fragment (EX3TBL + EX3OBJ).
 *
 * OBJTBL/OBJPNT slot 27 (object number 0x1B); vertices at $3BF1, draw list at $75DC.
 */
export const DEBRISPIECE3: WireModel = {
  name: 'debrisPiece3',
  vertices: [
    [-80, -12, -288],
    [472, 112, -432],
    [800, -44, 12],
    [88, -16, -268],
  ],
  edges: [
    [0, 2],
    [2, 1],
    [1, 3],
    [3, 0],
    [0, 1],
    [2, 3],
  ],
};

/**
 * 'TTLE' of the BATTLE ZONE logo (TLETBL + BT1OBJ).
 *
 * OBJTBL/OBJPNT slot 30 (object number 0x1E); vertices at $774E, draw list at $7649.
 */
export const LOGOTTLE: WireModel = {
  name: 'logoTTLE',
  vertices: [
    [224, 640, 32],
    [1600, 320, 200],
    [1600, -640, 200],
    [224, -960, 32],
    [1600, -1280, 200],
    [1600, -2240, 200],
    [224, -2240, 32],
    [224, -3840, 32],
    [448, -5440, 56],
    [672, -4480, 88],
    [896, -4480, 112],
    [1120, -5120, 144],
    [1344, -4480, 168],
    [1600, -4480, 200],
    [1824, -5440, 224],
    [2048, -3840, 256],
    [672, -2880, 88],
    [2048, -2880, 256],
    [2048, 1920, 256],
    [1600, 1920, 200],
    [1600, 960, 200],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 7],
    [7, 16],
    [16, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [20, 0],
  ],
};

/**
 * 'ZONE' of the BATTLE ZONE logo (ZONTBL + BT2OBJ).
 *
 * OBJTBL/OBJPNT slot 31 (object number 0x1F); vertices at $77CD, draw list at $7661.
 */
export const LOGOZONE: WireModel = {
  name: 'logoZONE',
  vertices: [
    [-2048, 4800, -256],
    [-2048, 2240, -256],
    [-1600, 3520, -200],
    [-224, 2240, -32],
    [-224, 4800, -32],
    [-672, 3520, -88],
    [-2048, 320, -256],
    [-224, 320, -32],
    [-1600, 1600, -200],
    [-1600, 960, -200],
    [-672, 960, -88],
    [-672, 1600, -88],
    [-2048, 0, -256],
    [-1120, -640, -144],
    [-2048, -2560, -256],
    [-1824, -4160, -224],
    [-1600, -3200, -200],
    [-1344, -3200, -168],
    [-1120, -3840, -144],
    [-896, -3200, -112],
    [-672, -3200, -88],
    [-448, -4160, -56],
    [-224, -2560, -32],
    [-1120, -1920, -144],
    [-224, 0, -32],
  ],
  edges: [
    [1, 0],
    [0, 5],
    [5, 4],
    [4, 3],
    [3, 2],
    [2, 1],
    [1, 3],
    [3, 7],
    [7, 6],
    [6, 1],
    [9, 8],
    [8, 11],
    [11, 10],
    [10, 9],
    [14, 22],
    [22, 23],
    [23, 24],
    [24, 12],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 18],
    [18, 19],
    [19, 20],
    [20, 21],
    [21, 22],
  ],
};

/**
 * Flying saucer (SAUTBL + SAUOBJ).
 *
 * OBJTBL/OBJPNT slot 32 (object number 0x20); vertices at $3EB0, draw list at $75B5.
 */
export const SAUCER: WireModel = {
  name: 'saucer',
  vertices: [
    [-240, 0, -40],
    [-160, 160, -40],
    [0, 240, -40],
    [160, 160, -40],
    [240, 0, -40],
    [160, -160, -40],
    [0, -240, -40],
    [-160, -160, -40],
    [-960, 0, 80],
    [-680, 680, 80],
    [0, 960, 80],
    [680, 680, 80],
    [960, 0, 80],
    [680, -680, 80],
    [0, -960, 80],
    [-680, -680, 80],
    [0, 0, 280],
  ],
  edges: [
    [16, 8],
    [8, 9],
    [9, 16],
    [16, 10],
    [10, 11],
    [11, 16],
    [16, 12],
    [12, 13],
    [13, 16],
    [16, 14],
    [14, 15],
    [15, 16],
    [0, 7],
    [7, 15],
    [15, 8],
    [8, 0],
    [0, 1],
    [1, 9],
    [9, 10],
    [10, 2],
    [2, 3],
    [3, 11],
    [11, 12],
    [12, 4],
    [4, 5],
    [5, 13],
    [13, 14],
    [14, 6],
    [6, 7],
    [6, 5],
    [4, 3],
    [2, 1],
  ],
};

/**
 * Supertank, called the TR7 in the source (TR7TBL + TR7OBJ).
 *
 * OBJTBL/OBJPNT slot 33 (object number 0x21); vertices at $3F17, draw list at $75FF.
 */
export const SUPERTANK: WireModel = {
  name: 'supertank',
  vertices: [
    [1456, 368, -320],
    [-456, 552, -320],
    [-456, -552, -320],
    [1456, -368, -320],
    [-456, 456, -92],
    [-456, -456, -92],
    [1096, 0, -276],
    [-272, 272, -116],
    [-456, 272, -92],
    [-456, -272, -92],
    [-272, -272, -116],
    [-272, 184, 44],
    [-456, 184, 44],
    [-456, -184, 44],
    [-272, -184, 44],
    [1280, 88, -44],
    [88, 88, -44],
    [88, -88, -44],
    [1280, -88, -44],
    [1280, 88, 0],
    [-88, 88, 0],
    [-88, -88, 0],
    [1280, -88, 0],
    [-456, 0, 44],
    [-456, 0, 276],
  ],
  edges: [
    [0, 1],
    [1, 4],
    [4, 0],
    [0, 3],
    [3, 2],
    [2, 5],
    [5, 3],
    [2, 1],
    [4, 5],
    [9, 10],
    [10, 6],
    [6, 14],
    [14, 13],
    [13, 9],
    [9, 8],
    [8, 7],
    [7, 6],
    [6, 11],
    [11, 12],
    [12, 8],
    [12, 13],
    [14, 11],
    [19, 22],
    [22, 21],
    [21, 20],
    [20, 16],
    [16, 15],
    [15, 18],
    [18, 17],
    [17, 16],
    [15, 19],
    [22, 18],
    [17, 21],
    [23, 24],
  ],
};

/**
 * Expanding ring of eight dots, frame 0 of 8 (REX0 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 36 (object number 0x24); vertices at $3D28, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST0: WireModel = {
  name: 'missileExhaust0',
  vertices: [
    [0, 52, -180],
    [36, 36, -180],
    [52, 0, -180],
    [36, -36, -180],
    [0, -52, -180],
    [-36, -36, -180],
    [-52, 0, -180],
    [-36, 36, -180],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 1 of 8 (REX1 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 37 (object number 0x25); vertices at $3D59, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST1: WireModel = {
  name: 'missileExhaust1',
  vertices: [
    [0, 100, -200],
    [72, 72, -200],
    [100, 0, -200],
    [72, -72, -200],
    [0, -100, -200],
    [-72, -72, -200],
    [-100, 0, -200],
    [-72, 72, -200],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 2 of 8 (REX2 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 38 (object number 0x26); vertices at $3D8A, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST2: WireModel = {
  name: 'missileExhaust2',
  vertices: [
    [0, 152, -220],
    [108, 108, -220],
    [152, 0, -220],
    [108, -108, -220],
    [0, -152, -220],
    [-108, -108, -220],
    [-152, 0, -220],
    [-108, 108, -220],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 3 of 8 (REX3 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 39 (object number 0x27); vertices at $3DBB, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST3: WireModel = {
  name: 'missileExhaust3',
  vertices: [
    [0, 200, -240],
    [144, 144, -240],
    [200, 0, -240],
    [144, -144, -240],
    [0, -200, -240],
    [-144, -144, -240],
    [-200, 0, -240],
    [-144, 144, -240],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 4 of 8 (REX4 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 40 (object number 0x28); vertices at $3DEC, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST4: WireModel = {
  name: 'missileExhaust4',
  vertices: [
    [0, 252, -260],
    [176, 176, -260],
    [252, 0, -260],
    [176, -176, -260],
    [0, -252, -260],
    [-176, -176, -260],
    [-252, 0, -260],
    [-176, 176, -260],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 5 of 8 (REX5 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 41 (object number 0x29); vertices at $3E1D, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST5: WireModel = {
  name: 'missileExhaust5',
  vertices: [
    [0, 300, -280],
    [212, 212, -280],
    [300, 0, -280],
    [212, -212, -280],
    [0, -300, -280],
    [-212, -212, -280],
    [-300, 0, -280],
    [-212, 212, -280],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 6 of 8 (REX6 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 42 (object number 0x2A); vertices at $3E4E, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST6: WireModel = {
  name: 'missileExhaust6',
  vertices: [
    [0, 352, -300],
    [264, 264, -300],
    [352, 0, -300],
    [264, -264, -300],
    [0, -352, -300],
    [-264, -264, -300],
    [-352, 0, -300],
    [-264, 264, -300],
  ],
  edges: [],
};

/**
 * Expanding ring of eight dots, frame 7 of 8 (REX7 + EXHOBJ): the missile's exhaust plume, and the dot cloud of a missile explosion.
 *
 * OBJTBL/OBJPNT slot 43 (object number 0x2B); vertices at $3E7F, draw list at $75F4.
 * Drawn as unconnected dots in the original (TDOT); the `edges` list is
 * empty and every vertex is a dot.
 */
export const MISSILEEXHAUST7: WireModel = {
  name: 'missileExhaust7',
  vertices: [
    [0, 400, -320],
    [284, 284, -320],
    [400, 0, -320],
    [284, -284, -320],
    [0, -400, -320],
    [-284, -284, -320],
    [-400, 0, -320],
    [-284, 284, -320],
  ],
  edges: [],
};

/** Every 3D wireframe model, keyed by name. */
export const MODELS: Record<string, WireModel> = {
  pyramid: PYRAMID,
  box: BOX,
  tank: TANK,
  shell: SHELL,
  tread4: TREAD4,
  tread5: TREAD5,
  tread6: TREAD6,
  tread7: TREAD7,
  tread8: TREAD8,
  tread9: TREAD9,
  treadA: TREADA,
  treadB: TREADB,
  pyramidWide: PYRAMIDWIDE,
  radarDish: RADARDISH,
  boxShort: BOXSHORT,
  debrisPiece1: DEBRISPIECE1,
  debrisPiece2: DEBRISPIECE2,
  debrisHull: DEBRISHULL,
  missile: MISSILE,
  logoBA: LOGOBA,
  debrisPiece4: DEBRISPIECE4,
  debrisPiece3: DEBRISPIECE3,
  logoTTLE: LOGOTTLE,
  logoZONE: LOGOZONE,
  saucer: SAUCER,
  supertank: SUPERTANK,
  missileExhaust0: MISSILEEXHAUST0,
  missileExhaust1: MISSILEEXHAUST1,
  missileExhaust2: MISSILEEXHAUST2,
  missileExhaust3: MISSILEEXHAUST3,
  missileExhaust4: MISSILEEXHAUST4,
  missileExhaust5: MISSILEEXHAUST5,
  missileExhaust6: MISSILEEXHAUST6,
  missileExhaust7: MISSILEEXHAUST7,
};

/** Dot-only models: the original draws these as isolated dots, not lines. */
export const DOT_MODEL_NAMES: readonly string[] = [
  'missileExhaust0',
  'missileExhaust1',
  'missileExhaust2',
  'missileExhaust3',
  'missileExhaust4',
  'missileExhaust5',
  'missileExhaust6',
  'missileExhaust7',
];

/**
 * Tread animation frames. The low two bits of the tread counter (TRDCTR)
 * pick the frame; BZONE.MAC.txt:3017-3049 chooses the rear set (objects
 * 4-7) or the front set (objects 8-11) depending on whether the viewer sees
 * the front or the back of the tank.
 */
export const TREAD_FRAMES = {
  rear: ['tread7', 'tread6', 'tread5', 'tread4'] as const,
  front: ['tread8', 'tread9', 'treadA', 'treadB'] as const,
};

/**
 * The six flying pieces of a destroyed tank, in the order EXPLDE assigns
 * them (BZONE.MAC.txt:3573-3603): object numbers 0x10..0x15. Piece 3 uses
 * the radar dish for a slow tank and a second EX2 piece for a supertank.
 */
export const TANK_DEBRIS: readonly string[] = [
  'debrisPiece1',
  'debrisPiece2',
  'debrisHull',
  'radarDish',
  'debrisPiece2',
  'debrisPiece1',
];

/** The six flying pieces of a destroyed missile: object numbers 0x18..0x1D. */
export const MISSILE_DEBRIS: readonly string[] = [
  'debrisPiece2',
  'debrisPiece4',
  'debrisPiece1',
  'debrisPiece3',
  'debrisPiece1',
  'debrisPiece4',
];
