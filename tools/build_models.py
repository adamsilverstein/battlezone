#!/usr/bin/env python3
"""Rebuild Battlezone's 3D wireframe models from the original ROM images.

Two tables drive every 3D object in the game:

  * OBJPNT ($388E in the vector ROM, per BZONE.MAP) - 44 pointers to *vertex*
    tables.  Each vertex table is a length byte followed by (x, y, z) 16-bit
    little-endian triples.  See ".SBTTL PUT PROJECTED POINTS IN TABLE" /
    PNTPUT in BZONE.MAC.txt:3909+.

  * OBJTBL (in the program ROM) - 44 pointers to *draw lists*.  A draw list is
    a byte stream interpreted by DRAW (BZONE.MAC.txt:3651+):

        byte & 7 == 0   TDOT   - blank-move to point (byte >> 3), draw a dot
        byte & 7 == 1   SBRITE - set intensity to (byte & 0xF0)
        byte & 7 == 2   BVCTR  - blank (invisible) move to point (byte >> 3)
        byte & 7 == 3   TLABS  - reset the "current point" and move to (byte>>3)
        byte & 7 == 4   TVCTR  - draw a lit line to point (byte >> 3)
        byte & 7 == 5   TSPCL  - draw the 2D explosion picture EXPIC instead
        byte & 7 == 6   TSLIM  - no-op
        byte == 0xFF    OBJEND

    So an edge exists between the previous point and the point named by every
    TVCTR; TLABS/BVCTR only move the pen.

Usage: python3 tools/build_models.py [json|report]
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("decode_avg", os.path.join(HERE, "decode_avg.py"))
avg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(avg)

SEGMENTS = [
    ("036414.02", 0x5000),
    ("036413.01", 0x5800),
    ("036412.01", 0x6000),
    ("036411.01", 0x6800),
    ("036410.01", 0x7000),
    ("036409.01", 0x7800),
]


def load_prog() -> bytearray:
    """Whole 64K map: vector ROM at $3000..$3FFF plus program ROM $5000..$7FFF.

    Some vertex tables (BATBL/TLETBL/ZONTBL - the "BATTLE ZONE" logo letters)
    live in the program ROM, not the vector ROM, so OBJPNT entries can point
    into either region.
    """
    src = avg.find_src_dir()
    mem = bytearray(0x10000)
    mem[avg.ROM_BASE : avg.ROM_END] = avg.ROM
    for name, addr in SEGMENTS:
        with open(os.path.join(src, name), "rb") as fh:
            data = fh.read()
        mem[addr : addr + len(data)] = data
    return mem


PROG = load_prog()
OBJPNT = 0x388E
NOBJ = 44

# PYROBJ assembled: TLABS 0, SBRITE 0A0, TVCTR 4, TVCTR 1, TVCTR 0, TVCTR 3,
# TVCTR 4, TVCTR 2, TVCTR 3, BVCTR 2, TVCTR 1, OBJEND (BZONE.MAC.txt:8705-8728).
PYROBJ_BYTES = bytes([0x03, 0xA1, 0x24, 0x0C, 0x04, 0x1C, 0x24, 0x14, 0x1C, 0x12, 0x0C, 0xFF])


def pword(addr: int) -> int:
    return PROG[addr] | (PROG[addr + 1] << 8)


def find_objtbl() -> tuple[int, int]:
    hits = [i for i in range(0x5000, 0x8000) if PROG[i : i + 12] == PYROBJ_BYTES]
    if len(hits) != 1:
        raise SystemExit(f"PYROBJ not uniquely located: {[hex(h) for h in hits]}")
    pyrobj = hits[0]
    ptr = [i for i in range(0x5000, 0x8000 - 1) if pword(i) == pyrobj]
    if not ptr:
        raise SystemExit("no pointer to PYROBJ found")
    # OBJTBL is the table whose *first* word is PYROBJ and whose 44 entries all
    # point into the program ROM.
    for cand in ptr:
        words = [pword(cand + 2 * i) for i in range(NOBJ)]
        if all(w == 0 or 0x5000 <= w < 0x8000 for w in words):
            return cand, pyrobj
    raise SystemExit("OBJTBL not identified")


OBJTBL, PYROBJ = find_objtbl()


def read_vertices(addr: int):
    length = PROG[addr]
    pts = []
    off = 1
    while off + 6 <= length:
        x = avg.sext(pword(addr + off), 16)
        y = avg.sext(pword(addr + off + 2), 16)
        z = avg.sext(pword(addr + off + 4), 16)
        pts.append([x, y, z])
        off += 6
    return pts, length


def read_drawlist(addr: int):
    """Return (edges, dots, labs_points, brightness_list)."""
    edges: list[list[int]] = []
    dots: list[int] = []
    starts: list[int] = []
    brights: list[int] = []
    special = False
    cur = None
    i = addr
    for _ in range(256):
        b = PROG[i]
        i += 1
        if b == 0xFF:
            break
        cmd = b & 7
        idx = (b & 0xF8) >> 3
        if cmd == 0:
            dots.append(idx)
            cur = idx
        elif cmd == 1:
            brights.append(b & 0xF0)
        elif cmd == 2:
            cur = idx
        elif cmd == 3:
            starts.append(idx)
            cur = idx
        elif cmd == 4:
            if cur is not None:
                edges.append([cur, idx])
            cur = idx
        elif cmd == 5:
            special = True
        # cmd 6 (TSLIM) does nothing
    return edges, dots, starts, brights, special


# Names for each object slot, from OBJTBL / OBJPNT in the source listing
# (BZONE.MAC.txt:8677-8702 and BZMTNS.MAC.txt:969-990).
SLOT_NAMES = {
    0: ("PYROBJ", "PYRTBL"),
    1: ("CUBOBJ", "CUBTBL"),
    2: ("TNKOBJ", "TNKTBL"),
    3: ("SHLOBJ", "SHLTBL"),
    4: ("TREADS", "TREAD7"),
    5: ("TREADS", "TREAD6"),
    6: ("TREADS", "TREAD5"),
    7: ("TREADS", "TREAD4"),
    8: ("TREADS", "TREAD8"),
    9: ("TREADS", "TREAD9"),
    10: ("TREADS", "TREADA"),
    11: ("TREADS", "TREADB"),
    12: ("PYROBJ", "ROCK1"),
    13: ("RDROBJ", "RDRTBL"),
    14: ("EXPOBJ", "EXPTBL"),
    15: ("CUBOBJ", "ROCK2"),
    16: ("EX1OBJ", "EX1TBL"),
    17: ("EX2OBJ", "EX2TBL"),
    18: ("EX0OBJ", "EX0TBL"),
    19: ("RDROBJ", "RDRTBL"),
    20: ("EX2OBJ", "EX2TBL"),
    21: ("EX1OBJ", "EX1TBL"),
    22: ("R2DOBJ", "R2D3TB"),
    23: ("BT0OBJ", "BATBL"),
    24: ("EX2OBJ", "EX2TBL"),
    25: ("EX4OBJ", "EX4TBL"),
    26: ("EX1OBJ", "EX1TBL"),
    27: ("EX3OBJ", "EX3TBL"),
    28: ("EX1OBJ", "EX1TBL"),
    29: ("EX4OBJ", "EX4TBL"),
    30: ("BT1OBJ", "TLETBL"),
    31: ("BT2OBJ", "ZONTBL"),
    32: ("SAUOBJ", "SAUTBL"),
    33: ("TR7OBJ", "TR7TBL"),
    34: ("-", "-"),
    35: ("-", "-"),
    36: ("EXHOBJ", "REX0"),
    37: ("EXHOBJ", "REX1"),
    38: ("EXHOBJ", "REX2"),
    39: ("EXHOBJ", "REX3"),
    40: ("EXHOBJ", "REX4"),
    41: ("EXHOBJ", "REX5"),
    42: ("EXHOBJ", "REX6"),
    43: ("EXHOBJ", "REX7"),
}


def build():
    out = {}
    for slot in range(NOBJ):
        pnt = avg.word(OBJPNT + slot * 2)
        obj = pword(OBJTBL + slot * 2)
        if pnt == 0 or obj == 0:
            continue
        verts, length = read_vertices(pnt)
        edges, dots, starts, brights, special = read_drawlist(obj)
        objname, pntname = SLOT_NAMES.get(slot, ("?", "?"))
        out[slot] = {
            "slot": slot,
            "objName": objname,
            "pntName": pntname,
            "pntAddr": f"{pnt:04X}",
            "objAddr": f"{obj:04X}",
            "tableLength": length,
            "vertices": verts,
            "edges": edges,
            "dots": dots,
            "starts": starts,
            "brightness": brights,
            "special": special,
        }
    return out


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "report"
    data = build()
    if mode == "json":
        print(json.dumps(data, indent=1))
        return 0
    print(f"; OBJTBL at ${OBJTBL:04X}, PYROBJ at ${PYROBJ:04X}, OBJPNT at ${OBJPNT:04X}")
    bad = 0
    for slot, d in data.items():
        n = len(d["vertices"])
        idxs = [i for e in d["edges"] for i in e] + d["dots"] + d["starts"]
        oor = [i for i in idxs if i >= n]
        flag = "" if not oor else f"  !! out-of-range indices {sorted(set(oor))} (n={n})"
        if oor:
            bad += 1
        print(
            f"{slot:3d} {d['objName']:7s} {d['pntName']:7s} "
            f"pnt=${d['pntAddr']} obj=${d['objAddr']} "
            f"len={d['tableLength']:3d} verts={n:2d} edges={len(d['edges']):2d} "
            f"dots={len(d['dots'])} bright={[hex(b) for b in d['brightness']]}"
            f"{' SPECIAL' if d['special'] else ''}{flag}"
        )
    print(f"; {bad} objects with out-of-range point indices")
    return 0


if __name__ == "__main__":
    sys.exit(main())
