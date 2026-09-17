#!/usr/bin/env python3
"""Generate src/data/{models,font,pictures,mountains}.ts from the original ROMs.

Everything this writes is decoded straight out of the 1980 ROM images by
tools/decode_avg.py and tools/build_models.py; nothing is hand-transcribed.
Run from the repository root:

    python3 tools/gen_data.py
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


avg = _load("decode_avg")
bm = _load("build_models")

HEADER = """// GENERATED FILE - do not edit by hand.
// Produced by tools/gen_data.py, which decodes the original Atari Battlezone
// (1980) ROM images: vector ROMs 036421.01 ($3800) and 036422.01 ($3000) and
// program ROMs 036409.01-036414.02 ($5000-$7FFF).
"""

# --------------------------------------------------------------------------- #
# models.ts
# --------------------------------------------------------------------------- #

# key -> (OBJTBL/OBJPNT slot, human description)
MODEL_SLOTS = [
    ("pyramid", 0, "Narrow pyramid obstacle (PYRTBL + PYROBJ), 1024 units across the base."),
    ("box", 1, "Tall cube obstacle (CUBTBL + CUBOBJ), 1024 units on a side."),
    ("tank", 2, "Enemy 'slow tank' hull, turret and gun (TNKTBL + TNKOBJ)."),
    ("shell", 3, "Shell / projectile, a tiny 5-point pyramid (SHLTBL + SHLOBJ)."),
    ("tread4", 7, "Rear tread segment, animation frame 0 (TREAD4)."),
    ("tread5", 6, "Rear tread segment, animation frame 1 (TREAD5)."),
    ("tread6", 5, "Rear tread segment, animation frame 2 (TREAD6)."),
    ("tread7", 4, "Rear tread segment, animation frame 3 (TREAD7)."),
    ("tread8", 8, "Front tread segment, animation frame 0 (TREAD8)."),
    ("tread9", 9, "Front tread segment, animation frame 1 (TREAD9)."),
    ("treadA", 10, "Front tread segment, animation frame 2 (TREADA)."),
    ("treadB", 11, "Front tread segment, animation frame 3 (TREADB)."),
    ("pyramidWide", 12, "Wide pyramid obstacle (ROCK1 + PYROBJ), 1600 units across the base."),
    ("radarDish", 13, "The rotating radar antenna on top of the enemy tank (RDRTBL + RDROBJ)."),
    ("boxShort", 15, "Short/wide box obstacle (ROCK2 + CUBOBJ), 1280 wide and only 280 tall."),
    ("debrisPiece1", 16, "Tank explosion fragment (EX1TBL + EX1OBJ)."),
    ("debrisPiece2", 17, "Tank explosion fragment (EX2TBL + EX2OBJ)."),
    ("debrisHull", 18, "Tank explosion fragment: the hull/chassis (EX0TBL + EX0OBJ)."),
    ("missile", 22, "Guided missile, called the 'buzz bomb' / R2D3 in the source (R2D3TB)."),
    ("logoBA", 23, "'BA' of the BATTLE ZONE logo (BATBL + BT0OBJ)."),
    ("debrisPiece4", 25, "Missile explosion fragment (EX4TBL + EX4OBJ)."),
    ("debrisPiece3", 27, "Missile explosion fragment (EX3TBL + EX3OBJ)."),
    ("logoTTLE", 30, "'TTLE' of the BATTLE ZONE logo (TLETBL + BT1OBJ)."),
    ("logoZONE", 31, "'ZONE' of the BATTLE ZONE logo (ZONTBL + BT2OBJ)."),
    ("saucer", 32, "Flying saucer (SAUTBL + SAUOBJ)."),
    ("supertank", 33, "Supertank, called the TR7 in the source (TR7TBL + TR7OBJ)."),
]

# Slots 36..43 (REX0..REX7) are eight dot-only pictures - the growing puff drawn
# for the missile's exhaust and for the missile explosion's dot cloud.
DOT_SLOTS = [
    (
        f"missileExhaust{i}",
        36 + i,
        f"Expanding ring of eight dots, frame {i} of 8 (REX{i} + EXHOBJ): the missile's "
        "exhaust plume, and the dot cloud of a missile explosion.",
    )
    for i in range(8)
]


def ts_num_list(seq) -> str:
    return "[" + ", ".join(str(int(v)) for v in seq) + "]"


def gen_models(data) -> str:
    lines = [
        HEADER,
        "//",
        "// Vertex tables come from OBJPNT ($388E); the edge lists are derived from the",
        "// matching draw lists in OBJTBL, as interpreted by DRAW (BZONE.MAC.txt:3651).",
        "// Coordinates are raw ROM words: see COORDINATE CONVENTION in ./types.ts.",
        "",
        "import type { WireModel } from './types';",
        "",
    ]
    exported = []
    for key, slot, desc in MODEL_SLOTS + DOT_SLOTS:
        d = data[slot]
        const = "".join(c if c.isalnum() else "_" for c in key).upper()
        lines.append(f"/**")
        lines.append(f" * {desc}")
        lines.append(f" *")
        lines.append(
            f" * OBJTBL/OBJPNT slot {slot} (object number 0x{slot:02X}); vertices at"
            f" ${d['pntAddr']}, draw list at ${d['objAddr']}."
        )
        if d["dots"]:
            lines.append(
                " * Drawn as unconnected dots in the original (TDOT); the `edges` list is"
            )
            lines.append(" * empty and every vertex is a dot.")
        lines.append(" */")
        lines.append(f"export const {const}: WireModel = {{")
        lines.append(f"  name: '{key}',")
        lines.append("  vertices: [")
        for v in d["vertices"]:
            lines.append(f"    {ts_num_list(v)},")
        lines.append("  ],")
        if d["edges"]:
            lines.append("  edges: [")
            for e in d["edges"]:
                lines.append(f"    {ts_num_list(e)},")
            lines.append("  ],")
        else:
            lines.append("  edges: [],")
        lines.append("};")
        lines.append("")
        exported.append((key, const))
    lines.append("/** Every 3D wireframe model, keyed by name. */")
    lines.append("export const MODELS: Record<string, WireModel> = {")
    for key, const in exported:
        lines.append(f"  {key}: {const},")
    lines.append("};")
    lines.append("")
    lines.append(
        "/** Dot-only models: the original draws these as isolated dots, not lines. */"
    )
    lines.append(
        "export const DOT_MODEL_NAMES: readonly string[] = ["
        + ", ".join(f"'{k}'" for k, _s, _d in DOT_SLOTS)
        + "];"
    )
    lines.append("")
    lines.append(
        "/**\n"
        " * Tread animation frames. The low two bits of the tread counter (TRDCTR)\n"
        " * pick the frame; BZONE.MAC.txt:3017-3049 chooses the rear set (objects\n"
        " * 4-7) or the front set (objects 8-11) depending on whether the viewer sees\n"
        " * the front or the back of the tank.\n"
        " */"
    )
    lines.append(
        "export const TREAD_FRAMES = {\n"
        "  rear: ['tread7', 'tread6', 'tread5', 'tread4'] as const,\n"
        "  front: ['tread8', 'tread9', 'treadA', 'treadB'] as const,\n"
        "};"
    )
    lines.append("")
    lines.append(
        "/**\n"
        " * The six flying pieces of a destroyed tank, in the order EXPLDE assigns\n"
        " * them (BZONE.MAC.txt:3573-3603): object numbers 0x10..0x15. Piece 3 uses\n"
        " * the radar dish for a slow tank and a second EX2 piece for a supertank.\n"
        " */"
    )
    lines.append(
        "export const TANK_DEBRIS: readonly string[] = [\n"
        "  'debrisPiece1',\n"
        "  'debrisPiece2',\n"
        "  'debrisHull',\n"
        "  'radarDish',\n"
        "  'debrisPiece2',\n"
        "  'debrisPiece1',\n"
        "];"
    )
    lines.append("")
    lines.append(
        "/** The six flying pieces of a destroyed missile: object numbers 0x18..0x1D. */"
    )
    lines.append(
        "export const MISSILE_DEBRIS: readonly string[] = [\n"
        "  'debrisPiece2',\n"
        "  'debrisPiece4',\n"
        "  'debrisPiece1',\n"
        "  'debrisPiece3',\n"
        "  'debrisPiece1',\n"
        "  'debrisPiece4',\n"
        "];"
    )
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# font.ts
# --------------------------------------------------------------------------- #


def gen_font() -> str:
    entries = []
    for i, target, _w in avg.glyph_entries(41):
        if target is None:
            continue
        name = avg.GLYPH_NAMES.get(i)
        if name is None:
            continue
        if name == "<blank4A>":
            continue  # duplicate of the space glyph, selectable when entering initials
        key = "_" if name == "<underline>" else name
        polys, _zs = avg.polylines(target)
        pos = [0, 0]

        def net(a, depth=0, pos=pos):
            for ins in avg.flatten(a):
                if ins.op in ("VCTR", "SVEC"):
                    pos[0] += ins.args["dx"]
                    pos[1] += ins.args["dy"]
                elif ins.op == "JSRL" and depth < 6:
                    net(ins.args["target"], depth + 1)
                elif ins.op in ("RTSL", "HALT"):
                    break

        net(target)
        entries.append((key, i, target, polys, pos[0]))

    lines = [
        HEADER,
        "//",
        "// The font lives in the vector ROM.  VGMSGA ($33F0) is a table of 41 JSRL",
        "// instructions, one per glyph; a message byte is 2 * the glyph index, and the",
        "// top bit of the byte marks the end of a string (MSGS, BZONE.MAC.txt:8109).",
        "// Glyph 0 is a blank, 1..10 are '0'..'9' (VGHEX in VGUT.MAC maps digit d to",
        "// index d + 1), 11..36 are 'A'..'Z', 37 is a second blank (the space the",
        "// player can pick when entering initials), 38 is the underline, and 39/40 are",
        "// the copyright and phonogram symbols (see ./pictures.ts).",
        "//",
        "// '0' shares its glyph with 'O' and '5' shares its glyph with 'S'.",
        "",
        "import type { Glyph } from './types';",
        "",
        "/** Glyph cell width in vector units (all strokes fall in x = 0..16). */",
        "export const CELL_WIDTH = 16;",
        "/** Glyph cell height in vector units (all strokes fall in y = 0..24). */",
        "export const CELL_HEIGHT = 24;",
        "/** Horizontal advance per character; every glyph in the ROM advances by 24. */",
        "export const CELL_ADVANCE = 24;",
        "",
        "/**",
        " * Every character the original vector font contains.  There is no lower case,",
        " * no punctuation other than the underline, and no digits beyond 0-9.",
        " */",
        "export const FONT: Record<string, Glyph> = {",
    ]
    for key, idx, addr, polys, adv in entries:
        esc = "\\\\" if key == "\\" else ("\\'" if key == "'" else key)
        lines.append(f"  // glyph index {idx} (message byte 0x{idx * 2:02X}) at ${addr:04X}")
        lines.append(f"  '{esc}': {{")
        if polys:
            lines.append("    polylines: [")
            for pl in polys:
                lines.append("      [" + ", ".join(ts_num_list(p) for p in pl) + "],")
            lines.append("    ],")
        else:
            lines.append("    polylines: [],")
        lines.append(f"    advance: {adv},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    lines.append(
        "/** Message byte -> character, for decoding the original string tables. */"
    )
    lines.append("export const CHAR_CODES: Record<number, string> = {")
    for key, idx, _addr, _polys, _adv in entries:
        esc = "\\'" if key == "'" else key
        lines.append(f"  0x{idx * 2:02X}: '{esc}',")
    lines.append("  0x4A: ' ', // second blank, selectable when entering initials");
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# pictures.ts
# --------------------------------------------------------------------------- #

PICTURES = [
    (
        "RETICLE_NORMAL",
        "reticleNormal",
        0x34CC,
        "XCROSS - the gunsight when nothing is locked on: a vertical tick above and "
        "below plus two square brackets. Drawn at intensity 3.",
    ),
    (
        "RETICLE_LOCKED",
        "reticleLocked",
        0x3500,
        "XCROS1 - the gunsight when the enemy is in the sights: the brackets splay "
        "outward into corners and the intensity jumps to 7 (the short stubs stay at 3).",
    ),
    (
        "RADAR",
        "radar",
        0x353C,
        "RDRING - the radar: four tick marks at the compass points of a circle that is "
        "never actually drawn, plus the V-shaped field-of-view wedge (intensity 5). The "
        "sweep line and the enemy blip are built at run time by DRADAR.",
    ),
    (
        "HORIZON",
        "horizon",
        0x3000,
        "HORIZN - the horizon line: one 1536-unit vector drawn right to left, exactly "
        "three mountain segments wide.",
    ),
    (
        "COPYRIGHT",
        "copyright",
        0x3454,
        "CPYRIT - the circled C of the copyright notice (font glyph 39, byte 0x4E).",
    ),
    (
        "PHONOGRAM",
        "phonogram",
        0x3466,
        "PNTNT - the circled P that follows it (font glyph 40, byte 0x50).",
    ),
]


def gen_pictures(messages) -> str:
    lines = [
        HEADER,
        "//",
        "// 2D screen-space pictures from the vector ROM.  All coordinates are in vector",
        "// units with +X right and +Y up, relative to the point at which the picture is",
        "// invoked; the pictures that start with a CNTR instruction are relative to the",
        "// centre of the screen, which is noted below.",
        "",
        "import type { Picture2D } from './types';",
        "",
    ]
    exported = []
    for const, key, addr, desc in PICTURES:
        polys, zs = avg.polylines(addr)
        starts_centred = avg.walk(addr)[0].op == "CNTR"
        lines.append("/**")
        for chunk in desc.split(". "):
            if chunk:
                lines.append(f" * {chunk.rstrip('.')}.")
        lines.append(f" *")
        lines.append(f" * Vector ROM ${addr:04X}. Stroke intensities: {zs}.")
        if starts_centred:
            lines.append(" * Begins with CNTR, so its coordinates are screen-centre relative.")
        lines.append(" */")
        lines.append(f"export const {const}: Picture2D = {{")
        lines.append(f"  name: '{key}',")
        lines.append("  polylines: [")
        for pl in polys:
            lines.append("    [" + ", ".join(ts_num_list(p) for p in pl) + "],")
        lines.append("  ],")
        lines.append("};")
        lines.append("")
        exported.append((key, const))

    # Lives icon: TSYMBL holds a bare JSRL word that the CPU copies into the
    # display list once per remaining life, so only the TANKS routine it calls is
    # the picture (TSYMBL itself has no RTSL and runs on into CRACK0).
    tanks = avg.walk(0x3590)[0].args["target"]
    polys, zs = avg.polylines(tanks)
    lines.append("/**")
    lines.append(" * TANKS - the little side-on tank drawn once per reserve life, and once per")
    lines.append(" * 1000 points beside each high score.")
    lines.append(" *")
    lines.append(
        f" * Vector ROM ${tanks:04X}. TSYMBL ($3590) is a bare JSRL word that INFO"
    )
    lines.append(
        " * (BZONE.MAC.txt:8275) copies straight into the display list, once per life."
    )
    lines.append(f" * Stroke intensities: {zs}.")
    lines.append(" */")
    lines.append("export const LIVES_TANK: Picture2D = {")
    lines.append("  name: 'livesTank',")
    lines.append("  polylines: [")
    for pl in polys:
        lines.append("    [" + ", ".join(ts_num_list(p) for p in pl) + "],")
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    exported.append(("livesTank", "LIVES_TANK"))

    # Explosion dot picture (EXPIC): ten zero-length vectors, i.e. ten dots.
    dots = []
    pos = [0, 0]
    for ins in avg.flatten(0x347A):
        if ins.op in ("VCTR", "SVEC"):
            pos = [pos[0] + ins.args["dx"], pos[1] + ins.args["dy"]]
            if ins.args["z"] != 0:
                dots.append(list(pos))
    lines.append("/**")
    lines.append(" * EXPIC - the shell-impact / distant-explosion picture: ten dots, drawn as")
    lines.append(" * zero-length lit vectors at intensity 7.  DRAW's TSPCL command scales it")
    lines.append(" * with SCAL from the object's orientation byte (BZONE.MAC.txt:3805).")
    lines.append(" *")
    lines.append(f" * Vector ROM $347A.  Each entry here is a one-point polyline (a dot).")
    lines.append(" */")
    lines.append("export const EXPLOSION_DOTS: Picture2D = {")
    lines.append("  name: 'explosionDots',")
    lines.append("  polylines: [")
    for d in dots:
        lines.append("    [" + ts_num_list(d) + "],")
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    exported.append(("explosionDots", "EXPLOSION_DOTS"))

    # Screen crack: eight groups, revealed one per game tick.
    crack_subs = [i.args["target"] for i in avg.walk(0x36F8) if i.op == "JSRL"]
    lines.append("/**")
    lines.append(" * The cracked screen drawn when the player is killed.  CRACKS ($36F8) is a")
    lines.append(" * list of eight JSRL words; WNSHLD (BZONE.MAC.txt:1231) copies the first")
    lines.append(" * CRACK/2 of them into the display list each tick, so the crack grows one")
    lines.append(" * group per tick for eight ticks and then holds.")
    lines.append(" *")
    lines.append(" * Group 0 begins with CNTR (screen-centre relative); groups 1-7 continue")
    lines.append(" * from wherever the previous group left the beam, so they must be drawn in")
    lines.append(" * order, accumulating the pen position.")
    lines.append(" */")
    lines.append("export const SCREEN_CRACK_GROUPS: readonly Picture2D[] = [")
    for gi, sub in enumerate(crack_subs):
        polys, _zs = avg.polylines(sub)
        lines.append("  {")
        lines.append(f"    name: 'screenCrack{gi}', // vector ROM ${sub:04X}")
        lines.append("    polylines: [")
        for pl in polys:
            lines.append("      [" + ", ".join(ts_num_list(p) for p in pl) + "],")
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    # Full crack as one picture, accumulating the pen across all eight groups.
    polys, _zs = avg.polylines(0x36F8)
    lines.append("/** All eight crack groups in one picture, pen position accumulated. */")
    lines.append("export const SCREEN_CRACK_FULL: Picture2D = {")
    lines.append("  name: 'screenCrackFull',")
    lines.append("  polylines: [")
    for pl in polys:
        lines.append("    [" + ", ".join(ts_num_list(p) for p in pl) + "],")
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    exported.append(("screenCrackFull", "SCREEN_CRACK_FULL"))

    lines.append("/** Every 2D screen picture, keyed by name. */")
    lines.append("export const PICTURES: Record<string, Picture2D> = {")
    for key, const in exported:
        lines.append(f"  {key}: {const},")
    lines.append("};")
    lines.append("")

    lines.append("/**")
    lines.append(" * Every English text message in the ROM with the screen position stored")
    lines.append(" * alongside it.  The two position bytes are quarter-units: MSGS loads them")
    lines.append(" * through VGVTR, which multiplies by 4, so the beam lands at (4x, 4y)")
    lines.append(" * relative to screen centre.  x = y = 0 means 'draw at the current beam")
    lines.append(" * position', which the callers use to chain fragments together.")
    lines.append(" *")
    lines.append(" * Messages before GAMOVR are drawn at SCAL 2 (quarter size); GAMOVR and")
    lines.append(" * everything after it at SCAL 1 (half size) - MSGS, BZONE.MAC.txt:8165.")
    lines.append(" */")
    lines.append("export interface MessageEntry {")
    lines.append("  /** Label used in the original source. */")
    lines.append("  readonly label: string;")
    lines.append("  /** Message number, as passed to MSGS in X (already doubled). */")
    lines.append("  readonly index: number;")
    lines.append("  readonly text: string;")
    lines.append("  /** Quarter-unit screen position; multiply by 4 for vector units. */")
    lines.append("  readonly x: number;")
    lines.append("  readonly y: number;")
    lines.append("}")
    lines.append("")
    lines.append("export const MESSAGES: readonly MessageEntry[] = [")
    for label, idx, x, y, text in messages:
        safe = text.replace("\\", "\\\\").replace("'", "\\'")
        lines.append(
            f"  {{ label: '{label}', index: 0x{idx:02X}, text: '{safe}', x: {x}, y: {y} }},"
        )
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# mountains.ts
# --------------------------------------------------------------------------- #


def gen_mountains() -> str:
    subs = [i.args["target"] for i in avg.walk(0x3006) if i.op == "JSRL"]
    lines = [
        HEADER,
        "//",
        "// The horizon mountain range.  MTNS ($3006) is a table of eight JSRL words,",
        "// one per 512-unit-wide segment; eight segments cover the full 360 degrees,",
        "// so the range is a cyclic strip 4096 vector units wide.",
        "//",
        "// MOUNTS (BZONE.MAC.txt:2437) draws it like this:",
        "//   H     = ((TANGLE << 8) | LANGLE) >> 4        the heading in 1/4096 turn",
        "//   start = 512 + (H & 0x1FF)                    beam moved right from centre",
        "//   HORIZN is drawn from there, 1536 units to the LEFT",
        "//   then three consecutive segments are drawn left to right from that point,",
        "//   beginning with segment index 7 - floor(H / 512).",
        "//",
        "// Solving that out gives the mapping used below: a feature at range coordinate",
        "// R (0..4095) appears at screen x = wrap(R + H - 512), where wrap() folds the",
        "// result into -2048..2047.  Only |x| < ~512 is on screen.",
        "//",
        "// Each segment is stored as polylines with y = 0 at the horizon and +Y up; the",
        "// pen always returns to y = 0 and advances exactly 512 units in x.",
        "",
        "import type { Picture2D } from './types';",
        "",
        "/** Width of one mountain segment in vector units. */",
        "export const SEGMENT_WIDTH = 512;",
        "/** Number of segments in the range. */",
        "export const SEGMENT_COUNT = 8;",
        "/** Total width of the cyclic range: 4096 units == 360 degrees of heading. */",
        "export const WRAP_WIDTH = SEGMENT_WIDTH * SEGMENT_COUNT;",
        "/** Heading units per full turn in the 12-bit value MOUNTS uses. */",
        "export const HEADING_UNITS = 4096;",
        "/** Constant offset in the range-to-screen mapping (the 512-unit pre-shift). */",
        "export const SCROLL_BIAS = 512;",
        "",
        "/**",
        " * Screen x for a range coordinate at a given heading.",
        " *",
        " * @param rangeX  0..4095, the position along the cyclic mountain strip.",
        " * @param heading12  ((TANGLE << 8) | LANGLE) >> 4, i.e. 0..4095 for a full turn.",
        " */",
        "export function rangeToScreenX(rangeX: number, heading12: number): number {",
        "  const x = (((rangeX + heading12 - SCROLL_BIAS) % WRAP_WIDTH) + WRAP_WIDTH) % WRAP_WIDTH;",
        "  return x >= WRAP_WIDTH / 2 ? x - WRAP_WIDTH : x;",
        "}",
        "",
        "/**",
        " * The eight segments, in range order.  Segment i occupies range coordinates",
        " * i * 512 .. i * 512 + 512.",
        " */",
        "export const MOUNTAIN_SEGMENTS: readonly Picture2D[] = [",
    ]
    for i, sub in enumerate(subs):
        polys, _zs = avg.polylines(sub)
        lines.append("  {")
        lines.append(f"    name: 'mtn{i}', // vector ROM ${sub:04X}")
        lines.append("    polylines: [")
        for pl in polys:
            lines.append("      [" + ", ".join(ts_num_list(p) for p in pl) + "],")
        lines.append("    ],")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    lines.append("/** The whole range as one picture, segments laid end to end from x = 0. */")
    lines.append("export const MOUNTAIN_RANGE: Picture2D = {")
    lines.append("  name: 'mountainRange',")
    lines.append("  polylines: [")
    ox = 0
    for i, sub in enumerate(subs):
        polys, _zs = avg.polylines(sub)
        for pl in polys:
            lines.append(
                "    ["
                + ", ".join(ts_num_list([p[0] + ox, p[1]]) for p in pl)
                + f"], // mtn{i}"
            )
        ox += 512
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    data = bm.build()
    msgs = collect_messages()
    out = {
        "src/data/models.ts": gen_models(data),
        "src/data/font.ts": gen_font(),
        "src/data/pictures.ts": gen_pictures(msgs),
        "src/data/mountains.ts": gen_mountains(),
    }
    for path, text in out.items():
        full = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as fh:
            fh.write(text)
        print(f"wrote {path} ({len(text.splitlines())} lines)")
    # Hand the result to Prettier so the generated files satisfy `npm run lint`.
    if shutil.which("npx"):
        subprocess.run(
            ["npx", "--no-install", "prettier", "--write", *out.keys()],
            cwd=ROOT,
            check=False,
        )
    else:
        print("npx not found; run `npm run format` before linting")
    return 0


MSG_LABELS = [
    "ETO",
    "LEFT",
    "RIGHT",
    "REAR",
    "LINE2",
    "LINE3",
    "LINE4",
    "CHISCR",
    "ERANGE",
    "BLOCKD",
    "GAMOVR",
    "PRSTRT",
    "YSCORE",
    "HISCOR",
    "ZEROS",
    "LINE1",
    "MODE1",
    "MODE2",
    "MODE3",
    "CONPLY",
    "INSCON",
    "BONPLN",
    "BONPL1",
    "COPYRT",
]


def collect_messages():
    dm = _load("decode_messages")
    base = dm.find_engmsg()
    out = []
    for i in range(24):
        ptr = dm.word_at(base + i * 2)
        x, y, text, _ = dm.read_string(ptr)
        # The copyright message starts with the two symbol glyphs, which are not
        # characters; represent them with the labels used in pictures.ts.
        text = text.replace("<4E>", "(C)").replace("<50>", "(P)")
        out.append((MSG_LABELS[i], i * 2, x, y, text))
    return out


if __name__ == "__main__":
    raise SystemExit(main())
