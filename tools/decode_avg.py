#!/usr/bin/env python3
"""Decode the Atari Battlezone (1980) vector ROMs (036422.01 @ $3000, 036421.01 @ $3800).

Battlezone drives Atari's Analog Vector Generator (AVG).  Its instruction word
format is documented by the assembler macros in VGMC.MAC (Ed Logg, 8-Oct-79) and
by the runtime builders in VGUT.MAC; this decoder implements exactly those:

    word (little endian in ROM), opcode = bits 15..13

    0  VCTR  two words:  word0 = dy & 0x1FFF        (13-bit two's complement)
                         word1 = (z << 13) | (dx & 0x1FFF)
    1  HALT  0x2000
    2  SVEC  one word:   0x4000 | (z << 5) | ((dx // 2) & 0x1F)
                                          | ((dy << 7) & 0x1F00)
             i.e. dx = sext5(w & 0x1F) * 2, dy = sext5((w >> 8) & 0x1F) * 2
    3  STAT  0x6000 | (nowindow << 10) | (hi << 9) | (inout << 8) | (z << 4)
       SCAL  0x7000 | (binary_scale << 8) | linear_scale     (bit 12 selects)
    4  CNTR  0x8040  (centre the beam)
    5  JSRL  0xA000 | ((addr & 0x1FFF) >> 1)
    6  RTSL  0xC000
    7  JMPL  0xE000 | ((addr & 0x1FFF) >> 1)

The 12-bit address field is a *word* address inside the vector generator's own
8 KB space, which is the CPU range $2000..$3FFF (vector RAM $2000..$2FFF,
vector ROM $3000..$3FFF).  So cpu_addr = (field << 1) + 0x2000.

Coordinates are in "vector units" with +X right and +Y up (see the moon data in
BZMTNS.MAC, which walks upward with positive dy).

Usage:
    python3 tools/decode_avg.py dis  <hex addr> [...]   # disassembly
    python3 tools/decode_avg.py poly <hex addr> [...]   # polylines as JSON
    python3 tools/decode_avg.py font                    # font glyphs as JSON
    python3 tools/decode_avg.py verify                  # check vs BZMTNS.MAC
"""

from __future__ import annotations

import json
import os
import sys

ROM_BASE = 0x3000
ROM_END = 0x4000

# Symbol addresses taken verbatim from the linker map BZONE.MAP
# ("Global Symbol Summary", ATARI LINKM V05.00, 1-SEP-81).
SYMBOLS = {
    0x3000: "HORIZN",
    0x3006: "MTNS",
    0x33AC: "UNDERL",
    0x33F0: "VGMSGA",
    0x347A: "EXPIC",
    0x34CC: "XCROSS",
    0x3500: "XCROS1",
    0x353C: "RDRING",
    0x3590: "TSYMBL",
    0x36F8: "CRACKS",
    0x370A: "HATCH",
    0x3785: "ARCTAN",
    0x3886: "BONTBL",
    0x388A: "MISLVL",
    0x388E: "OBJPNT",
    0x3FAE: "EXPTBX",
    0x3FBA: "EXPTBY",
    0x3FC6: "IZVEL",
    0x3FCC: "PTBLO1",
    0x3FF7: "LOGOBJ",
}


def find_src_dir() -> str:
    """Locate the directory holding the original ROM images."""
    for env in ("BZ_SRC",):
        if os.environ.get(env):
            return os.environ[env]
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "atari-src"),
        os.path.join(here, "..", "atari-src"),
        "/private/tmp/claude-501/-Users-adamsilverstein-repositories-battlezone/"
        "93076bf2-4972-42a8-ad58-7835b52f6626/scratchpad/atari-src",
    ):
        if os.path.isfile(os.path.join(cand, "036422.01")):
            return os.path.abspath(cand)
    raise SystemExit("cannot find 036422.01 / 036421.01; set BZ_SRC")


def load_rom() -> bytearray:
    src = find_src_dir()
    rom = bytearray(ROM_END - ROM_BASE)
    with open(os.path.join(src, "036422.01"), "rb") as fh:  # mapped at $3000
        rom[0x0000:0x0800] = fh.read()
    with open(os.path.join(src, "036421.01"), "rb") as fh:  # mapped at $3800
        rom[0x0800:0x1000] = fh.read()
    return rom


ROM = load_rom()


def word(addr: int) -> int:
    off = addr - ROM_BASE
    return ROM[off] | (ROM[off + 1] << 8)


def sext(value: int, bits: int) -> int:
    sign = 1 << (bits - 1)
    return (value & (sign - 1)) - (value & sign)


def avg_addr(field_word: int) -> int:
    """Convert the 12-bit AVG word-address field into a CPU address."""
    return ((field_word & 0x0FFF) << 1) + 0x2000


class Instr:
    __slots__ = ("addr", "size", "op", "args", "text")

    def __init__(self, addr: int, size: int, op: str, args: dict, text: str):
        self.addr = addr
        self.size = size
        self.op = op
        self.args = args
        self.text = text


def decode_one(addr: int) -> Instr:
    w = word(addr)
    op = w >> 13
    if op == 0:  # VCTR (two words)
        w2 = word(addr + 2)
        dy = sext(w, 13)
        dx = sext(w2, 13)
        z = w2 >> 13
        return Instr(addr, 4, "VCTR", {"dx": dx, "dy": dy, "z": z}, f"VCTR {dx},{dy},{z}")
    if op == 1:
        return Instr(addr, 2, "HALT", {}, "HALT")
    if op == 2:  # SVEC (one word)
        dx = sext(w & 0x1F, 5) * 2
        dy = sext((w >> 8) & 0x1F, 5) * 2
        z = (w >> 5) & 7
        return Instr(addr, 2, "SVEC", {"dx": dx, "dy": dy, "z": z}, f"SVEC {dx},{dy},{z}")
    if op == 3:
        if w & 0x1000:  # SCAL
            binary = (w >> 8) & 0x0F
            linear = w & 0xFF
            return Instr(
                addr, 2, "SCAL", {"binary": binary, "linear": linear}, f"SCAL {binary},{linear}"
            )
        nowin = (w >> 10) & 1
        hi = (w >> 9) & 1
        inout = (w >> 8) & 1
        z = (w >> 4) & 0x0F
        return Instr(
            addr,
            2,
            "STAT",
            {"nowindow": nowin, "hi": hi, "inout": inout, "z": z},
            f"STAT z={z} nowindow={nowin} hi={hi} in={inout}",
        )
    if op == 4:
        return Instr(addr, 2, "CNTR", {"timer": w & 0xFF}, "CNTR")
    if op == 5:
        target = avg_addr(w)
        return Instr(addr, 2, "JSRL", {"target": target}, f"JSRL {target:04X}")
    if op == 6:
        return Instr(addr, 2, "RTSL", {}, "RTSL")
    target = avg_addr(w)
    return Instr(addr, 2, "JMPL", {"target": target}, f"JMPL {target:04X}")


def walk(addr: int, limit: int = 4096):
    """Decode straight-line code from addr up to and including RTSL/HALT/JMPL."""
    out = []
    pc = addr
    while len(out) < limit and ROM_BASE <= pc < ROM_END - 1:
        ins = decode_one(pc)
        out.append(ins)
        if ins.op in ("RTSL", "HALT", "JMPL"):
            break
        pc += ins.size
    return out


def flatten(addr: int, follow_jmpl: bool = True, limit: int = 20000):
    """Straight-line decode that follows JMPL (tail jumps).

    The character glyphs share their trailing strokes by jumping into the middle
    of other glyphs, so JMPL has to be followed to get a complete glyph.
    """
    out = []
    pc = addr
    hops = 0
    while len(out) < limit and ROM_BASE <= pc < ROM_END - 1:
        ins = decode_one(pc)
        out.append(ins)
        if ins.op == "JMPL":
            if not follow_jmpl or hops > 32:
                break
            hops += 1
            pc = ins.args["target"]
            continue
        if ins.op in ("RTSL", "HALT"):
            break
        pc += ins.size
    return out


def disassemble(addr: int, depth: int = 0, seen=None, out=None):
    if out is None:
        out = []
    if seen is None:
        seen = set()
    if addr in seen:
        return out
    seen.add(addr)
    pad = "  " * depth
    name = SYMBOLS.get(addr, "")
    out.append(f"{pad}; ---- {addr:04X} {name}")
    calls = []
    for ins in walk(addr):
        out.append(f"{pad}{ins.addr:04X}: {ins.text}")
        if ins.op == "JSRL":
            calls.append(ins.args["target"])
    for target in calls:
        disassemble(target, depth + 1, seen, out)
    return out


def polylines(addr: int, follow_jsrl: bool = True):
    """Run the display list and return (polylines, intensities).

    Each polyline is a list of [x, y] points in vector units.  A VCTR/SVEC with
    z == 0 is a blank move, which starts a new polyline.
    """
    polys: list[list[list[int]]] = []
    zs: list[int] = []
    pos = [0, 0]
    cur: list[list[int]] = []
    cur_z = 0

    def flush():
        nonlocal cur
        if len(cur) >= 2:
            polys.append(cur)
            zs.append(cur_z)
        cur = []

    def run(a: int, depth: int):
        nonlocal pos, cur, cur_z
        if depth > 6:
            return
        for ins in flatten(a):
            if ins.op in ("VCTR", "SVEC"):
                dx, dy, z = ins.args["dx"], ins.args["dy"], ins.args["z"]
                nxt = [pos[0] + dx, pos[1] + dy]
                if z == 0:
                    flush()
                else:
                    if not cur:
                        cur = [list(pos)]
                        cur_z = z
                    elif z != cur_z:
                        # Intensity change mid-stroke: keep drawing, remember the
                        # first intensity of the stroke.
                        pass
                    cur.append(nxt)
                pos = nxt
            elif ins.op == "CNTR":
                flush()
                pos = [0, 0]
            elif ins.op == "JSRL":
                if follow_jsrl:
                    run(ins.args["target"], depth + 1)
            elif ins.op in ("RTSL", "HALT"):
                break
            # JMPL is already followed by flatten(); nothing to do here.

    run(addr, 0)
    flush()
    return polys, zs


# --------------------------------------------------------------------------- #
# Font
# --------------------------------------------------------------------------- #

VGMSGA = 0x33F0
# The message/character code is used as a *byte* offset into VGMSGA, so
# glyph index = code / 2.
#
#   index 0        space      (code 0x00; proved by ETOMSG "ENEMY TO " whose
#                              terminating blank is byte 0x80 = 0x00 | end bit)
#   index 1..10    '0'..'9'   (VGHEX in VGUT.MAC: code = (digit + 1) * 2)
#   index 11..36   'A'..'Z'   (E = 0x1E, M = 0x2E, N = 0x30, O = 0x32,
#                              T = 0x3C, Y = 0x46 in ETOMSG)
#   index 37       space again (code 0x4A - the "blank" the player can pick
#                              when entering initials; shares glyph with 0)
#   index 38       UNDERL     (code 0x4C - the underline placeholder shown for
#                              initials not yet entered)
#
# '0' and 'O' share one glyph, and so do '5' and 'S'.
GLYPH_NAMES = {0: " ", 37: "<blank4A>", 38: "<underline>"}
for _d in range(10):
    GLYPH_NAMES[_d + 1] = str(_d)
for _i in range(26):
    GLYPH_NAMES[11 + _i] = chr(ord("A") + _i)


def glyph_entries(count: int = 39):
    """Read the VGMSGA JSRL table; entry i is the routine for glyph i."""
    out = []
    for i in range(count):
        w = word(VGMSGA + i * 2)
        if (w >> 13) != 5:
            out.append((i, None, w))
        else:
            out.append((i, avg_addr(w), w))
    return out


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        return 1
    cmd = argv[0]
    if cmd == "dis":
        for a in argv[1:]:
            print("\n".join(disassemble(int(a, 16))))
        return 0
    if cmd == "poly":
        res = {}
        for a in argv[1:]:
            addr = int(a, 16)
            polys, zs = polylines(addr)
            res[f"{addr:04X}"] = {"polylines": polys, "intensities": zs}
        print(json.dumps(res, indent=1))
        return 0
    if cmd == "table":
        for i, target, w in glyph_entries(int(argv[1], 10) if len(argv) > 1 else 39):
            print(
                f"{i:3d} code={i * 2:02X} word={w:04X} "
                f"target={'----' if target is None else f'{target:04X}'} "
                f"{GLYPH_NAMES.get(i, '?')}"
            )
        return 0
    if cmd == "font":
        out = {}
        for i, target, _w in glyph_entries():
            if target is None:
                continue
            polys, _zs = polylines(target)
            # The advance is the beam's net displacement over the whole glyph.
            pos = [0, 0]

            def net(a, depth=0, pos=pos):
                for ins in flatten(a):
                    if ins.op in ("VCTR", "SVEC"):
                        pos[0] += ins.args["dx"]
                        pos[1] += ins.args["dy"]
                    elif ins.op == "JSRL" and depth < 6:
                        net(ins.args["target"], depth + 1)
                    elif ins.op in ("RTSL", "HALT"):
                        break

            net(target)
            out[GLYPH_NAMES.get(i, f"idx{i}")] = {
                "index": i,
                "code": i * 2,
                "addr": f"{target:04X}",
                "polylines": polys,
                "advance": pos[0],
                "netY": pos[1],
            }
        print(json.dumps(out, indent=1))
        return 0
    if cmd == "verify":
        return verify()
    print(__doc__)
    return 1


# --------------------------------------------------------------------------- #
# Verification against the assembler source
# --------------------------------------------------------------------------- #

MTNS_EXPECT_HEAD = [
    ("VCTR", 0, 0x40, 0),
    ("VCTR", 0x20, -0x20, 3),
    # The assembler collapses small even deltas into a one-word SVEC.
    ("SVEC", -0x10, -8, 0),
    ("VCTR", 0x50, 0x28, 3),
]


def verify() -> int:
    ok = True
    # HORIZN: "VCTR -600,0,3 / RTSL"  (BZMTNS.MAC.txt:18-19)
    ins = walk(0x3000)
    if not (
        ins[0].op == "VCTR"
        and ins[0].args == {"dx": -0x600, "dy": 0, "z": 3}
        and ins[1].op == "RTSL"
    ):
        print("FAIL HORIZN:", [i.text for i in ins[:3]])
        ok = False
    # MTNS: eight JSRLs then MTN0 (BZMTNS.MAC.txt:22-36)
    ins = walk(0x3006)
    jsrls = [i for i in ins[:8] if i.op == "JSRL"]
    if len(jsrls) != 8:
        print("FAIL MTNS jsrl table:", [i.text for i in ins[:10]])
        ok = False
    else:
        mtn0 = jsrls[0].args["target"]
        head = walk(mtn0)[:4]
        got = [(i.op, i.args.get("dx"), i.args.get("dy"), i.args.get("z")) for i in head]
        if got != MTNS_EXPECT_HEAD:
            print("FAIL MTN0 head:", got)
            ok = False
        else:
            print(f"OK  MTNS: 8 subroutines, MTN0 at {mtn0:04X}")
    # XCROSS: CNTR then VCTR 0,-175,0 (BZMTNS.MAC.txt:484-486, .RADIX 10)
    ins = walk(0x34CC)
    if not (
        ins[0].op == "CNTR"
        and ins[1].op == "VCTR"
        and ins[1].args == {"dx": 0, "dy": -175, "z": 0}
        and ins[2].args == {"dx": 0, "dy": 100, "z": 3}
    ):
        print("FAIL XCROSS:", [i.text for i in ins[:4]])
        ok = False
    # RDRING: CNTR, VCTR 68,316,0 (BZMTNS.MAC.txt:552-554)
    ins = walk(0x353C)
    if not (ins[0].op == "CNTR" and ins[1].args == {"dx": 68, "dy": 316, "z": 0}):
        print("FAIL RDRING:", [i.text for i in ins[:3]])
        ok = False
    # TSYMBL: JSRL TANKS, first vector VCTR -6,6,6 (BZMTNS.MAC.txt:582,606)
    ins = walk(0x3590)
    if ins[0].op != "JSRL":
        print("FAIL TSYMBL:", ins[0].text)
        ok = False
    else:
        first = walk(ins[0].args["target"])[0]
        if first.args != {"dx": -6, "dy": 6, "z": 6}:
            print("FAIL TANKS:", first.text)
            ok = False
    # CRACKS: eight JSRLs then RTSL (BZMTNS.MAC.txt:814-829)
    ins = walk(0x36F8)
    if len([i for i in ins if i.op == "JSRL"]) != 8 or ins[8].op != "RTSL":
        print("FAIL CRACKS:", [i.text for i in ins[:10]])
        ok = False
    # EXPIC: GVCTR -16,0,0 => VCTR -64,0,0 (BZMTNS.MAC.txt:438, GVCTR scales x4)
    ins = walk(0x347A)
    if ins[0].args != {"dx": -64, "dy": 0, "z": 0}:
        print("FAIL EXPIC:", ins[0].text)
        ok = False
    # ARCTAN table: first bytes 0,0,0,0,1,1 ... last 0x20 (BZMTNS.MAC.txt:931-961)
    arc = list(ROM[0x3785 - ROM_BASE : 0x3785 - ROM_BASE + 256])
    if arc[:6] != [0, 0, 0, 0, 1, 1] or arc[255] != 0x20:
        print("FAIL ARCTAN:", arc[:8], arc[-4:])
        ok = False
    # BONTBL / MISLVL (BZMTNS.MAC.txt:965-967)
    if list(ROM[0x3886 - ROM_BASE : 0x388A - ROM_BASE]) != [0, 0x14, 0x24, 0x49]:
        print("FAIL BONTBL")
        ok = False
    if list(ROM[0x388A - ROM_BASE : 0x388E - ROM_BASE]) != [5, 0x10, 0x20, 0x30]:
        print("FAIL MISLVL")
        ok = False
    # OBJPNT[0] must point at PYRTBL whose first vertex is (-512,-512,-320)
    pyr = avg_word_ptr(0x388E)
    if read_points(pyr)[0] != (-512, -512, -320):
        print("FAIL PYRTBL:", read_points(pyr)[:2])
        ok = False
    # PTBLO1 (BZMTNS.MAC.txt:1670-1680)
    ptblo1 = list(ROM[0x3FCC - ROM_BASE : 0x3FF7 - ROM_BASE])
    if ptblo1[:4] != [0x0C, 0, 0x0F, 0x10] or ptblo1[-1] != 0xFF:
        print("FAIL PTBLO1:", ptblo1[:6], ptblo1[-2:])
        ok = False
    if list(ROM[0x3FF7 - ROM_BASE : 0x3FFD - ROM_BASE]) != [0x17, 0x80, 0x1E, 0x80, 0x1F, 0x80]:
        print("FAIL LOGOBJ")
        ok = False
    print("ALL CHECKS PASSED" if ok else "FAILURES")
    return 0 if ok else 1


def avg_word_ptr(addr: int) -> int:
    """Read a plain 6502 little-endian pointer (not an AVG instruction)."""
    return word(addr)


def read_points(addr: int):
    """Read one 3D vertex table: a length byte then <n> (x, y, z) word triples."""
    length = ROM[addr - ROM_BASE]
    pts = []
    off = addr + 1
    end = addr + length
    while off + 5 < end + 1:
        x = sext(word(off), 16)
        y = sext(word(off + 2), 16)
        z = sext(word(off + 4), 16)
        pts.append((x, y, z))
        off += 6
    return pts


if __name__ == "__main__":
    sys.exit(main())
