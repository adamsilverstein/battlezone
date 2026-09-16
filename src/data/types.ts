/**
 * Shared shapes for the data extracted from the original Atari Battlezone (1980)
 * ROMs.  See docs/reference/atari-source-notes.md for how each table was found.
 *
 * COORDINATE CONVENTION
 * ---------------------
 * The 3D vertex tables in the original store three signed 16-bit words per
 * vertex, and the game feeds them to the MathBox in this order (PNTPUT,
 * BZONE.MAC.txt:4011-4035):
 *
 *   word 0 -> XMATRX   the object's own forward axis (the way it is facing)
 *   word 1 -> YMATRX   the object's own left axis
 *   word 2 -> the perspective divisor's numerator, i.e. height above the
 *             viewpoint - the tank hulls, pyramids and boxes all sit on a
 *             ground plane at -320
 *
 * So the tuple is (forward, left, up): a right-handed frame with the *third*
 * component up, not the second.  Nothing here is rescaled or re-ordered, so a
 * renderer that wants the more usual "+Y up, +Z away from the viewer" layout
 * should map ROM (x, y, z) -> render (-y, z, x).
 *
 * 2D pictures are in screen-space vector units with +X right and +Y up.  At the
 * scale the game runs at (a global SCAL 1, i.e. half size) the visible screen is
 * roughly x in -508..508 and y in -508..508, with the 3D view clipped to
 * y <= 192 and the radar and score strip above that.
 */

/**
 * A 3D wireframe model in original Battlezone vector units.
 *
 * The convention determined from the source (see COORDINATE CONVENTION above) is
 * NOT the usual "+Y up, +Z forward": each vertex is stored as
 * `[forward, left, up]` in the object's own right-handed frame, with the ground
 * plane at up = -320 for every object that rests on it.  Values are the raw ROM
 * words, unscaled - note that the assembler source lists them a quarter size,
 * because the `.NWORD` macro multiplies every literal by 4.
 */
export interface WireModel {
  name: string;
  vertices: readonly (readonly [number, number, number])[];
  edges: readonly (readonly [number, number])[];
}

/** A 2D vector polyline picture (screen-space shapes: reticle, radar, lives icon, logo, screen crack). Coordinates in original vector units, +Y up. */
export interface Picture2D {
  name: string;
  polylines: readonly (readonly (readonly [number, number])[])[];
}

/** A font glyph: polylines inside a cell; advance is the horizontal cell width. */
export interface Glyph {
  polylines: readonly (readonly (readonly [number, number])[])[];
  advance: number;
}
