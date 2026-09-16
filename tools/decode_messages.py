#!/usr/bin/env python3
"""Extract Battlezone's on-screen text from the program ROMs.

The source keeps its text as ASCII (BZONE.MAC ".SBTTL DATA STRUCTURES"), but the
ASCVG macro that encodes it lives in ASCVG.MAC, which is not in the surviving
source listing.  So we read the encoded bytes straight out of the program ROMs
and decode them with the character table proved out in tools/decode_avg.py:

    char code = 2 * glyph index, glyph 0 = space, 1..10 = '0'..'9',
    11..36 = 'A'..'Z', 37 = space, 38 = underline.
    Bit 7 of a byte marks the last character of the string.

Every message record is:  <x/4 byte> <y/4 byte> <chars...>  where the two
position bytes are 0,0 when the message is drawn at the current beam position.

Usage: python3 tools/decode_messages.py [strings|tables]
"""

from __future__ import annotations

import os
import sys

SEGMENTS = [
    ("036414.02", 0x5000),
    ("036413.01", 0x5800),
    ("036412.01", 0x6000),
    ("036411.01", 0x6800),
    ("036410.01", 0x7000),
    ("036409.01", 0x7800),
]

CHARS = {0: " ", 74: " ", 76: "_"}
for _d in range(10):
    CHARS[(_d + 1) * 2] = str(_d)
for _i in range(26):
    CHARS[(11 + _i) * 2] = chr(ord("A") + _i)


def find_src_dir() -> str:
    if os.environ.get("BZ_SRC"):
        return os.environ["BZ_SRC"]
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(here, "atari-src"),
        os.path.join(here, "..", "atari-src"),
        "/private/tmp/claude-501/-Users-adamsilverstein-repositories-battlezone/"
        "93076bf2-4972-42a8-ad58-7835b52f6626/scratchpad/atari-src",
    ):
        if os.path.isfile(os.path.join(cand, "036414.02")):
            return os.path.abspath(cand)
    raise SystemExit("cannot find the program ROMs; set BZ_SRC")


def load() -> bytearray:
    src = find_src_dir()
    mem = bytearray(0x10000)
    for name, addr in SEGMENTS:
        with open(os.path.join(src, name), "rb") as fh:
            data = fh.read()
        mem[addr : addr + len(data)] = data
    return mem


MEM = load()


def sbyte(v: int) -> int:
    return v - 256 if v >= 128 else v


def read_string(addr: int, limit: int = 80):
    """Decode one message record; returns (x, y, text, next_addr)."""
    x = sbyte(MEM[addr])
    y = sbyte(MEM[addr + 1])
    out = []
    i = addr + 2
    while i < addr + 2 + limit:
        b = MEM[i]
        code = b & 0x7F
        out.append(CHARS.get(code, f"<{code:02X}>"))
        i += 1
        if b & 0x80:
            break
    return x, y, "".join(out), i


def word_at(addr: int) -> int:
    return MEM[addr] | (MEM[addr + 1] << 8)


# ENGMSG is the 24-entry English pointer table that immediately precedes
# ETOMSG.  ETOMSG starts with the position bytes -110., 74. = 92 4A, which
# occurs exactly once in the ROM, so we anchor on it.
def find_engmsg() -> int:
    hits = [i for i in range(0x5000, 0x8000) if MEM[i] == 0x92 and MEM[i + 1] == 0x4A]
    if len(hits) != 1:
        raise SystemExit(f"expected one ETOMSG anchor, found {hits}")
    return hits[0] - 48  # 24 words of pointer table


MSG_NAMES = [
    "ETO (ENEMY TO )",
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


def main() -> int:
    what = sys.argv[1] if len(sys.argv) > 1 else "strings"
    engmsg = find_engmsg()
    print(f"; ENGMSG table at ${engmsg:04X}, ETOMSG at ${engmsg + 48:04X}")
    langs = {"ENGLISH": engmsg}
    # The German/French/Spanish tables follow the English strings; locate them by
    # their first entry's position bytes (FR1 = -120.,74. ; SPN1 = -123.,74. ;
    # GRM1 = -123.,74.).  Rather than guess, just dump the English set plus every
    # 24-word table that points into the message area.
    if what == "tables":
        for name, base in langs.items():
            print(f"\n== {name}")
            for i in range(24):
                print(f"  {i:2d} {MSG_NAMES[i]:16s} -> ${word_at(base + i * 2):04X}")
        return 0
    for i in range(24):
        ptr = word_at(engmsg + i * 2)
        x, y, text, _ = read_string(ptr)
        print(f"{i:2d} {MSG_NAMES[i]:16s} ${ptr:04X} x={x:5d} y={y:5d}  |{text}|")
    # Default high score initials, FDGTBL in BZSTST.MAC (".ASCVG <EDRMPH...>").
    for start in range(0x7000, 0x8000 - 30):
        chunk = MEM[start : start + 30]
        if all((b & 0x7F) in CHARS for b in chunk):
            text = "".join(CHARS[b & 0x7F] for b in chunk)
            if text.startswith("EDRMPHJED"):
                print(f"\nFDGTBL at ${start:04X}: {text!r}")
                print("  initials:", [text[j : j + 3] for j in range(0, 30, 3)])
                break
    return 0


if __name__ == "__main__":
    sys.exit(main())
