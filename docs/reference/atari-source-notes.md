# How the original Battlezone works

Notes taken from the surviving Atari source listing for Battlezone (project
22503, programmer Edward Rotberg, project leader Morgan Hoff, released 31 August 1981) together with the released ROM images.

Everything is referenced to a file and line. The listings used are the
line-ending-normalised copies (`*.MAC.txt`, `*.DOC.txt`), which have a blank line
between every line of code, so quoted numbers are always the odd-numbered code
lines. **The listings are not part of this repository** - they are the published
Atari sources at <https://github.com/historicalsource/battlezone>, and every
`BZONE.MAC.txt:NNNN` style citation in the notes and in the code refers to a file
there. Where a fact could not be established from the source it is called out as
such rather than guessed.

Cross-checked against Andy McFadden's annotated rev-2 disassembly at
<https://6502disassembly.com/va-battlezone/>, which independently reports the same
score values, missile DIP thresholds, 250 Hz NMI, 41.7 Hz refresh and 21 fixed
obstacles.

## Files, memory and the vector generator

`BZONE.DOC.txt` is the release document: six 2K program ROMs at `$5000`-`$7FFF`,
two 2K "vector/program" ROMs at `$3000` and `$3800`, a vector state PROM, a
MathBox mapping PROM and six MathBox microcode PROMs (BZONE.DOC.txt:10-58). The
link order is `BZMTNS, BZONE, BZSOUN, VGUT, BZSTST` (BZONE.DOC.txt:80), which is
why `BZMTNS.MAC` - the vector ROM contents - assembles first at `$3000`.

Memory map, from BZONE.MAC.txt:609-756: zero page and `$0200`-`$03FF` hold the
game state and high score table; `$0800` is `HALT` (D0 = vector generator halted,
D7 = a 3 kHz square wave); `$0A00`/`$0C00` are the `OPTION`/`OPTON2` DIP switches;
`$1200`/`$1600` start and stop the vector generator; `$1400` is the watchdog;
`$1800` the MathBox; `$1820` POKEY; `$1840` the discrete sound latch;
`$2000`-`$2FFF` vector RAM (two display buffers) and `$3000`-`$3FFF` the vector
ROM; `MAIN` is at `$5000`.

Two files the listing references are missing: `VGAN.MAC`, which holds the
character font, and `ASCVG.MAC`, which holds the macro that encodes text strings.
Both were recovered by decoding the ROM images - see `tools/decode_avg.py` and
`tools/decode_messages.py`. `BZONE.MAP`, the linker map, is the key to the vector
ROM: its global symbol summary gives absolute addresses for `HORIZN` (`$3000`),
`MTNS` (`$3006`), `UNDERL` (`$33AC`), `VGMSGA` (`$33F0`), `EXPIC` (`$347A`),
`XCROSS` (`$34CC`), `XCROS1` (`$3500`), `RDRING` (`$353C`), `TSYMBL` (`$3590`),
`CRACKS` (`$36F8`), `ARCTAN` (`$3785`), `BONTBL` (`$3886`), `MISLVL` (`$388A`),
`OBJPNT` (`$388E`), `EXPTBX` (`$3FAE`), `IZVEL` (`$3FC6`), `PTBLO1` (`$3FCC`) and
`LOGOBJ` (`$3FF7`) - the full list is `SYMBOLS` in `tools/decode_avg.py`.

Battlezone drives Atari's Analog Vector Generator. `VGMC.MAC.txt` gives the
encoding as assembler macros and `VGUT.MAC.txt` builds the same instructions at
run time. The opcode is the top three bits of the word and words are
little-endian in ROM. `HALT` is `$2000`, `CNTR` (centre the beam) is `$8040`,
`RTSL` is `$C000`, and `JSRL`/`JMPL` are `$A000`/`$E000` plus
`(addr & 0x1FFF) / 2`. The rest:

| Opcode | Name          | Size    | Encoding                                                                                                                                 |
| ------ | ------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `VCTR`        | 2 words | `dy & 0x1FFF`, then `(z << 13) \| (dx & 0x1FFF)`, both 13-bit two's complement (VGMC.MAC.txt:248)                                        |
| 2      | `SVEC`        | 1       | `$4000 \| (z << 5) \| ((dx/2) & 0x1F) \| ((dy << 7) & 0x1F00)` - used only when both deltas are even and within +/-30 (VGMC.MAC.txt:240) |
| 3      | `STAT`/`SCAL` | 1       | `$6000` plus window flags and a 4-bit intensity, or `$7000` plus a power-of-two and linear scale; bit 12 chooses (VGMC.MAC.txt:124, 150) |

The 12-bit address field is a _word_ address inside the vector generator's own
8 KB space, which the CPU sees at `$2000`-`$3FFF`, so a `JSRL` field of `$0C00`
means CPU `$3800`. Five levels of nesting are available (VGMC.MAC.txt:160).
`tools/decode_avg.py verify` checks this decode against a dozen values visible in
the `BZMTNS.MAC.txt` listing, and they all match.

## Frame timing and the main loop

The NMI is the 3 kHz line divided by 12, so 250 Hz - the source header calls it
"NMI (4 US)", meaning 4 ms (BZONE.MAC.txt:41), and the self test documents the
3 kHz square wave it comes from (BZSTST.MAC.txt:425).

The NMI (BZONE.MAC.txt:2105-2419) bumps `$INTCT` and every sixteenth time also
bumps `SYNC`, commented "IF NOT END OF FRAME (64 MS)" (BZONE.MAC.txt:2115-2123);
kicks the watchdog; runs the coin routine `MOOLAH`; calls `MODSND` to advance any
sound; computes and writes the discrete sound latch; and counts `VTIMER` down
from 6, on zero stopping the vector generator, swapping display buffers if the
CPU has finished the other one, and restarting it - "START UP VECTOR GENERATOR
FOR 24 MS" (BZONE.MAC.txt:2375-2407).

So there are three rates. **250 Hz** is the NMI, coin handling and the sound
sequencer, so a "frame" in the BZSOUN tables is one NMI, 4 ms - the BZSOUN header
says 16 ms (BZSOUN.MAC.txt:33) but that comment is inherited from Tube Chase and
the game calls `MODSND` unconditionally from the NMI (BZONE.MAC.txt:2163).
**41.7 Hz** (250/6) is the display refresh, so the same display list is redrawn
about 2.7 times per game tick. **15.625 Hz** (250/16) is the game logic: `MAIN`
opens with `LSR SYNC / BCC MAIN` (BZONE.MAC.txt:793), so exactly one pass of
`MAIN` happens per `SYNC`.

`FRAME` increments once per tick (BZONE.MAC.txt:827) and `TIMOUT` once per
`FRAME` wrap, so one `TIMOUT` unit is 256 ticks = 16.384 s.

One pass of `MAIN` (BZONE.MAC.txt:793-1215), in order: wait for `SYNC`; move the
volcano rocks (`VOLCNO`); wait for a free display buffer, point `VGLIST` at it,
emit `SCAL 1` and set the lower clipping window to (-508, -508); bump
`FRAME`/`TIMOUT`; branch away to the high score or attract display if either is
active; open the upper window to (508, 192) - the periscope view area - and emit
the copyright line if a game is running; draw the mountains and horizon
(`MOUNTS`); decrement `ACTION` and saturate `FTIMER`; `ROTATE` to translate,
rotate and cull every object, then `BATTLE` for the attract logo; for each
survivor call `PNTPUT` to project its vertices and `DRAW` to emit vectors; if the
player is dead jump to `WNSHLD` instead; open the window fully (`BIGWND`) and
draw the radar; emit the reticle, direction prompts, "MOTION BLOCKED BY OBJECT",
the score and lives (`INFO`) and the game-over text; `FINISH` to append `HALT`
and mark the buffer ready; and finally the game logic - four passes of `COLCHK`
plus `SHUPDT`, then `QWIKCK`, `ROBOT`, `SAUCMV`, `BOUND` and `MOTION`.

Drawing happens _before_ movement for the same tick, so the screen is always one
tick behind the state the logic just computed.

## The object tables

Two parallel 44-entry tables are indexed by an "object number":

- `OBJPNT` at `$388E` (BZMTNS.MAC.txt:969-990) points to **vertex tables**: a
  length byte (the byte size of the whole table) followed by (x, y, z) triples of
  signed 16-bit words, so the vertex count is `(length - 1) / 6`. `PNTPUT` reads
  six bytes per vertex and stops when its offset reaches the length
  (BZONE.MAC.txt:4011-4099).
- `OBJTBL` at `$7472` (BZONE.MAC.txt:8677-8702) points to **draw lists**: byte
  streams interpreted by `DRAW` (BZONE.MAC.txt:3671-3905), where the low three
  bits are the command and the top five a point index. `TDOT` (0) blank-moves and
  draws a dot; `SBRITE` (1) sets intensity from bits 4-7; `BVCTR` (2)
  blank-moves; `TLABS` (3) resets the pen to screen centre then moves; `TVCTR`
  (4) draws a lit line; `TSPCL` (5) draws the flat `EXPIC` explosion picture;
  `TSLIM` (6) does nothing; `$FF` ends the list. Macros at
  BZONE.MAC.txt:8367-8417.

Every edge in `src/data/models.ts` is one `TVCTR`, joining the previous point to
the named one. The pen is tracked in `CURNTX`/`CURNTY` so each vector is emitted
as a delta (`DOVECT`, BZONE.MAC.txt:3843-3897).

| Slots        | Vertices                    | Draw list         | What it is                                                                                  |
| ------------ | --------------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| 0 / 12       | `PYRTBL` / `ROCK1`          | `PYROBJ`          | pyramid obstacle: narrow (1024 across), wide (1600)                                         |
| 1 / 15       | `CUBTBL` / `ROCK2`          | `CUBOBJ`          | box obstacle: tall (1024 cubed), short (1280 wide, 280 tall)                                |
| 2            | `TNKTBL`                    | `TNKOBJ`          | enemy slow tank, 24 vertices                                                                |
| 3            | `SHLTBL`                    | `SHLOBJ`          | shell                                                                                       |
| 4-7 / 8-11   | `TREAD4`-`7` / `TREAD8`-`B` | `TREADS`          | rear and front tread, four animation frames each                                            |
| 13, 19       | `RDRTBL`                    | `RDROBJ`          | the tank's rotating radar dish                                                              |
| 14           | `EXPTBL`                    | `EXPOBJ`          | a single point; `TSPCL` draws `EXPIC` at it                                                 |
| 16-21, 24-29 | `EX0TBL`-`EX4TBL`           | `EX0OBJ`-`EX4OBJ` | the explosion fragments, reused between tank and missile                                    |
| 22           | `R2D3TB`                    | `R2DOBJ`          | the missile, 26 vertices                                                                    |
| 23, 30, 31   | `BATBL`, `TLETBL`, `ZONTBL` | `BT0`-`BT2OBJ`    | "BA", "TTLE", "ZONE" of the logo                                                            |
| 32           | `SAUTBL`                    | `SAUOBJ`          | saucer, 17 vertices                                                                         |
| 33           | `TR7TBL`                    | `TR7OBJ`          | supertank, 25 vertices                                                                      |
| 36-43        | `REX0`-`REX7`               | `EXHOBJ`          | eight rings of eight dots: the missile exhaust plume, and the dot cloud when a missile dies |

Slots 34 and 35 are zero and unused; the exact slot-by-slot mapping is in
`tools/build_models.py`.

The `.NWORD` macro that emits vertex tables multiplies every literal by 4
(BZMTNS.MAC.txt:991-999), so the numbers as typed are a quarter of what lands in
the ROM. The logo letters use `.MWORD`, which scales x and y by 4 and z by 2
first (BZONE.MAC.txt:9623-9627), so their stored words are 16x, 16y and 8z.
`src/data/models.ts` carries the ROM values.

**Coordinate convention.** `PNTPUT` feeds word 0 to `XMATRX`, word 1 to
`YMATRX`, and word 2 becomes the numerator of the vertical perspective divide
(BZONE.MAC.txt:4011-4035, 4055-4067). So a vertex is **(forward, left, up)** in
the object's own frame - the third component is the height, not the second. The
viewpoint is at height 0 and the ground at -320; the pyramid, box, tank,
supertank and saucer tables all bottom out at exactly -320.

## ROTATE, DRAW and the MathBox

The MathBox is a microcoded AMD 2901 bit-slice unit on the auxiliary board
occupying 32 addresses at `$1800` (MBUDOC.DOC.txt:27-117). Its microcode source
is `MBUCOD.V05` (programmer Mike Albaugh; revision 4 is "ADD DSTNCE FOR BATTLE
ZONE (ED ROTBERG)"). What the game uses:

| Write                             | Result                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `YSTRT1` `$186B`                  | pre-sub multiply: `(X - E) * A - (Y - F) * B` (MBUDOC.DOC.txt:63-67)         |
| `RSTRT1` `$1872`                  | companion multiply: `(X - E) * B + (Y - F) * A` (MBUDOC.DOC.txt:87-89)       |
| `YSTRT2` `$1871`                  | "the whole mess": `(X*B + Y*A + F) / (X*A - Y*B + E)` (MBUDOC.DOC.txt:81-83) |
| `ZDIV` `$1874`                    | divide the 32-bit `Z` dividend by the `X'` left from the last multiply       |
| `DSTNCE` `$187D` / `DST2` `$187E` | the distance routine                                                         |
| `DIVCYC` `$186C`                  | quotient bit count; the game writes 10 (BZONE.MAC.txt:929)                   |

`MSTAT` bit 7 is "busy"; `WAIT` (BZONE.MAC.txt:3419) polls it then reads
`MOUTLO`/`MOUTHI`.

`DSTNCE` is **not** a true hypotenuse. The microcode takes `|dx|` and `|dy|`,
sorts them, and returns `max + min/4 + min/8`, i.e. `max + 3/8 * min`
(`MBUCOD.V05`, ".SBTTL DISTANCE ROUTINE GIVEN TWO POINTS"; the comment there says
"2/3" but the three shift instructions add 1/4 and 1/8). `DST2` skips the
subtraction and combines two already-absolute deltas. This octagonal
approximation underlies every range check in the game.

**ROTATE** (BZONE.MAC.txt:2869-3303) loads the player position into E and F and
the sine and cosine of the view angle into B and A, then calls `ROTPNT` for the
enemy tank (plus treads and dish), both shells, the saucer and the 21 obstacles.
`ROTPNT` (BZONE.MAC.txt:3313-3409) starts the pre-sub multiply, reads the rotated
depth `X'`, doubles it, starts the second multiply, reads the lateral offset
`Y'`, doubles it, and culls: reject if `X'` is negative (behind the viewer), if
`X' * 2` overflows 15 bits, if `X' < 512` (too close), if `X' >= 15744` (too far)
or if `|Y'| >= X'`. That last test is an exact **45-degree half field of view**,
so the horizontal view is 90 degrees. Survivors go to
`PTBLX2`/`PTBLY2`/`PTBLO2`, terminated with a negative object number; there is
room for 28 (`NOBJ`, BZONE.MAC.txt:525).

The sine table is a quarter-wave of 65 16-bit entries (BZONE.MAC.txt:4279-4311)
reflected into the other quadrants by `SIN`/`COS`. `SINXTR`/`COSXTR`
(BZONE.MAC.txt:4337-4425) interpolate halfway between entries, which is how the
extra fractional bit in `LANGLE` is used for the view angle and shell velocities.

**PNTPUT** (BZONE.MAC.txt:3927-4101) sets A and B from
`player heading - object heading` and E and F to the object's already-rotated
depth and lateral offset. Then per vertex: write the forward and left components
to X and Y and trigger `YSTRT2`, which rotates the vertex into view space, adds
the object's own view-space position and divides - giving `lateral / depth`,
which `PNTPUT` negates and stores as screen x. Then take the vertex's third word
(its height), add the explosion Z offset and subtract the view shake (`KLUDGE`,
BZONE.MAC.txt:4119-4175) and trigger `ZDIV`, dividing by the depth left over from
the first step - giving `height / depth` as screen y.

Both divides are 10-bit. The exact fixed-point scale is nowhere in the source;
since the mountains scroll 512 vector units per 45 degrees and the view is
clipped at 45 degrees, the horizontal scale must be about
`512 * lateral / depth`, matching the 1016-unit-wide clipping window. That
inference is recorded as `SCREEN_SCALE` in `src/data/constants.ts` and flagged
there as inferred.

**Depth cueing and clipping.** `PNTPUT` saves the high nibble of the object's
depth in `DQUE` (BZONE.MAC.txt:3989) and `DRAW`'s `SBRITE` subtracts it from the
object's own intensity, clamping at `$30` (BZONE.MAC.txt:3761-3775), so distant
objects dim to a floor; the saucer and logo bypass this and use `SINT`. `MAIN`
sets the clipping window with a blank vector to (-508, -508) plus `STAT 0` for
the lower-left corner and one to (508, 192) plus `STAT 2` for the upper-right
(BZONE.MAC.txt:813-825, 895-907), so the 3D view is clipped to y <= 192 and the
strip above is left for the radar and score; `BIGWND` (BZONE.MAC.txt:1217)
re-opens the top to 508 before the radar, score and text, and `DRAW` emits `STAT`
with the "no clipping window" bit for object vectors.

## The playfield

There are 21 obstacles and they never move or change. Types and orientations are
in `PTBLO1` in the vector ROM at `$3FCC` (BZMTNS.MAC.txt:1669-1680) as pairs of
(object number, orientation); positions are in `PTBLX1` and `PTBLY1` at `$7681`
and `$76AB` in the program ROM (BZONE.MAC.txt:9597-9619). The pattern cycles wide
pyramid, short box, pyramid, box with orientations stepping by 8. Positions are
16-bit and wrap, so the battlefield is a 65536 x 65536 torus with the obstacles
scattered across it. The full list is `OBSTACLES` in `src/data/constants.ts`.

## Mountains, moon and volcano

`MTNS` at `$3006` is a table of eight `JSRL` words, one per mountain segment
(BZMTNS.MAC.txt:22-36). Decoding them shows each segment is exactly 512 vector
units wide and returns the pen to y = 0, so the eight form a cyclic strip 4096
units wide covering 360 degrees - one segment is 45 degrees.

`MOUNTS` (BZONE.MAC.txt:2437-2691) builds a 12-bit heading
`H = ((TANGLE << 8) | LANGLE) >> 4`, i.e. 0..4095 for a full turn
(BZONE.MAC.txt:2443-2463); forces the high byte so the beam offset lands in
512..1023, which is `512 + (H & $1FF)` (BZONE.MAC.txt:2465-2471); subtracts the
view shake from y (BZONE.MAC.txt:2473-2497); emits `CNTR`, moves the beam there
and calls `HORIZN` - a single 1536-unit vector drawn to the _left_, exactly three
segments wide (BZONE.MAC.txt:2499-2507, BZMTNS.MAC.txt:18); then from where the
horizon ended draws three consecutive segments left to right, starting at segment
index `7 - floor(H / 512)` (BZONE.MAC.txt:2509-2517, 2673-2691).

Solving that out gives the mapping implemented as `rangeToScreenX` in
`src/data/mountains.ts`: a feature at range coordinate `R` (0..4095, where
segment `s` occupies `512s .. 512s + 512`) appears at
`screen_x = wrap(R + H - 512)`, wrapped into -2048..2047. Only about
`|screen_x| < 512` is visible. Increasing `TANGLE` turns left and moves the range
right, which is correct.

**The moon** is inside segment 0 (`MTN0`, `$3016`). Once the outline reaches local
x = 448 the beam jumps to (496, 160) and draws the crescent with 14 vectors at
intensity 7, a shaded inner edge with 6 vectors at intensity 2, and three small
clusters at intensity 5 (BZMTNS.MAC.txt:70-134), peaking at y = 163. So the moon
sits at range coordinate ~480, which puts it at screen centre at heading 0.

**The volcano** is the jagged crater at the right-hand end of segment 5 (`MTN5`,
`$31F2`) - the last four short vectors before the pen returns to the horizon,
peaking at y = 96 (BZMTNS.MAC.txt:308-320). Its range coordinate is about 3064
(5 x 512 + 504). `MOUNTS` draws the eruption separately and only when the heading
is between `$39` and `$88` (BZONE.MAC.txt:2521-2533), computing the crater's
screen position as `H - $605` horizontally and `$5E` (94) vertically
(BZONE.MAC.txt:2535-2577) - which agrees with the crater's position inside `MTN5`
to within a few units and so confirms the mapping above. It then walks the five
rock slots and draws a dot at each active one, with intensity taken from the
rock's remaining lifetime (BZONE.MAC.txt:2593-2671).

`VOLCNO` (BZONE.MAC.txt:2721-2839, credited in the source to "RUWEN OBIN") runs
once per tick and manages five rocks. An idle slot has a 1-in-8 chance of
launching: lifetime `$1F` ticks, horizontal speed 1..4 in a random direction,
vertical speed 5..12. Each tick the vertical speed drops by 1, the position is
integrated, and a rock falling more than `$A2` below the crater is killed.

## The enemy tank and supertank

There is only ever one enemy. It lives at index 2 of the shared two-entry arrays
(`TPOSX+2`, `TANGLE+2`, `FIRECT+2`, `COLFLG+2`) with the player at index 0 -
which is why so much of the code is written with `X` as 0 or 2. `TR7CHK`
(BZONE.MAC.txt:7315-7323) decides which tank it is: the supertank appears once
`NOR2D3`, the count of missiles launched so far starting at 0, reaches 5.

`ROBOT` (BZONE.MAC.txt:5791-6141) runs once per tick. It returns if the enemy is
exploding and jumps to `BUZBOM` if it is a missile; otherwise it saves the
position for a possible back-out and advances the tank's own radar dish by `$0B`
heading units. If `STATE` bit 0 is set the tank is backing out of a collision: it
reverses and turns, and when `ACTION` reaches 0 picks a fresh random goal with
`ACTION` = `$34` (BZONE.MAC.txt:5815-5859). If `ACTION` is 0 it is decision time.
Otherwise it compares its heading with `RGOAL`: an error larger than `SKILL` makes
it pivot towards the goal - two steps for a tank, four for a supertank - calling
`FIREIT` between each (BZONE.MAC.txt:5867-5931); a smaller error makes one fine
turn step, then `FIREIT`, then a range check (a tank closes only while the
distance high byte is at least 5, the supertank while it is at least 8) and one
forward step, doubled for the supertank (BZONE.MAC.txt:5949-6001). A collision
backs the move out, sets `STATE` bits 0-1 to a random retreat direction and
`ACTION` = `$30` (BZONE.MAC.txt:6003-6047).

**Picking a heading.** At decision time (BZONE.MAC.txt:6049-6141): in attract
mode the tank always drives randomly. If `FTIMER` has saturated at `$FF` - alive
255 ticks, 16.3 s - it attacks unconditionally. Otherwise a POKEY random coin
flip may choose attack. A score of 10000 or more always attacks. Below that it
compares the score with the number of times it has killed the player (`HITS+2`):
equal means evade, player behind means drive randomly, player ahead means attack.
`R.ATCK` sets `RGOAL` to the bearing from `TRACK`; `R.EVAD`
(BZONE.MAC.txt:6081-6109) sets it to the bearing plus `$40` - 90 degrees off -
with `ACTION` = `$40`, and one time in eight instead sets `STATE` bit 0 so the
tank reverses; `R.RAND` (BZONE.MAC.txt:6111-6131) nudges `RGOAL` by a random
amount masked to `$1F`.

`TRACK` (BZONE.MAC.txt:6883-7075) is the bearing routine: signed differences in x
and y, quadrant recorded, smaller divided by larger on the MathBox, the ratio
looked up in the 256-byte `ARCTAN` table at `$3785` (which runs 0..`$20`, i.e.
0..45 degrees), subtracted from 90 degrees if needed, then fixed up for the
quadrant through a four-way jump table.

**Firing.** `FIREIT` (BZONE.MAC.txt:6155-6301) refuses to fire if `FTIMER` is
under `$20` - the enemy has been alive less than 32 ticks, 2.05 s; if the heading
error to the player is 2 units or more (about 2.8 degrees); if an enemy shell is
already in the air; or if the player has already been hit. And unless `FTIMER`
has saturated or the score is 2000 or more it additionally will not fire unless
the player's view is within `$20` heading units of it and `TDIST` is under `$24`
(BZONE.MAC.txt:6167-6187) - the beginner handicap, so a new player is only ever
shot at from in front and from close range. Firing loads `FIRECT+2` with `$7F`,
sets the soft-shell sound bit, computes the velocity as the 16-bit sine and
cosine shifted right seven places (256 times the unit vector) and copies the
enemy position into `SHELLX+2`/`SHELLY+2`.

**Placing a new enemy.** `ROBCHK` (BZONE.MAC.txt:7349-7389) makes the next enemy
a missile only if the score has passed `MISLVL` and a POKEY-random coin flip
agrees. `TANKCK` (BZONE.MAC.txt:7391) sets up a tank, `R2D3CK`
(BZONE.MAC.txt:7453) a missile, and both fall into `ROB1` (BZONE.MAC.txt:7483),
which picks a heading offset from the player, takes its cosine and sine,
subtracts a quarter (so 3/4 of full scale), optionally halves it again for a
tank, and adds the result to the player's position. The
heading spread narrows as the player improves: the window mask starts at `$0F`
and is tightened by shifting ones in from the top as `score - deaths` rises
(BZONE.MAC.txt:7407-7451), so a good player gets enemies in front of them and a
beginner gets them anywhere. `FTIMER` and `EIRNGE` are reset, starting the new
enemy's grace period.

## The missile (buzz bomb)

The source calls it `R2D3`, and its header says it "flies the buzz bomb directly
at player, at high speed, swooping in on him. If another object is encountered,
buzz-bomb levitates and restarts swooping" (BZONE.MAC.txt:6303-6325).

`BUZBOM` (BZONE.MAC.txt:6325-6675) runs in place of `ROBOT`:

1. bump the tread counter, which cycles the exhaust picture through
   `REX0`-`REX7` (object number computed at BZONE.MAC.txt:3007-3015);
2. **the levitate logic.** Compare the missile's height `EXPOSZ+$0C` against
   `TOP` = `$200` and AND the result with `OBJCOL+2`, its obstacle collision
   flag. If the missile is both below `TOP` and in collision, jump to `30$`,
   which does `INC EXPOSZ+$0D` - it climbs `$100` per tick and does nothing else
   (BZONE.MAC.txt:6327-6345, 6621). This is the levitation the header describes:
   blocked by a pyramid or box, the missile rises over it;
3. keep the approach in front of the player. If the difference between the
   player's heading and `RGOAL` is under `$40` (90 degrees) the goal is nudged
   away by one or two units per tick; otherwise `TRACK` is used and `RGOAL` is
   stepped one or two units towards the true bearing (BZONE.MAC.txt:6347-6407).
   So a missile never attacks from directly behind;
4. decide whether to weave. The threshold is `MISLVL + $25` in BCD minus the
   score, clamped to at least 8 and compared with `TDIST`
   (BZONE.MAC.txt:6409-6451), so a better player gets weaving from further out.
   Below the threshold the flight heading becomes `RGOAL` plus or minus
   `FRAME & $1F`, with the sign flipping every 16 ticks
   (BZONE.MAC.txt:6457-6483) - a widening then narrowing zig-zag;
5. take the sine and cosine of that heading, shift both left twice - four times
   the player's per-step distance, about twice the player's top speed - and call
   `M.FOR1` (BZONE.MAC.txt:6485-6565);
6. `QWIKCK` for the player's shell, then `OBJOBJ`. Clear of obstacles,
   `OBJCOL+2` is cleared and the missile sinks `$100` per tick until it reaches
   the ground (BZONE.MAC.txt:6583-6595); blocked while already on the ground, the
   position change is backed out and `OBJCOL+2` set, starting the climb next tick
   (BZONE.MAC.txt:6597-6619);
7. if `OBJOBJ` reports a tank-tank collision both blow up: `COLFLG` and
   `COLFLG+2` set, `CRACK` = 2, `BOUNCE` = -1, the enemy's kill count bumped, the
   missile engine channels silenced, `EXINIT` called and a life lost
   (BZONE.MAC.txt:6625-6675).

A missile is released at height `STARTZ` = `$1800` (BZONE.MAC.txt:7455) and is
only hittable once below `TOP` (BZONE.MAC.txt:4527-4535). If it flies out of
radar range `DRADAR` replaces it with a tank after `TIMOUT` reaches 4, or
restarts it if not (BZONE.MAC.txt:7869-7885).

## The saucer

`SAUCMV` (BZONE.MAC.txt:6697-6849). The saucer does not appear until the score is
2000 or more (BZONE.MAC.txt:6827-6833). `STIMER` gates everything: when there is
no saucer and it hits 0, one is created with a random high byte for each position
coordinate, so it appears on a 256-unit grid (BZONE.MAC.txt:6839-6845). While
flying, `SCANGL` advances 8 heading units (11.25 degrees) per tick, so the saucer
spins once every 32 ticks (BZONE.MAC.txt:6743-6749), and `SAINCX`/`SAINCY` are
random signed bytes sign-extended to 16 bits and added once per tick, so
-128..127 units per axis per tick; when `STIMER` reaches 0 a new random velocity
is chosen and `STIMER` reloaded with a random byte shifted right, 0..127 ticks
(BZONE.MAC.txt:6751-6825). The saucer never shoots and is never a collision
hazard - `OBJOBJ` does not consider it. When hit, `SCOLFG` is set to `$40` and
decremented twice per tick, so the disintegration lasts 32 ticks, with its
intensity driven from the counter so it flares and fades
(BZONE.MAC.txt:6699-6727); when it reaches 0, `STIMER` is reloaded with a full
random byte - up to 255 ticks - before the next one. `ROTATE` decides the saucer
sound by whether `ROTPNT` kept it: in view sets `SAUCER` = `$81`, out of view 1
(BZONE.MAC.txt:3219-3263).

## Collision detection

Four checks, all built on the MathBox's octagonal distance.

**Shell against tank** - `QWIKCK`/`SHRTCK` (BZONE.MAC.txt:4453-4693). The
distance from shell to tank is shifted right twice and its high byte must be zero.
The threshold is direction dependent (BZONE.MAC.txt:4537-4589): with
`d = (|heading difference| * 2) >> 3` for a tank the hit radius is `1.5 * d + $38`,
so from `$38` (224 world units) end-on up to about 102 (408 units) broadside. A
missile uses `>> 2` plus `$18`, making it a fatter target, and a missile above
`TOP` cannot be hit at all. On a hit, `COLFLG` is set to `$20` for the victim,
`TIMOUT` cleared, the score added in BCD, `NEWLIF` checks the bonus, the shell set
to explode (`FIRECT` = `$80`), a long explosion sound started on the victim and a
short one on the shooter, and `EXINIT` scatters the debris. If the victim is the
player, `CRACK` = 2, `BOUNCE` = -1 and `LIVES` is decremented, with `GOVER`
incremented if that was the last life.

**Shell against obstacle** - `COLCHK` (BZONE.MAC.txt:4715-4831) walks the 21
obstacles for each shell in flight. The distance is shifted right twice and the
high byte must be zero, then `PRXTBL` (BZONE.MAC.txt:4945-4953) supplies the
radius in units of 4: pyramid 56 (224 world units), box 88 (352), wide pyramid 86
(344), short box 0. The short box entry really is zero, so shells fly straight
over the short boxes.

**Shell against saucer** - `SAUCHK` (BZONE.MAC.txt:4833-4943), radius `$90` = 144
against the quartered distance. A hit scores 5 units, plays the disintegration
sound and calls `NEWLIF`.

**Tank against obstacle and tank against tank** - `OBJOBJ`
(BZONE.MAC.txt:7107-7285), on the full 16-bit distance. For the **player** it
ignores the per-object table and uses a single `$480` = 1152 unit radius for
everything, commented "COLLIDE SO WE CAN SEE OBJECT" (BZONE.MAC.txt:7159-7169) -
the player is stopped further out so the obstacle stays in view rather than
clipping through the near plane. For the **enemy** it indexes `PROXTB`
(BZONE.MAC.txt:7287-7295): `$340` (832) for pyramid and box, `$400` (1024) for
the wide pyramid, `$3C0` (960) for the short box; a missile has its measured
distance scaled to 3/4 first (BZONE.MAC.txt:7181-7205), making its effective
radius 4/3 larger. **Tank against tank** is checked last: the distance high byte
must be under 5 (`$500` = 1280 units), or under 3 (768) when the enemy is a
missile (BZONE.MAC.txt:7231-7283); it returns -1 so the caller can tell a tank
collision from an obstacle collision.

When the player hits an obstacle, `MOTION` backs the move out, plays the `BOING`
sound once, sets `BOUNCE` to `$3F` and sets `OBJCOL`, which makes "MOTION BLOCKED
BY OBJECT" flash (BZONE.MAC.txt:5263-5289).

## Player death, the cracked screen and explosions

When the player is hit, `CRACK` is set to 2 and `BOUNCE` to `$FF`
(BZONE.MAC.txt:4599-4611), and `MAIN` routes the frame to `WNSHLD` instead of
drawing the radar and reticle (BZONE.MAC.txt:961-965).

`CRACKS` at `$36F8` is a list of eight `JSRL` words (BZMTNS.MAC.txt:813-829).
`WNSHLD` (BZONE.MAC.txt:1231-1345) copies the first `CRACK / 2` of them straight
into the display list, capped at 8, then increments `CRACK` by 2 - so the crack
grows one group per tick for eight ticks and then holds, while `CRACK` keeps
counting until it passes 32, making the whole sequence 16 ticks, about one
second. It also waits for any shell still in flight before resetting, and writes
0 to `CHAN4V` to kill the enemy engine channel. Group 0 starts with `CNTR` so it
is screen-centre relative; groups 1-7 continue from wherever the previous group
left the pen, so they must be drawn in order. The strokes are long and sparse -
the first group is four strokes of 75 to 250 units. `src/data/pictures.ts` has
each group separately and the accumulated whole.

On reset (BZONE.MAC.txt:1263-1339) it clears `CRACK`, `STATE`, `COLFLG` and
`FTIMER`; if the game is over it switches to attract mode and jumps to `CKSCOR`,
otherwise it picks a new random player position (rejecting any that collides with
an obstacle), a random heading, and the next enemy.

`BOUNCE` is the view shake: `KLUDGE` subtracts it from every vertex's height
before the perspective divide (BZONE.MAC.txt:4147-4163) and `MOUNTS` shifts the
horizon down by `BOUNCE >> 4` (BZONE.MAC.txt:2473-2497). `BOUND` halves it every
tick (BZONE.MAC.txt:4195), so it decays over eight ticks.

`EXINIT` (BZONE.MAC.txt:5091-5139) sets up six pieces, each with an initial
vertical velocity from `IZVEL` = 55, 40, 70, 88, 40, 66, the dying tank's
position, a random orientation and zero height. `EXPLDE` (BZONE.MAC.txt:3449-3645)
then runs each tick from `ROTATE`: add the fixed per-tick velocities from `EXPTBX`
and `EXPTBY` - as stored, -120, -120, 20, 200, 0, -160 and 120, 0, -20, 200, -160,
-160 (BZMTNS.MAC.txt:1655-1661); add four times the vertical velocity to the
height then add `GRAVTY` = -4 to the velocity, with a clamp; spin the piece, its
orientation changing by `piece * 4 + 3` per tick in a direction depending on the
index; pick the object number as `piece / 2 + $10` for a tank, plus 8 more for a
missile, with object `$13` swapped for `$14` when the victim is a supertank; and
rotate and cull each piece through `ROTPNT`. When every piece's height has gone
negative the explosion is over: `COLFLG+2` is cleared and `ROBCHK` places the next
enemy.

There is also the flat `EXPIC` picture at `$347A` - ten dots at intensity 7
(BZMTNS.MAC.txt:438-478) - drawn by `DRAW`'s `TSPCL` for the small impact flash
when a shell hits an obstacle. Its scale comes from the object's orientation
byte, so the flash grows as the counter runs (BZONE.MAC.txt:3805-3841).

## The radar, the reticle and the range warning

`RDRING` at `$353C` (BZMTNS.MAC.txt:552-577) is not a ring: it is four short tick
marks at the top, bottom, left and right of an imaginary circle, plus a V-shaped
field-of-view wedge at intensity 5 running from the centre out to (+/-36, +52).
The circle itself is never drawn. The centre is `CENTRX`, `CENTRY` = (0, 316)
(BZONE.MAC.txt:707-709).

`DRADAR` (BZONE.MAC.txt:7683-8027) emits `JSRL RDRING`; advances `SANGLE` by
`$0B` heading units - 15.47 degrees per tick, one revolution every 23.3 ticks or
1.49 s - and draws the sweep line from the centre out to half the unit vector at
that angle, at intensity `$A0` (BZONE.MAC.txt:7697-7761); calls `TRACK` for the
enemy's bearing, converts it to a bearing relative to the player's heading and,
if the sweep has just passed it (within `$0C` heading units), sets `BLIP` to
`$F0` (BZONE.MAC.txt:7775-7803); and measures the distance, storing its high byte
in `TDIST` and setting the enemy engine rumble volume on POKEY channels 3 and 4
to `$0F - (TDIST >> 3)` so the enemy gets louder as it closes
(BZONE.MAC.txt:7823-7855). If `TDIST` is `$80` or more the enemy is out of radar
range: `EIRNGE` is cleared, no blip is drawn and a missile is timed out
(BZONE.MAC.txt:7857-7885). Otherwise, if the blip is fresh it plays the radar
beep, then rotates a vector of length `TDIST` by the relative bearing about the
radar centre and draws a dot there at the blip's brightness
(BZONE.MAC.txt:7887-7987). `BLIP` decays by 8 per tick, fading over 30 ticks, so
the blip is not continuous: it lights only as the sweep passes, which is what
gives the real machine's radar its character.

**The reticle** has two pictures, both starting with `CNTR`: `XCROSS` at `$34CC`
(BZMTNS.MAC.txt:484-509), a tick below centre, two square brackets and a tick
above, all at intensity 3; and `XCROS1` at `$3500` (BZMTNS.MAC.txt:518-547), the
same layout at intensity 7 with the bracket ends splayed out into 40-unit
diagonals and two extra short stubs at intensity 3. `MAIN` chooses between them
(BZONE.MAC.txt:971-1019): `TRACK` gives the bearing to the enemy, XORed with
`$80` and with the player's heading subtracted to give the signed error, whose
absolute value is stored in `PTURN`; if `PTURN` is under 2 heading units (about
2.8 degrees) the locked `XCROS1` is used, otherwise the plain `XCROSS`. While a
shell is in flight, bit 5 of `$INTCT` blanks the reticle entirely on alternate
groups of NMIs, so it blinks. No reticle is drawn while the logo is on screen.

**"ENEMY IN RANGE"** is driven purely by `TDIST` in `DRADAR`
(BZONE.MAC.txt:7989-8015): if `TDIST` is under `$80` the message is drawn
whenever bit 1 of `FRAME` is clear - on for two ticks in four - and, the first
time the enemy comes into range, `EIRNGE` is set and the `WARNG` warble plays
once. `EIRNGE` is cleared when the enemy leaves range or a new one appears, which
re-arms the warble.

**The direction prompts** are in `MAIN` (BZONE.MAC.txt:1057-1091). If `PTURN` is
22 heading units or more - about 31 degrees off the view direction - "ENEMY TO "
is drawn, followed by "REAR" if `PTURN` is `$6B` (151 degrees) or more, else
"LEFT" or "RIGHT" by the sign of the error. These flash on bit 1 of `FRAME`. The
three fragments are separate messages with no position bytes, so they chain onto
the end of "ENEMY TO " at the current beam position. "MOTION BLOCKED BY OBJECT"
is drawn while `OBJCOL` is set, flashing on bit 2 of `FRAME`
(BZONE.MAC.txt:1091-1103).

## Difficulty ramp

The game's idea of skill is `score - deaths`, both in BCD units of 1000 (`HITS`
minus `HITS+2`). `REACT` (BZONE.MAC.txt:5683-5767) turns it into two numbers.
`ACTION`, the decision interval, is `$30` in attract mode, 4 ticks once the score
has passed 10000 - so the enemy re-decides almost every tick - and otherwise
`(5 - skill) * 16` ticks, so a brand new player faces an enemy that only
re-thinks every 80 ticks (5 s). `SKILL`, the aiming tolerance in heading units,
is `2 * (10 - skill)` floored at 2, or `$14` in attract mode - so a beginner's
enemy stops turning while still up to 20 units (28 degrees) off, and a good
player's lines up to within a couple of degrees.

On top of that: the enemy will not fire in the first 32 ticks after it appears
(BZONE.MAC.txt:6155-6159); below 2000 points it only fires from in front and
close range (BZONE.MAC.txt:6167-6187); below 10000 it only attacks when the
random check or the "player is ahead" comparison says so
(BZONE.MAC.txt:6053-6079); above 10000 it always attacks and always uses the fast
`ACTION`; new enemies appear in a window that narrows towards straight ahead as
the player improves (BZONE.MAC.txt:7407-7451); missiles begin at the DIP-selected
score; and the supertank replaces the tank after five missiles.

## Attract mode

`ATRACT` bit 7 set means a game is running, clear means attract. In attract,
`MAIN` alternates two displays by toggling `DSPLAY` bit 7 whenever `TIMOUT`
reaches 4, resetting `TIMOUT` to 3 so the next toggle is one `FRAME` wrap later -
256 ticks, 16.384 s (BZONE.MAC.txt:829-879). Bit 7 set gives the high score table
via `BIGWND` and `DISTBL`; bit 7 clear gives demo play with `LOGO` set to -1 so
the flying logo is drawn.

During demo play `MOTION` drives the player automatically: forward while bit 6 of
`FRAME` is clear, reverse while it is set, turning left or right by the sign bits
of the player's own x position (BZONE.MAC.txt:5143-5175). Enemies behave as usual
except that `REACT` always uses the attract values and the enemy always drives
randomly rather than attacking (BZONE.MAC.txt:6049-6051).

The flying logo is `BATTLE`/`BATINT` (BZONE.MAC.txt:1359-1551). `BATINT` puts it
at x = `$0400`, z = `$FC00` (-1024); each tick x grows by `$40` and z by 8, and
when z passes `$200` the sequence restarts - 192 ticks, about 12.3 s. The three
letter groups come from `LOGOBJ` = objects `$17`, `$1E`, `$1F`
(BZMTNS.MAC.txt:1681), drawn at a fixed bright `$F0`. "ZONE" is held back until z
is above about -592, commented "DON'T DRAW ZONE UNTIL WE HAVE ENOUGH TIME"
(BZONE.MAC.txt:1457-1477) - the vector generator cannot draw all three groups
plus the playfield inside one 24 ms refresh when they are large.

`DISTBL` (BZONE.MAC.txt:1871-2053) draws "HIGH SCORES", ten lines of score and
initials each with one tank icon per 1000 points capped at ten, then "BONUS TANK
AT <n>000 AND 100000" if a bonus is selected. A game starts in the NMI: with
credits available and the start button
(`START` = `$20`) pressed it clears the score, sets `LIVES` from the DIP
switches, sets `ATRACT`, resets `NOR2D3` and places the first enemy
(BZONE.MAC.txt:2291-2363). The copyright line - circled C, circled P, then
" ATARI 1980" - is emitted every frame while a game runs
(BZONE.MAC.txt:909-915).

## High scores and initial entry

`HSCNUM` is 10 (BZONE.MAC.txt:559). Each entry is three bytes in `HSCTBL` (score
low, score high, unused) and three in `INITLS`. At power-on `PWRON` fills the
table: every score becomes 5, i.e. 5000 points, and the initials come from
`FDGTBL` (BZSTST.MAC.txt:206-242, at `$7B7F` in the ROM), which decodes to
`EDR MPH JED DES TKE VKB EL_ HAD ORR GJR` - the seventh entry really does end in
a space, and "EDR" is Ed Rotberg.

`CKSCOR` (BZONE.MAC.txt:1569-1677) runs at game over: it finds the insertion
point, shuffles the lower entries down, inserts the new score, plays the `SUPBON`
tune, sets `GOVER` bit 7 to enter high-score mode, and initialises `STINTL` to
character `$16` ('A') for the first letter and `$4C` (the underline glyph) for the
other two. `HISCRE` (BZONE.MAC.txt:1679-1815) then runs each tick, drawing "GREAT
SCORE", "ENTER YOUR INITIALS", "CHANGE LETTER WITH RIGHT HAND CONTROLLER" and
"SELECT LETTER WITH FIRE BUTTON", calling `LETCHK`, and drawing the three current
characters 18 quarter-units left of and below centre.

`LETCHK` (BZONE.MAC.txt:1817-1869) reads the right-hand controller through the
POKEY pot inputs: bit 0 steps the letter forward, bit 1 back, with `LTIMER` giving
a four-tick repeat delay, and the code cycles `$16`..`$4A` - 'A' through 'Z' plus
one blank - wrapping at both ends. The fire button (debounced against `OLSTAT`,
BZONE.MAC.txt:1723) commits the letter and sets the next one to 'A'. After the
third letter, or when `TIMOUT` reaches 4, the initials are stored and the display
switches to the high score table.

## Two-player mode

There isn't one. Battlezone is single player: the ROM has one start button, one
`LIVES` counter, one score and no player-number state anywhere, and the "1 2 S" /
"1 1" / "2 S 1" / "COIN PLAY" messages describe coin _pricing_, printed by the
coin handling (BZONE.MAC.txt:1127-1143). The two-entry arrays in zero page
(`TPOSX`, `TANGLE`, `FIRECT`, `COLFLG`, `SNDWRD`, `HITS`) are the player at index
0 and the enemy at index 2 - the code reuses `MOTION`, `SAVEIT`, `BAKOUT`,
`M.FOR`, `SHRTCK` and `SHUPDT` for both by passing 0 or 2 in X, which is what
makes the enemy drive with exactly the same physics as the player.

## Sound

**The discrete latch at `$1840`.** The NMI builds a byte and writes it
(BZONE.MAC.txt:2173-2373). From the source's own equates (BZONE.MAC.txt:687-705):
bit 0 `EXPLOD` turns the explosion on; bit 1 `LOX`/`HIX` selects its pitch, set =
low/big and clear = high/small; bit 2 is the shell report; bit 3
`LOUDSH`/`SOFTSH` its loudness, set = loud (the player's own gun), clear = soft
(the enemy's); bit 4 `HIDLE`/`LIDLE` is the engine, set = revving and clear =
idling; bit 5 is the master sound enable, also used as the slam alarm in attract;
bit 6 is the start button lamp, inverted; bit 7 is the cabinet rumble / motor, set
only while a game runs.

`SNDWRD` holds the per-tank bits. The explosion bit is gated by `EXPCNT`, a
countdown in NMIs - `$FF` for a destroyed tank, `$70` for a shell hitting an
obstacle, `$A0` for the saucer - and the shell bit by `SXPCNT`, loaded with 5;
`MOTION` sets the engine bit from whether the player is moving
(BZONE.MAC.txt:5289-5303). Reading bits 1 and 3 as loud/soft and high/low follows
from the names and use sites; the analogue circuit is not in the source, so the
timbres must come from a board or MAME's discrete netlist.

**POKEY and the BZSOUN sequencer.** `BZSOUN.MAC` is table driven, originally by
Rich Adam for Tube Chase (BZSOUN.MAC.txt:19-46). `SNDON` starts a sound and
`MODSND`, called every NMI, advances it. The engine drives four "channels", which
are the POKEY registers `AUDF1` (`$1820`), `AUDC1`, `AUDF2` and `AUDC2` -
`STA X,AUDF1` with X = 0..3 (BZSOUN.MAC.txt:684) - so only POKEY voices 1 and 2,
one frequency byte and one control byte each. In a control byte the high nibble
is the distortion/noise select and the low nibble the volume, so `$A3` is "pure
tone, volume 3"; `AUDCTL` is always written 0 and every register's idle value is 0
(BZSOUN.MAC.txt:248-249). Voices 3 and 4 (`$1824`-`$1827`) are written directly by
the game and carry the enemy engine note: `$FF` and `$FE` into the frequency
registers when a missile launches (BZONE.MAC.txt:7467-7473), volumes tracking
`TDIST` (BZONE.MAC.txt:7833-7855).

Each channel's data is a list of four-byte steps - start value, frames per step,
delta per step, number of steps - and a two-byte `value, 0` entry ends the
channel, leaving `value` as the new idle level (BZSOUN.MAC.txt:301-316). A frame
is one NMI, 4 ms. A sound whose channel-1 pointer is 0 does not set `POINT`, and
since the NMI's "is a sound playing" test reads only `POINT`
(BZONE.MAC.txt:2169), those sounds do not block others. `SNDON` takes a bit mask
and finds the bit position to index the table (BZSOUN.MAC.txt:509-587).

| Bit            | Table | Trigger                                                                                | POKEY data                                                                                                                                                                                                                      |
| -------------- | ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$01` `RBEEP`  | `BE`  | the sweep passes a fresh blip (BZONE.MAC.txt:7893)                                     | voice 2 only: `AUDF2` = `$23`, `AUDC2` = `$A3` for `$10` frames - a single 64 ms pure-tone blip                                                                                                                                 |
| `$02` `BOING`  | `WP`  | the player drives into an obstacle (BZONE.MAC.txt:5273)                                | voice 1: `AUDF1` sweeps up and down ten times with shrinking excursions (`$C0` down by 10, `$84` up by 9, `$F0` down by 8, ...) one frame per step, `AUDC1` falling from `$AB` - a damped boing about 0.5 s                     |
| `$04` `BLKSND` | `BK`  | set continuously while `OBJCOL` is set (BZONE.MAC.txt:2181)                            | voice 1: `AUDF1` = `$10` for `$20` frames, `AUDC1` = `$C1` then `$C0`; high nibble `$C` is a noise setting, so a rasping low-volume grind                                                                                       |
| `$08` `BONER`  | `BO`  | a bonus tank is awarded (BZONE.MAC.txt:5047)                                           | voice 2: `AUDF2` = `$10` held, `AUDC2` alternating `$A2`/`$A0` seven times at `$20` frames - a warbling chirp about 0.9 s                                                                                                       |
| `$10` `WARNG`  | `WG`  | the enemy first comes into range (BZONE.MAC.txt:8013)                                  | voice 2: `AUDF2` sweeps `$40` down by 1 for `$18` steps at 2 frames each, three times; `AUDC2` = `$A3` - three rising warbles, about 0.6 s                                                                                      |
| `$20` `DISINT` | `DS`  | the saucer is destroyed (BZONE.MAC.txt:4895); also the slam alarm (BZONE.MAC.txt:2177) | voice 1: `AUDF1` sweeps `$30` down by 4 for `$0C` steps twice, `AUDC1` = `$A3` - a fast falling two-tone whoop                                                                                                                  |
| `$40` `SAUSND` | `SA`  | set continuously while the saucer is in view (BZONE.MAC.txt:2189)                      | voice 1: `AUDF1` oscillates `$40` down by 2 and `$20` up by 2, `$10` steps each, twice; `AUDC1` = `$A1` - a quiet slow siren                                                                                                    |
| `$80` `SUPBON` | `SU`  | the 100000-point super bonus, and the game-over jingle (BZONE.MAC.txt:1611, 5067)      | both voices, nine notes: `AUDF1` = `$D9, $A2, $90, $80, $90, $A2, $90, $80, $A2` and `AUDF2` = `$6C, $51, $48, $40, $48, $51, $48, $40, $51`, each `$30` frames (192 ms), both controls `$A7` - about 2.5 s of two-part harmony |

The full step data is transcribed as `SOUND_TABLES` in `src/data/constants.ts`.
To resynthesise, treat an `AUDF` value `n` as a divider: the note is roughly
`pokey_clock / 2 / (n + 1)`. `SKCTL` is set to 7 (BZSTST.MAC.txt:112,
BZONE.MAC.txt:2347), selecting POKEY's slow clock mode. The exact divider chain is
a hardware property not given in the source, so absolute pitches need
calibrating.

`MODSND` has one quirk: when channel 1's sequence ends it idles channel 1 and,
because the loop counts down from 3, nothing else - each channel carries its own
terminating entry. The header comment "all sounds end when channel 1 goes idle"
(BZSOUN.MAC.txt:317) describes the intent rather than the code.

## Text in the ROM

Text is one byte per character, the byte being twice the glyph index with bit 7
marking the last character, preceded by two signed position bytes in
quarter-units; `MSGS` multiplies those by 4 through `VGVTR`, and 0,0 means "draw
at the current beam position". Messages up to but not including `GAMOVR` are drawn
at `SCAL 2` (quarter size) and `GAMOVR` onwards at `SCAL 1`
(BZONE.MAC.txt:8165-8201).

The English set, with exact spelling and stored positions
(BZONE.MAC.txt:8455-8505):

| Label    | x, y     | Text                                       |
| -------- | -------- | ------------------------------------------ |
| `ETO`    | -110, 74 | `ENEMY TO `                                |
| `LEFT`   | 0, 0     | `LEFT`                                     |
| `RIGHT`  | 0, 0     | `RIGHT`                                    |
| `REAR`   | 0, 0     | `REAR`                                     |
| `LINE2`  | 7, 26    | `ENTER YOUR INITIALS`                      |
| `LINE3`  | -60, 16  | `CHANGE LETTER WITH RIGHT HAND CONTROLLER` |
| `LINE4`  | -45, 8   | `SELECT LETTER WITH FIRE BUTTON`           |
| `CHISCR` | 32, 70   | `HIGH SCORE      000`                      |
| `ERANGE` | -110, 90 | `ENEMY IN RANGE`                           |
| `BLOCKD` | -110, 82 | `MOTION BLOCKED BY OBJECT`                 |
| `GAMOVR` | -28, 24  | `GAME OVER`                                |
| `PRSTRT` | -34, 0   | `PRESS START`                              |
| `YSCORE` | 32, 80   | `SCORE     000`                            |
| `HISCOR` | -28, 40  | `HIGH SCORES`                              |
| `ZEROS`  | 0, 0     | `000 `                                     |
| `LINE1`  | -64, 24  | `GREAT SCORE`                              |
| `MODE1`  | -50, 0   | `1       2     S`                          |
| `MODE2`  | -50, 0   | `1       1`                                |
| `MODE3`  | -50, 0   | `2     S 1`                                |
| `CONPLY` | -50, 0   | `  COIN    PLAY`                           |
| `INSCON` | -36, -22 | `INSERT COIN`                              |
| `BONPLN` | -87, -70 | `BONUS TANK AT `                           |
| `BONPL1` | 0, 0     | `000 AND 100000`                           |
| `COPYRT` | -42, -60 | circled C, circled P, `  ATARI 1980`       |

The score messages carry a trailing `000` in the string itself; the four BCD
digits are emitted before it by `DIGT2S`, so the displayed score is always a
multiple of 1000. German, French and Spanish tables follow in the ROM, selected by
the `OPTION` DIP switches (BZONE.MAC.txt:8517-8675) - `ENEMY IN RANGE` becomes
`GEGNER IM FEUERBEREICH`, `ENNEMI A PORTEE` and `ENEMIGO EN RANGO`. Only the
English set is carried in `src/data/pictures.ts`.

**The font.** `VGMSGA` at `$33F0` is a table of 41 `JSRL` words. The index
assignment was established from `VGHEX` in `VGUT.MAC.txt:307-335` (digit `d` maps
to byte `(d + 1) * 2`) and by decoding the `ENEMY TO ` string out of the ROM,
which pins `E` = `$1E`, `M` = `$2E`, `N` = `$30`, `O` = `$32`, `T` = `$3C`,
`Y` = `$46` and space = `$00`. Index 0 (byte `$00`) is a space; 1-10 (`$02`-`$14`)
are `0`-`9`; 11-36 (`$16`-`$48`) are `A`-`Z`; 37 (`$4A`) is a second space, the
blank the player can select when entering initials; 38 (`$4C`) is the underline
`UNDERL` at `$33AC`; and 39 and 40 (`$4E`, `$50`) are the circled C and circled P.

Every glyph fits a 16 x 24 cell and advances 24 units, and the whole set is built
from `SVEC` short vectors; there is no lower case and no punctuation beyond the
underline. Two glyphs are shared - `0` uses the `O` routine and `5` uses `S` - and
glyphs also tail-share by `JMPL`-ing into the middle of others: `C`, `L` and `Z`
jump to `UNDERL` for their bottom stroke, and `1` jumps into the middle of `I`.

## Things that could not be established

- **Factory DIP settings.** The ROM only reads `OPTION` and `OPTON2`; the default
  switch positions belong to the cabinet, not the code. The four choices for each
  field are recorded, and `src/data/constants.ts` marks its own defaults as a
  project choice.
- **Absolute screen scale and pitch.** The MathBox divide length (`DIVCYC` = 10)
  sets the fixed-point scale of the projected coordinates and POKEY's divider
  chain sets every note's frequency; both are hardware facts outside the listing.
  The horizontal scale is _inferred_ as about 512 units per unit of
  `lateral/depth`.
- **The analogue sound circuit.** The explosion, shell and engine sounds come from
  discrete circuitry driven by the `$1840` latch; only the bit meanings are
  recoverable.
- **The attract-mode toggle's carry flag.** `MAIN` compares `TIMOUT` with 4 only
  on the tick when `FRAME` wraps but tests the resulting carry unconditionally a
  few instructions later (BZONE.MAC.txt:835-853), so on other ticks the carry is
  whatever the preceding code left. The intent is clearly "every `TIMOUT` step",
  but a cycle-exact emulation might diverge here.
- **`TNKPRX`, `SWOOP`, `LAMP` and `COMAND`.** Defined at BZONE.MAC.txt:703-721
  and never referenced anywhere in the listing.
- **Anti-piracy checks.** `TRAP1`, `TRAP2` and the `CHKS0`-`CHKS7` bytes are
  checksums over the display list and ROM, wired into the bonus path and the logo
  (BZONE.MAC.txt:1029-1055, 1359-1395, 2069-2085). They have no gameplay effect
  when the ROM is intact and are not modelled here.
