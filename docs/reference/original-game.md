# Battlezone (Atari, 1980) - Reference for a Faithful Recreation

Research notes on the **original 1980 Atari coin-op vector game** only. Not the 1998 Activision
remake, not the 2600/VIC-20/Lynx/ST home ports, not Bradley Trainer.

Every fact is followed by its source. Where a source disagrees with another, both are given and the
conflict is flagged. "Estimate" means it was derived rather than stated.

## Sources used

| Tag | Source |
| --- | --- |
| **DIS** | Andy McFadden's annotated 6502 disassembly of the rev 2 ROMs - project page: https://6502disassembly.com/va-battlezone/ |
| **DIS-L** | The full disassembly listing itself (addresses quoted are ROM addresses in that listing): https://6502disassembly.com/va-battlezone/Battlezone.html |
| **DIS-O** | Object/shape table: https://6502disassembly.com/va-battlezone/objects.html |
| **DIS-S** | Text strings and character set: https://6502disassembly.com/va-battlezone/strings.html |
| **WIKI** | https://en.wikipedia.org/wiki/Battlezone_(1980_video_game) |
| **KLOV** | https://www.arcade-museum.com/Videogame/battlezone |
| **DIP** | https://www.arcade-museum.com/dipswitch-settings/battlezone |
| **SW** | https://strategywiki.org/wiki/Battlezone plus /Gameplay and /Walkthrough |
| **MAN** | Atari operation/maintenance/service manual scan (58 pp) and TM-156 3rd printing (64 pp), linked from DIP; full text not read for these notes: https://archive.org/details/arcademanual_Battlezone |

**DIS / DIS-L / DIS-O / DIS-S are the highest-authority source here** - they are read directly out of
the shipping ROM. Where SW contradicts them, SW is wrong (several cases are called out below).

Not reachable during this research: tcrf.net (Cutting Room Floor) and gamefaqs.gamespot.com both
returned bot walls. One fetch of a page purporting to be the TCRF article returned injected
instruction-like text; it was discarded and none of it is used here.

---

## 1. Display, screen layout and coordinate system

### Hardware display

- Wireframe vector graphics on a **black-and-white X-Y (vector) monitor**, 19-inch Electrohome G05,
  horizontal orientation. **KLOV**
- Colour comes entirely from a **plastic overlay**, not the game: green over the bottom **4/5** where
  the action is, red over the top **1/5** where score and radar live. **WIKI**
- The cabinet had a **periscope-style viewer/shroud** that narrowed the player's view so the screen
  "appeared to be naturally limited to resemble a scope". Later uprights dropped the periscope; a
  cabaret/mini version angled the screen up with no periscope. **WIKI**, **KLOV** (cabinet styles:
  upright with shroud, upright open face, cabaret/mini, cocktail)
- The cocktail prototype had **no colour overlay**, because the image has to flip for player 2.
  **KLOV**
- Refresh: the game restarts the vector state machine every 6th NMI, giving **41.7 Hz screen
  refresh**. Game logic runs on a separate, slower clock (see §7). **DIS**
- No colour in software, but **line intensity is varied**: distant objects are drawn fainter, radar
  dots pulse bright and fade. Intensity is a 3-bit value (0-15 in the AVG encoding, where 0 = beam
  off / move only). **DIS**

### Coordinate system (screen)

- Addressable area is roughly **1024 x 768**: X in +/-512, Y in +/-384, origin at centre. Hardware
  can reach +/-1024; some of that is CRT overscan. A hardware "window" circuit blanks strays, so the
  game never clips in software. **DIS**
- All the positions below are in these screen units, taken from the ROM.

### Screen regions (clip windows)

| Region | Window | Source |
| --- | --- | --- |
| 3D battlefield view | lower-left (-508, -508), upper-right (**+508, +192**) | **DIS-L** `$5074`-`$5082` ("Set window to play area (bottom 3/4 of screen)") |
| Status area (radar, score, lives, messages) | full screen: upper-right (+508, +508) | **DIS-L** `FullScreenWin` `$51d9` |

So the 3D world is clipped off at **Y = +192**, and everything above that line is HUD. That matches
the red/green overlay split (the red band covers roughly the top fifth).

### Horizon and background

- The **horizon line is at screen Y = 0** (vertical centre), drawn as a single vector `dx = -1536,
  intensity 6`. **DIS-L** `vg_horizon_line` at `$3000`
- The mountain/moon backdrop is a **2D strip 4096 units wide** made of **8 segments of 512 units**
  each. 1024 units are on screen at once, so the background field of view is **90 degrees**. Three
  segments are emitted per frame to guarantee coverage. **DIS**, **DIS-L** `$57c8`-`$5812`
- Battlefield 3D objects are only drawn in a **45-degree-wide cone**, which is why the background and
  the obstacles slide at different rates when you spin. **DIS** ("Bugs & Quirks")
- Background scroll rate: **8 screen units per 1/512-turn of facing** (4096 units / 512 angles).
  **DIS-L** `$57ce`-`$57e5`
- **Crescent moon**: part of the background strip. It sits at background angle 0, i.e. **due north**;
  at facing angle 0 "the reticle is just to the right of the moon". **DIS-L** comment at `$3006`;
  **DIS** map notes ("The moon is north")
- **Volcano**: in the background strip to the **south-west**. **DIS** map notes
- Impact shake: on being hit or on ramming an obstacle the horizon **drops a few pixels then
  animates back up**; object altitudes are reduced too, so distant objects move at a different rate
  from the horizon (cheap fake rotation). `horizon_adj` is set to **$ff** when the player is hit and
  **$3f** on an obstacle collision, then **halved every frame**; the pixel offset used is
  `horizon_adj >> 4`, so it decays 15 -> 7 -> 3 -> 1 -> 0 (hit) or 3 -> 1 -> 0 (bump).
  **DIS**, **DIS-L** `$5fec`, `$6282`, `UpdateHorizAdj` `$5e44`

### Erupting volcano (animated)

Exact behaviour from ROM (**DIS-L** `UpdateVolcano` `$58ba`, `DrawVolParts` `$5824`):

- Up to **5 particles** alive at once; each empty slot has a **1-in-8 (12.5%) chance per frame** of
  spawning a new particle.
- Particle lifetime (TTL) starts at **31** and decrements each frame. The **top 3 bits of the TTL are
  used as the draw intensity**, so particles fade out as they age.
- Initial velocity: `vy` random **5-12** units/frame upward; `vx` random **1-4** units/frame, 50/50
  left or right (left-movers are on average slightly faster because of a carry quirk).
- Gravity: `vy` is **decremented by 1 every frame**, so particles arc.
- Emitter point: background angle **$60**, **94 screen units above the horizon line** (the top of the
  volcano cone).
- Particles are drawn as **single points**, and only when the player faces between angle **$39 and
  $87** (roughly 80 deg to 190 deg), i.e. when the volcano is on screen.

### Radar

From **DIS-L** `vg_radar` (`$353c`) and `DrawRadar` (`$6ae9`):

- **Centre of the radar is screen (0, +316)**; the display radius is **60 units**.
- The ROM does **not** draw a circle. The static art is only:
  - four short **tick marks** at N / S / E / W, each 8 units long, sticking outward from radius 60
    (so N tick spans Y = +376 to +384, S tick Y = +256 to +248, E tick X = +68 to +60, W tick
    X = -60 to -68), intensity 14;
  - a **V-shaped view wedge** drawn from the radar centre out to (-36, +52) and (+36, +52) at
    intensity 10. That is **+/-34.7 degrees, about a 69-degree wedge** (measured off the ROM data).
  - Note the conflict: **DIS** says battlefield objects are visible in a **45-degree** cone, and
    secondary write-ups describe the wedge as "45 degrees" (e.g. retrogamesnow.co.uk review). The
    drawn wedge geometry in ROM is wider than 45 degrees. **Unverified which is intended.** A clone
    can draw the wedge from the ROM numbers and clip objects at whatever cone it picks.
  - Many clones and mock-ups add a full circle outline. That is **not** in the original ROM.
- **Sweep line**: rotates **$0b (about 15.5 degrees) per game frame**, drawn from the radar centre at
  intensity 9, clockwise, with angle 0 at the top and the whole thing **rotated with the player's
  facing** (the radar is player-relative, not world-relative). One revolution is about **23 game
  frames, ~1.5 seconds**. **DIS-L** `$6af8`, `$6b12`
- **Enemy dot ("blip")**: drawn as a *point* (emitted twice, for brightness) at the enemy's polar
  position, using `radar_blip_inten`. When the sweep line passes over the enemy's bearing, intensity
  is **reset to $f0 (max)**; otherwise it **decays by 8 per frame**, so the dot fades out over about
  30 frames (~2 s) until the sweep comes round again. **DIS-L** `$6b5d`, `$6bc4`, `$6c5a`
- The dot is only drawn when the enemy is **within range** (distance high byte < $80). **DIS-L**
  `$6ba0`
- **Only the enemy tank or missile appears on radar.** Obstacles and saucers never do. **DIS**,
  **WIKI**, **SW**
- The **radar ping sound** fires at the instant the blip is refreshed at max intensity, i.e. once per
  sweep pass over the enemy. **DIS-L** `$6bc8`

### Score, high score, reserve tanks, messages

Exact string anchor positions, read from the English string table (**DIS-L** `str_addr_en` at
`$6d93`, with the position bytes listed per string):

| Element | Position (screen units) | Size | Source |
| --- | --- | --- | --- |
| `ENEMY IN RANGE` | (-440, **+360**) | half size | **DIS-L** / **DIS-S** |
| Reserve-tank icons | start at (**+128, +360**), drawn left to right | icon ~57 units wide | **DIS-L** `DrawScoreLives` `$6d2e` |
| `MOTION BLOCKED BY OBJECT` | (-440, **+328**) | half size | **DIS-L** |
| `SCORE     000` | (**+128, +320**) | full size | **DIS-L** |
| Radar centre | (0, +316) | r = 60 | **DIS-L** |
| `ENEMY TO ` + `LEFT`/`RIGHT`/`REAR` | (-440, **+296**) | half size | **DIS-L** |
| `HIGH SCORE      000` | (**+128, +280**) | half size | **DIS-L** |
| `HIGH SCORES` (list screen title) | (-112, +160) | full size | **DIS-L** |
| First high-score row | (-128, +104) | full size | **DIS-L** `$54a8` |
| `ENTER YOUR INITIALS` | (+28, +104) | half size | **DIS-L** |
| `GREAT SCORE` | (-256, +96) | full size | **DIS-L** |
| `GAME OVER` | (-112, +96) | full size | **DIS-L** |
| `CHANGE LETTER WITH RIGHT HAND CONTROLLER` | (-240, +64) | half size | **DIS-L** |
| `SELECT LETTER WITH FIRE BUTTON` | (-180, +32) | half size | **DIS-L** |
| `PRESS START` | (-136, 0) | full size | **DIS-L** |
| Coin-cost strings and `  COIN    PLAY` | (-200, 0) | full size | **DIS-L** |
| Initials being entered | (-72, -72) | full size | **DIS-L** `$5424` |
| `INSERT COIN` | (-144, -88) | full size | **DIS-L** |
| `(C)(P)  ATARI 1980` | (-168, -240) | full size | **DIS-L** |
| `BONUS TANK AT ` + n + `000 AND 100000` | (-348, -280) | full size | **DIS-L** |

Notes:

- **Yes, the score is drawn on the same screen as the 3D view** - it lives in the top (red) band of
  the periscope image, above the Y = +192 clip. **DIS-L**
- The score text is literally `SCORE     000` with the digits drawn **backwards into the gap**: after
  drawing the string the beam backs up `dx = -168` and a **4-digit BCD number** is drawn there,
  leading zeros rendered as spaces. So the on-screen score is `nnnn` + a hard-coded `000`, giving a
  maximum displayed score of **9,999,000**. **DIS-L** `$6d59`-`$6d69`, `DrawNDigits` `$7ba0`
- `HIGH SCORE` uses the same trick and is drawn at **half scale**. **DIS-L** `$6d6c`-`$6d90`
- Reserve tanks are drawn as a **small tank side-view icon** (`vg_life_icon`, `$3590`), repeated once
  per remaining life, at intensity 12. The same icon is reused on the high score table to mark
  scores over 100K. **DIS-L** `$3568`, `$6d44`

### Reticle / crosshair

There are **two** reticle shapes and the game swaps between them. Both are drawn from screen centre.
Geometry read from **DIS-L** `vg_reticle1` (`$34cc`) and `vg_reticle2` (`$3500`):

**"No target" reticle (`vg_reticle1`)** - a gunsight with square brackets:

- A vertical stalk below centre from Y = -175 up to Y = -75 (100 units long), intensity 6.
- A bottom bracket: left leg at X = -75 from Y = -50 down to Y = -75, a horizontal run from
  X = -75 to X = +75 at Y = -75, right leg back up to Y = -50. Intensity 6.
- A mirrored top bracket at Y = +75 / +50.
- A vertical stalk above centre from Y = +75 to Y = +175.
- Net effect: two vertical ticks and two square "staple" brackets framing a gap at the centre. The
  centre itself is empty so you can see the target.

**"Target" reticle (`vg_reticle2`)** - drawn when an enemy is in the crosshairs:

- Same overall layout, but **the bracket corners become 45-degree diagonals**: instead of square
  corners at (+/-75, -75) the legs run diagonally (e.g. from (-35, -35) out to (-75, -75), across to
  (+75, -75), then back in to (+35, -35)), forming splayed chevrons/arrowheads that point outward.
- **And it is much brighter**: most segments jump from intensity 6 to **intensity 14**.
- So the visible change when you get a lock is: *the sight flares open and lights up.*

Reticle logic (**DIS-L** `$50e2`-`$50ff`):

- The "target" reticle is used when the absolute angle from the player's facing to the enemy is
  **within 2/256 of a turn - about 2.8 degrees**.
- **While the player's shell is in flight the whole reticle blinks**: on for 32 NMIs, off for 32
  (128 ms each, about 3.9 toggles/sec). When the gun is loaded the reticle is solid. This is the
  "can't fire yet" tell.
- The reticle is not drawn at all while the attract-mode logo is up.

---

## 2. Objects, shapes, scoring

### Object table

The ROM has a **44-entry object table, 2 slots empty**. Shapes are lists of 16-bit X/Y/Z vertices
plus a byte-code drawing-command list (3-bit command + 5-bit vertex index), so **max 32 vertices per
object, further limited to 26 by the transform code**. **Shapes can only rotate about Y (yaw) - never
tilt.** **DIS-O**

Full list (**DIS-O**):

| Idx | Object |
| --- | --- |
| `$00` | Narrow pyramid |
| `$01` | Tall box |
| `$02` | Slow Tank (body) |
| `$03` | Cannon shell (projectile) |
| `$04`-`$07` | Rear tread frames 0-3 (slow tank) |
| `$08`-`$0b` | Front tread frames 0-3 (slow tank) |
| `$0c` | Wide pyramid |
| `$0d` | Radar dish - sits on the slow tank, rotates |
| `$0e` | Projectile explosion (single vertex, special draw command) |
| `$0f` | Short box |
| `$10`-`$15` | Tank debris chunks (6 of them; `$13` is the radar dish, `$14`/`$15` alias `$11`/`$10`) |
| `$16` | Missile |
| `$17` | Logo "Ba" (pre-tilted) |
| `$18`-`$1d` | Missile debris chunks |
| `$1e` | Logo "ttle" |
| `$1f` | Logo "Zone" |
| `$20` | Saucer |
| `$21` | Super Tank (single body object - **no separate treads, no radar dish**) |
| `$22`, `$23` | empty slots (unexplained) |
| `$24`-`$2b` | Spatter 0-7 - the bits that drop off a missile |

Only shapes `$10`-`$1f` can appear **above ground level**. Altitude comes from an 8-entry table keyed
on `type & 7`, which is how missiles, debris and the rising logo all get a Y position. **DIS-O**

### Visible-object list, built fresh every frame (**DIS-O**)

1. The enemy unit:
   - Slow Tank -> **three** objects: body `$02`, radar dish `$0d`, and *either* the front or the rear
     tread frame (`$04`-`$0b`), whichever end faces the player.
   - Super Tank -> **one** object, `$21`.
   - Missile -> missile body `$16` **plus** a spatter object `$24`-`$2b`.
   - Exploding -> up to **six** debris chunks.
2. Player and enemy projectiles (`$03` in flight, `$0e` while exploding).
3. The saucer, if active (`$20`).
4. Up to **21 obstacles** (`$00`, `$01`, `$0c`, `$0f`).
5. In attract mode with the logo up, the three logo pieces.

### Enemy types

**Slow tank** - the baseline enemy. Animated treads on both ends; the animation **reverses when the
tank reverses**, and only the end facing the player is drawn (the hidden-surface trick leaks a little
when the tank is nearly side-on to you). A **spinning radar dish** sits on top; it advances `$0b`
(15.5 deg) per frame - the same rate as your own radar sweep. **DIS**, **DIS-L** `$642a`

**Super tank** - single-piece body, no treads or dish. Moves at **2x** the slow tank's step distance
and **rotates at 2x** the slow tank's rate. Stops closing on you at distance `$0800` instead of
`$0500`. **DIS-L** `$64f8`, `$6489`, `$64e4`

**Missile** - spawns at altitude `$1800` and descends by decrementing its altitude high byte each
frame. It flies toward the player, **zig-zagging** (see §3), and **hops over obstacles**: if it
collides while below altitude `$200` it sets a hop flag and climbs until clear. It is
**unshootable while at or above altitude `$200`**. It is destroyed by ramming you (and you die too).
**DIS-L** `UpdateMissile` `$6624`, `$5fa6`

**Saucer** - does **not** shoot, does **not** appear on radar, **passes through obstacles**, and
**never leaves until killed** (it just stops making noise when out of the visible set). It spins
(facing `+= $08`, i.e. 11.25 deg/frame) and wanders with random velocity, re-randomised at random
intervals. An **enemy tank can shoot the saucer, and you get no points if it does**. **DIS**,
**DIS-L** `UpdateSaucer` `$677c`, **SW**

### Obstacles

- **21 obstacles, fixed.** Their **types, positions and orientations are hard-coded tables in ROM** -
  they are *not* randomly generated. **DIS**, **DIS-L** `obstacle_t_f` at `$3fcc`
  - **SW says "the positions of the solids are randomly-generated so it is never the same game
    twice" - this is wrong.** The battlefield layout is identical every game; only the player's
    starting spot after a death is random.
- Mix: **6 wide pyramids, 5 narrow pyramids, 5 tall boxes, 5 short boxes**, each with an orientation
  byte. **DIS-L** `$3fcc`-`$3ff4`
- All are **indestructible** and block both movement and (mostly) shots.
- Collision radii **for vehicles**: narrow pyramid `$0340` (832), tall box `$0340` (832), wide pyramid
  `$0400` (1024), short box `$03c0` (960). The **player's own radius is `$0480` (1152)**. A missile's
  effective obstacle distance is scaled by **1.5x**, making it collide sooner (which triggers the
  hop). **DIS-L** `obstacle_radius` `$6995`, `$691b`, `$6936`
- Collision radii **for projectiles** are different and much smaller: narrow pyramid `$38` (56), tall
  box `$58` (88), wide pyramid `$56` (86), **short box `$00` - shells never hit short boxes**.
  **DIS-L** `obst_proj_diam` `$6139`
- Projectile-vs-pyramid behaves "correctly" in the sense that a near miss can pass over the pyramid's
  base. **DIS**
- Enemy spawn does **not** check obstacle collision, so **enemy tanks can spawn inside an obstacle**;
  the reverse-movement code also skips collision checks, which is how they back out. **DIS**
- The battlefield wraps: **visibility spans nearly half the battlefield**, so spinning in a circle
  shows you almost every obstacle on the map. **DIS**
- Near/far visibility planes: **`$03ff` to `$7aff`**. **DIS-L** comment at `CreateCommon`

### Hit / explosion behaviour

**Enemy destroyed** (**DIS-L** `$5fdc`-`$6041`, `InitUnitChunks` `$6199`, **DIS**):

- The unit is marked exploding and replaced by **6 debris chunks** (`$10`-`$15` for a tank, including
  the turret/radar piece; `$18`-`$1d` for a missile).
- All chunks start at the dead unit's exact position at **altitude 0**. Each has a **pre-determined
  X/Z velocity** from a table and a **Y velocity whose high byte is fixed but low byte is random** -
  so the spray pattern is the same shape every time, with slight variation.
- "The chunks that appear to be tumbling wildly through the air are actually just **spinning in
  circles**" - only yaw, no tilt. **DIS**
- **One chunk is thrown much higher than the others** and takes a while to land. The instant it
  touches down, the next enemy appears - there is **no gap** between enemies. **DIS**
- The killer's explosion sound is **soft** and short (counter `$70`); the victim's is **loud** and
  long (counter `$ff`, about 1 second). **DIS-L** `$6027`-`$603f`

**Shell hits an obstacle**: projectile switches to exploding state `$a0`, plays a **soft** explosion
(counter `$70`), and the single-vertex explosion object `$0e` is drawn with scaled AVG particle
commands (the same routine is reused for all shell bursts). The burst **does not rotate with the
impact angle**. **DIS-L** `$60a6`, **DIS-O**, **DIS**

**Saucer killed**: `saucer_dead_intens` is set to `$40` and counted down **2 per frame**; the drawn
intensity first **brightens** then **dims**, so the saucer flashes and fades out. The "saucer hit"
sound loops during the fade. Then a **random 0-255 frame (0-16.4 s) delay** before a new saucer.
**DIS-L** `$6102`, `$677c`-`$67a2`

**Player killed**: see the death sequence in §4.

### Point values

| Target | Points | Source |
| --- | --- | --- |
| Slow tank | **1,000** | **DIS**, **DIS-L** `$600e`, **SW** |
| Missile | **2,000** | **DIS**, **DIS-L** `$6001`, **SW** |
| Super tank | **3,000** | **DIS**, **DIS-L** `$600a`, **SW** |
| Flying saucer | **5,000** | **DIS**, **DIS-L** `$6124`, **SW** |

All four confirmed against the ROM. Scores are stored as **2-byte BCD in thousands**, so every score
is a multiple of 1000 and the display appends a literal `000`. **DIS-L** `$6010`, `HighScoreList`
comment at `$549b`

The **enemy has a score too**: it gains **1,000 every time it kills you**. This drives the difficulty
ramp (§3, §7). **DIS**, **DIS-L** `$6757`

### Bonus tanks (extra lives)

DIP-selectable (**DIP**, **DIS-L** `CheckAwardLife` `$615f`):

| Bottom DIP bits | Bonus tanks |
| --- | --- |
| `..11....` | none |
| `..10....` | **15,000 and 100,000** - factory default |
| `..01....` | 20,000 and 100,000 |
| `..00....` | 50,000 and 100,000 |

- The **first** threshold (15K/20K/50K) awards **one** bonus tank, once. The **second** is always
  **100,000** and awards one more. There are **no further bonuses**. **DIS-L** `$615f`-`$6197`
- Award at the first threshold plays **four high-pitched beeps** (sound `$08`). **DIS-L** `$6180`
- Award at 100,000 plays the **nine-note 1812 Overture fanfare** (sound `$80`) and then, once the
  fanfare finishes, a **loud ~1 second explosion**. **DIS-L** `$6195`, `$51c2`-`$51d7`
- Nice detail: if your dying shot scores the kill that earns the bonus, **the game-over flag is
  cleared** and you keep playing. **DIS-L** `$617c`, `$618c`
- **SW** and **DIP** agree that 15,000 / 100,000 is the factory default; **SW** also states default
  is 3 lives at 25 cents.
- One search summary claimed `..01....` was the 15K/100K setting; the **DIP** table itself says
  `..10....`. Going with the DIP table.

### Starting lives

- `lives = (DSW0 & 3) + 2`, i.e. **2, 3, 4 or 5**. **DIS-L** `$5682`-`$5689`
- DIP table: `......11` = 2 tanks, `......10` = **3 tanks (factory default)**, `......01` = 4,
  `......00` = 5. **DIP** (the `$` marker denotes the default)

### How many enemies at once

- **Exactly one hostile unit on the battlefield at all times** - a tank, a missile, or a set of
  exploding chunks. Never two, never zero. **DIS**
- **Plus, independently, at most one saucer.** **DIS**
- So the maximum on-field set is: one tank *or* one missile, one saucer, one player shell, one enemy
  shell. **Verified** against the visible-object list build order. **DIS-O**

---

## 3. Controls, movement, shooting, enemy behaviour

### Physical controls

- **Two vertical 2-way (up/down) joysticks**, one per tread. The **right stick carries the fire
  button** on top. **WIKI**, **KLOV**, **SW**
- Input arrives through the POKEY's pot port as `U21BLLRR`: `1` = start-1, `B` = fire button,
  `LL`/`RR` = left/right stick where `00` = centre, `01` = back, `10` = forward. **DIS-L** file
  header comment
- The cabinet also has a **start button with an LED** driven by the game, and a **slam switch**.
  **DIS-L** `DSOUND_CTRL` bit `$40`; **DIS** (slam note)
- **One player only.** Start-2 exists in the input bits but is unused; KLOV lists max players = 1.
  **There is no two-player alternating mode.** **DIS-L** `$563f`, **KLOV**, **SW**
  (One comment in the ROM speculates the duplicated sound-state code may have been groundwork for a
  never-shipped head-to-head mode. **DIS-L** `$6027`)

### Exact stick-to-action mapping

From the jump table at `joystick_handlers` (**DIS-L** `$621e`):

| Left stick | Right stick | Action |
| --- | --- | --- |
| forward | forward | `MoveForward` **x2** |
| back | back | `MoveBackward` **x2** |
| forward | back | `RotateRight` **x2** (pivot in place) |
| back | forward | `RotateLeft` **x2** (pivot in place) |
| forward | centre | `RotateRight` **x1** + `MoveForward` **x1** |
| centre | forward | `RotateLeft` **x1** + `MoveForward` **x1** |
| back | centre | `RotateLeft` **x1** + `MoveBackward` **x1** |
| centre | back | `RotateRight` **x1** + `MoveBackward` **x1** |
| centre | centre | nothing (engine revs **down**) |

Any movement at all sets the discrete-sound "engine rev **up**" bit. **DIS-L** `$628e`, `$6292`

Important: **a single stick gives a curving move, not a pivot.** Pivoting on the spot requires the
two sticks in opposite directions.

### Speeds (all per game frame; game frame = 1/15.625 s = 64 ms - see §7)

| Thing | Step size | Steps/frame | Approx units/sec | Source |
| --- | --- | --- | --- | --- |
| Player forward/back | up to **~95** units (3/4 of the sin/cos high byte) | 1 or 2 | up to **~2,970** | **DIS-L** `CalcMoveDelta` `$6310` |
| Player turn | **0.703 deg** (1/512 turn) per `Rotate` call | 1 or 2 | **11 deg/s** (single stick) or **22 deg/s** (pivot) | **DIS-L** `RotateRight` `$639b` |
| Slow tank | same base step as player | 1, or 2 when driving straight | up to ~2,970 | **DIS-L** `$6500`, `$6511` |
| Slow tank turn | 0.703 deg x2 per frame = **1.41 deg/frame** | - | **~22 deg/s** | **DIS-L** `$6474`-`$64af` |
| Super tank | base step **doubled** | 1-2 | up to ~5,940 | **DIS-L** `$64f8` |
| Super tank turn | **2x** the slow tank = 4 calls = **2.81 deg/frame** | - | **~44 deg/s** | **DIS-L** `$6489`, `$64a6` |
| Missile | sin/cos **>> 6**, up to **~512** units | 1 | up to **~8,000** | **DIS-L** `$66c0` |
| Cannon shell | sin/cos **>> 7**, up to **~255** units | **4 sub-steps** | up to **~16,000** | **DIS-L** `$62b8` comment, `$65df` comment, `$5199` |

Angle units: facing is a **9-bit value** (512 directions, 0.703 deg each); most comparisons use only
the high byte (256 directions, 1.40625 deg each). **DIS-L** `$639b`, `$50e7`

Reference frames of distance: enemies spawn at **`$5fff` (24,575 units, "far")** or **`$2fff`
(12,287, "near")**; the far plane is **`$7aff`**. So at top speed you cross from a far spawn to
point-blank in roughly **8 seconds**. (Estimate, derived from the numbers above.)

### The player's cannon

- **Strictly one shell in flight at a time.** Firing is blocked while `projectile_state_0` is
  non-zero. **DIS-L** `$629f`
- Shell TTL is initialised to **`$7f` = 127** and decremented once per frame. The ROM comment at
  `$62aa` says "about 2 seconds"; the comment at `$62b8` computes max travel as `256 * 127 = 32512`
  (`$7f00`), "a bit past the far plane". **These two comments are mutually inconsistent with the
  4-sub-steps-of-255 figure** (which would give ~130,000 units). **Flagged as disputed.** For a
  clone, the practical statement is: the shell's range is **a little beyond the far spawn distance
  (~`$5fff`-`$7f00`)** and its life is bounded at 127 frames. **DIS-L** `$62aa`, `$62b8`, `$65df`
- The shell spawns **at the player's own position** and is not visible until it passes the near
  plane. **DIS-L** `$62ff`
- Shell travel and collision are done in **4 sub-steps per frame**, with a collision check after each
  sub-step, so fast shells can't tunnel through things. **DIS-L** `$5199`-`$51a5`
- Collision radius against a vehicle is **direction-dependent** (tanks aren't circles): roughly
  `radius = 1.5 * f(|facing difference|) + 56` units, which for tanks lands somewhere around
  **56-105 units**, and is larger for missiles (`+24` before the 1.5x). **DIS-L** `$5fb2`-`$5fd5`
- Firing the cannon sets the discrete "cannon fire" bit with **volume = loud** and a duration
  counter of **5**. **DIS-L** `$62ae`-`$62b6`

### Can you shoot down an enemy shell?

**No.** Projectile collision testing covers, in order: the **opposing unit**, the **saucer**, and
then **obstacles**. There is **no projectile-vs-projectile test anywhere**. **DIS-L**
`CheckProjColl` `$6045`

### Enemy firing

From **DIS-L** `TryShootPlayer` `$6595`:

- The enemy is **forbidden from firing for the first ~2 seconds (32 frames)** after either the player
  or the enemy spawns - explicitly "so we don't be unfair". **DIS**, **DIS-L** `$6595`
- If the enemy has been alive **less than 255 frames (~17 s)** *and* the player's score is **under
  2,000** *and* under 100K, the enemy will only shoot when the player is **within 45 degrees**
  (`$20`) and **fairly close** (distance high byte < `$24`). Past ~17 s alive, or past 2,000 points,
  those restraints are dropped.
- It fires only when its facing is **within 2 angle units (about 2.8 degrees)** of the bearing to the
  player.
- It fires only if **its own shell is not already in flight** - **one enemy shell at a time**.
- **The enemy can absolutely fire while the player's shell is in flight.** The two projectile slots
  are independent; nothing couples them. (Verified: no cross-check in `TryShootPlayer`.)
- `TryShootPlayer` is called **after every single rotation step**, so a turning tank will fire the
  instant it sweeps through your bearing. **DIS-L** `$6477`-`$64af`
- Enemy cannon fire uses the **soft** volume bit; the player's uses **loud**. The disassembler notes
  the audible difference is subtle in MAME. **DIS-L** `$65d9`, **DIS**

### Enemy tank movement strategy

**DIS-L** `UpdateTank` `$6424`, `SetTankTurnTo` `$6534`; summary in **DIS**:

- The game stores a **target heading** (`enemy_turn_to`) and the tank rotates toward it for a few
  frames before re-evaluating. Because the target isn't recomputed every frame, distant tanks show a
  characteristic **jerky forward-rotate-forward-rotate gait**. **DIS-L** comment at `$6424`
- If the angle error is **large**, the tank rotates **without moving**. If it is **small**, it turns
  one step and also **drives forward** - but only if it is not right in your face: it stops closing
  at distance **`$0500`** (slow tank) or **`$0800`** (super tank).
- When it is pointed exactly at its target heading, it moves **twice** in that frame (both treads
  forward).
- Running into an obstacle sets a **reverse flag for 48 frames (~3 s)**, during which it backs up
  while rotating randomly left or right; then it drives forward for **`$34` frames (~3.5 s)**.
- **It does not back up after bumping the player.** The well-known tactic of charging a tank and
  shooting it while it turns works not because of the collision but because your sudden change of
  bearing flips the tank from "move forward" to "rotate". **DIS-L** comment at `$6531`
- Aggression is set by **player score minus enemy score**:
  - enemy ahead -> **"be nice"**: heading offset by a random +/-45 deg from the previous heading, move
    counter `$30`; tanks spawn in front of you, move uncertainly, take bad shots.
  - roughly even -> **"medium"**: target heading is **90 degrees off** the bearing to the player, and
    1-in-8 times it just reverses instead. Move counter `$40` (~4 s).
  - player ahead by **7,000 or more**, or player over **100,000** -> **"mean"**: target heading is
    **the direct bearing to the player**, full aggression.
  - Regardless of the starting mood, a tank turns aggressive about **17 seconds after it spawns**
    (`rez_protect` saturating at `$ff`). **DIS**, **DIS-L** `$6538`, `$69fd`
- **Spawn placement**: angle = player facing +/- (random masked by `$0f`, `$1e`, `$3c` or `$78`,
  chosen by the same score-difference ladder). `$0f` -> within about **+/-21 deg in front of you**
  (nice); `$78` -> essentially **any bearing** (mean). Distance is **`$5fff` (far) or `$2fff` (near),
  50/50**; missiles are always **far** and always **within a few degrees of your facing**.
  **DIS**, **DIS-L** `CreateCommon` `$6a45`, `$6a0e`
- After the player dies and respawns, the enemy **proceeds on a random heading for 3 seconds**
  (`move_counter = $30`) before making decisions again. **DIS**, **DIS-L** `$5222`

### Missile behaviour in detail

**DIS-L** `UpdateMissile` `$6624`, `CreateMissile` `$6a22`:

- Spawns at **altitude `$1800`**, at the far distance, aimed at the player. Descends by **1 altitude
  high-byte unit per frame** whenever not hopping.
- Steers: small per-frame rotations (1 or 2 units) keep the desired heading pointed at the player.
- **Zig-zag / swerve**: the *actual* facing is set to `desired_heading +/- (frame_counter & $1f)`.
  That is a swerve of up to **31 angle units (~44 degrees)**, and bit 3 of the frame counter chooses
  the sign, flipping **every 8 frames (~0.5 s)**; the whole pattern cycles in **~2 seconds**. The
  swerve **amount never changes with difficulty** - what changes is *when it stops*. **DIS**,
  **DIS-L** `$66a7`
- **Final turn**: once inside a distance threshold the missile stops swerving and drives straight in.
  The threshold shrinks as your score approaches **base missile threshold + 25,000** (e.g. with the
  default 10K setting, from 35,000 upward), bottoming out at **`$0800` - very close**. So late-game
  missiles "swerve until just before the collision". The **first missile of the game never swerves at
  all** (it flies straight in). **DIS**, **DIS-L** `$6679`-`$669d`
- **Hop**: on colliding with an obstacle while below altitude `$200`, it restores its position, sets
  the hop flag, and **climbs** until it clears. So it cannot be hidden from behind a block or
  pyramid. **DIS-L** `$6719`-`$6745`, **SW**
- **Unhittable while altitude >= `$200`.** **DIS-L** `$5fa6`
- Missile hitting the player: **both die**; camera shake set to max (`horizon_adj = $ff`); missile
  buzz silenced; soft ~1 s explosion; a life is lost. **DIS-L** `$6749`-`$677b`
- After you die to a missile the game **forces the next enemy to be a tank**, "so we don't
  missile-spam the poor player". **DIS-L** `$524e`-`$5255`

### Saucer behaviour in detail

**DIS-L** `UpdateSaucer` `$677c`:

- Appears only once the score is **>= 2,000**. **DIS**, **DIS-L** `$67f8`
- Random initial position (both coordinate high bytes from the POKEY RNG); **independent of the
  player's position and facing**. **DIS**
- Velocity: each axis gets a random signed byte (**+/-127 units/frame**), re-randomised every
  **0-127 frames (0-8.1 s)**. **DIS-L** `$67cf`-`$67f7`
- Spins continuously: facing `+= $08` per frame = **11.25 deg/frame (~176 deg/s)**.
- Passes through obstacles, never expires, not on radar, never fires. **DIS**
- Delay between saucers after one is killed: random **0-255 frames (0-16.4 s)**. **DIS**, **DIS-L**
  `$6799`

### Enemy selection ladder (which enemy comes next)

**DIS**, **DIS-L** `CreateEnemyUnit` `$69be`, `GetTankType` `$69b5`:

1. **Only slow tanks at first.**
2. Once the score reaches the **DIP missile threshold (5K / 10K / 20K / 30K; default 10K)**, each new
   enemy is **randomly** a missile or a tank (50/50).
3. **Exception - stalling**: if you evade a tank for too long (**48-64 seconds**, i.e. the 256-frame
   counter reaching 4), the game throws a **missile** at you regardless of score. **DIS**, **DIS-L**
   `$506b`
4. **Exception - evaded missile**: if a missile misses and flies out of range, the game sends
   **another missile**, repeatedly, until a **16-32 second** timer expires, at which point it makes a
   tank. **DIS**, **DIS-L** `$6ba4`
5. **Super tanks**: an 8-bit counter starts at `$ff` and increments on every missile launch.
   Slow tanks are replaced by super tanks while that counter is **between 5 and 127 inclusive** -
   i.e. **after the 6th missile is launched**, and reverting to slow tanks **123 missiles later**.
   **DIS**, **DIS-L** `$69b5`
   - **This contradicts SW**, which says super tanks appear at **30,000 points**. The ROM ties super
     tanks to **missile count, not score**. Because missiles only start at the DIP threshold, the
     30,000 figure is a plausible *rule of thumb* for the default settings but is not what the code
     does. **SW is unreliable here.**
6. **If the player is dead, the next unit is always a tank.** **DIS-L** `$69be`

---

## 4. Game flow

### Attract mode

**DIS-L** `MainLoop` `$5000`-`$5068`, `ShowLogo` `$5299`, `InitLogoAndCtrs` `$531f`:

- Attract mode **alternates** between two segments, toggling a flag each cycle:
  1. **Demo play** - the game drives the player itself: alternating forward/backward every `$40` game
     frames (~4 s) and turning toward the enemy. A tank is created and fights the demo player.
     **DIS-L** `UpdatePlayer` `$61dd`-`$61f5`
  2. **High score list**.
  Each segment runs until the 256-frame counter reaches 4 (**about 16 seconds** per segment, since
  the counter increments every 256 game frames = 16.384 s). **DIS-L** `$502a`, `$5042`-`$5053`
- After the high-score list, the **logo is shown** (`attract_logo_flag`).
- **The logo is a 3D object, not text.** Three pieces - `"Ba"`, `"ttle"`, `"Zone"` - are added to the
  visible-object list and **animated**: they start at Y = **-1024** (below ground) and Z = **+1024**,
  and each frame rise **+8 in Y** and recede **+64 in Z**. The `"Zone"` piece is **held back** until
  the group has risen past Y = `$fcb0`, so the words appear in sequence. The pieces are drawn at
  **maximum intensity (`$f0`)**, are **pre-tilted in the shape data** (rotate 76 degrees about X and
  the logo faces the viewer squarely), and share one centre point. The reticle and the "enemy to"
  messages are suppressed while the logo is up. **DIS-O**, **DIS-L** `$52d0`-`$5319`, `$50e2`
- The `(C)(P)  ATARI 1980` string is drawn in the play area at **(-168, -240)** whenever the game is
  **not** being played. **DIS-L** `$5089`
- The ROM contains **two authenticity checks that watch for tampering with the copyright notice**; if
  they fail the game starts misbehaving (e.g. saucer sounds get suppressed after 100K).
  **DIS**, **DIS-L** `$510a`, `$5268`
- All audio is **muted** (including POKEY) while the game is not being played, via the discrete sound
  control register. **DIS**, **DIS-L** `$5639`

### Coin / start

- Default is **2 coins for 1 play** (**DIS**); DIP supports free play, 1 coin / 2 plays, 1 coin /
  1 play, 2 coins / 1 play, plus per-mech multipliers and bonus-coin schemes. **DIP**
- With no credits the game shows **`GAME OVER`**, the coin-cost strings (one of `1       2     S`,
  `1       1`, `2     S 1` combined with `  COIN    PLAY`), and **`INSERT COIN`**. With a credit
  banked it shows **`GAME OVER`** and **`PRESS START`**. The bottom line flashes at about
  **2 Hz** (NMI counter bit 6, "toggles every 64, ~3.9x/sec"). **DIS-L** `$5169`-`$518e`
- The **start button LED blinks about 8 times a second** while a credit is available. **DIS-L**
  `$562d`-`$5636`
- On start: score and enemy score zeroed, missile count reset to `$ff` ("no missiles launched yet"),
  saucer cleared, **player placed at approximately (0,0) facing angle 0 (toward the moon / north)**,
  lives set from the DIP, and the first enemy created. All sound is muted for that instant, then the
  engine sound is enabled. **DIS-L** `$5643`-`$568b`
- The map's `(0,0)` is marked in the disassembler's battlefield map as where the player starts a new
  game. **DIS**

### Player death sequence - the shattering windshield

This is the game's signature effect. From **DIS-L** `CrackWindshield` `$51e9` and the AVG data at
`$3592`:

- The crack art is **8 separate AVG subroutines** ("Shattered windshield effects, in 8 parts"),
  reached through a table of 8 VJSR entries (`vg_hit_cracks`).
- `death_crack_index` is set to **2** the moment the player is hit, and is **incremented by 2 every
  frame**. Each frame, the routine draws **every crack group from 0 up to the current index** - so the
  cracks **accumulate**, one new group per frame, until all 8 are on screen (index `$10`).
- Geometry: each group is a run of **short straight segments at intensity 12**, alternating drawn
  segments with blind moves, scattered right across the screen. The **first group starts at screen
  centre** (`CNTR`) and radiates outward - e.g. move (-100, +50), draw (-75, 0), move (+35, -100),
  draw (+40, +100), draw (-100, +100), move (+250, +25), draw (-150, -125), draw (+100, -50). Later
  groups reach out to the edges with long blind moves (up to `dx = +480`, `dy = -465`) between short
  jagged strokes. The net look is a **spider-web of angular cracks spreading from the middle of the
  viewport outward**, added a few lines at a time over 8 frames (~0.5 s).
- After all 8 groups are drawn, the game **holds the shattered view**. The ROM comment says it
  "want[s] to pause for (46-16)=30 frames (~2 sec)"; the index counts to **44**. (At 15.625 fps,
  index 16 -> 44 is 14 frames / ~0.9 s; the comment's arithmetic and the loop don't quite line up -
  **minor discrepancy, flagged**.) If the player's shell is still in flight the hold is **extended
  until it lands** - you can still score a kill from beyond the grave, and if that kill earns a bonus
  tank the game-over flag is cleared. **DIS-L** `$5205`-`$520d`, `$617c`
- POKEY channel 4 is silenced immediately on death (kills the missile buzz). **DIS-L** `$51eb`
- The camera also **lurches**: `horizon_adj = $ff`. **DIS-L** `$5fec`, `$6753`
- Explosion sound: **loud, ~1 second** (`dsnd_expl_ctr = $ff`) for whoever got hit. **DIS-L** `$6027`
- **SW** describes this simply as the screen "cracking". **SW**

### Respawn

**DIS-L** `RespawnPlayer` `$5222`:

- The player is placed at a **random position** (re-rolled until it doesn't collide with an obstacle
  or the enemy; the Z coordinate's high byte is masked to `$3f`, which the disassembler flags as
  unexplained), with a **random facing**.
- The enemy is sent off on a **random heading for ~3 seconds** and is **not allowed to fire for 2
  seconds**. **DIS**
- If a missile killed you, the next enemy is forced to be a **tank**.
- If the enemy died in the same exchange, a new enemy unit is created.

### Game over and high score entry

**DIS-L** `CheckHighScore` `$5344`, `NewHighScore` `$5361`, `EnterInitials` `$53c5`,
`UpdateInitialEntry` `$5465`, `SaveInitials` `$5442`:

- On losing the last life, `game_over_flags` is set; after the crack animation finishes the game
  checks the score against the **10-entry table**.
- If it made the table: the **nine-note 1812 Overture fanfare** plays (sound `$80`, channels 1 and 2
  with slightly different tones), then a **loud ~1 second explosion** once the fanfare ends. The
  table is shifted down to open the slot, and the score is written in. **DIS-L** `$5371`,
  `$53cf`-`$53db`
- The entry screen shows **`GREAT SCORE`**, **`ENTER YOUR INITIALS`**, **`CHANGE LETTER WITH RIGHT
  HAND CONTROLLER`**, **`SELECT LETTER WITH FIRE BUTTON`**, plus the usual score/high-score/lives
  HUD. **DIS-L** `$53e0`-`$53f1`
- **Default initials are `A--`** (first character `A`, other two `-`). **DIS-L** `$53b5`-`$53bf`
- Entry mechanics:
  - **Right stick forward/back cycles the current letter** through the character set. Forward
    advances (wrapping from `-` back to `A`), back goes down (wrapping from below `A` to space).
    A **4-frame repeat delay** keeps it from spinning too fast. **DIS-L** `$5465`-`$5499`
    - **SW says you push the *left* joystick - that is wrong.** The ROM's own on-screen instruction
      says right-hand controller, and the code reads the right stick bits.
  - **The fire button commits the letter** (edge-triggered: pressed now and not pressed last frame)
    and advances to the next position, which is initialised to `A`. After the **third** letter, the
    initials are saved. **DIS-L** `$53f7`-`$541d`
  - **Timeout: ~60 seconds** (the 256-frame counter reaching 4, i.e. 65.5 s) saves whatever has been
    entered. **DIS-L** `$53c5`
  - The three characters being entered are drawn starting at **(-72, -72)**. **DIS-L** `$5424`
- After saving, the high score list is shown for a few seconds and the game returns to attract mode.
  **DIS-L** `$5451`-`$545e`

### High score table

**DIS-L** `HighScoreList` `$549b`, `DrawBonusTankStr` `$553d`, `hs_def_initials` `$7b7f`:

- **10 entries.** Each is 2 bytes of BCD score (in thousands) plus 3 bytes of initials.
- **Power-on defaults: all ten entries are 5,000 points**, with initials:

  `EDR`, `MPH`, `JED`, `DES`, `TKE`, `VKB`, `EL ` (two letters and a space), `HAD`, `ORR`, `GJR`

  The disassembler's guesses at the people: EDR = Ed Rotberg, MPH = Morgan Hoff, JED = Jed Margolin,
  DES = Doug Snyder, HAD = Howard Delman, ORR = Owen Rubin. **DIS-L** `$7b7f`
  - Note: the tenth is **`GJR`**, not `DRR`. Confirmed byte-for-byte from the ROM.
- Row format is `SSSS000 III` - 4 BCD digits (leading zeros as spaces), the literal string `000 `,
  then the 3 initials. **DIS-L** `$54c6`-`$54e8`
- Layout: first row anchored at **(-128, +104)**; each subsequent row moves **-40 in Y** and
  **-268 in X** (11 characters at 24 units each is 264, so every line is **staggered 4 units further
  left** than the one above - a deliberate slight slant). With a tank icon the back-up is **-349**.
  **DIS-L** `$551c`-`$5537`
- A **tank icon** is appended to any score **>= 100,000**. In **rev 1** the ROM drew **one icon per
  100K, up to 10** (only ~5 actually fit, and million-point scores could glitch the display);
  **rev 2 draws exactly one icon** for any score over 100K. **This is the only difference between the
  two ROM revisions.** **DIS**
- Below the list, `BONUS TANK AT ` + the threshold digits + `000 AND 100000` is drawn at
  **(-348, -280)** - and is **omitted entirely** if the DIP is set to "no bonus tank". With the
  default DIP this reads **`BONUS TANK AT 15000 AND 100000`**. **DIS-L** `$553d`-`$5561`
- The list stops early at the first zero score. **DIS-L** `$54bc`

---

## 5. Sound

Hardware: **one POKEY (4 voices) plus discrete analog circuitry**, with a master mute and the start
LED on the same discrete control register. **DIS**, **DIS-L** `$1840`

### POKEY channel assignment (**DIS**)

| Channel | Effects |
| --- | --- |
| 1 | collision with object, post-collision "merp", saucer hit, saucer alive, high-score / 100K fanfare |
| 2 | radar ping, extra life (4 beeps), new-enemy alert (3 boops), high-score / 100K fanfare |
| 3 + 4 | missile buzz |

Priority notes (**DIS**): the **saucer sounds are lowest priority on channel 1** and pause when
anything else on channel 1 plays. The **radar ping frequently cuts off the three-boop new-enemy
alert**, because they share channel 2 with no priority handling at all. A faithful clone should
reproduce that stomping behaviour.

### The 8 POKEY sound effects

Selected by a single bit in the A register (**DIS-L** `StartSoundEffect` `$7985`). Each effect is
four data streams (AUDF1, AUDC1, AUDF2, AUDC2), stepped by the **250 Hz NMI**. Each stream chunk is
`{initial value, duration, increment, repetition count}`: the value is held for `duration` NMI ticks,
then `increment` is added and the duration reloads, for `repetition` iterations, then the next chunk
loads. A chunk value of `$00` ends the stream. **DIS-L** comment block at `$7886`

AUDF is a **period** value (larger = lower pitch). AUDC is `NNNFVVVV` - 3 bits of noise/distortion,
a force-volume-only bit, 4 bits of volume. **DIS-L** `$7886` comment

| Bit | Effect | Data (from `sfx_audio_data`, **DIS-L** `$7886`) | Character to synthesize |
| --- | --- | --- | --- |
| `$01` | **Radar ping** (ch 2) | AUDF2 = `$23` held 16 ticks; AUDC2 = `$a3` held 16 ticks | A single short (~64 ms) **high-pitched blip**, fixed pitch, low volume (3), tonal distortion `$a` |
| `$02` | **Collision with object** (ch 1) | AUDF1 sweeps in 10 alternating chunks - `$c0` step `-10`, `$84` step `+9`, `$f0` step `-8`, `$90` step `+7`, `$e4` step `-6`, `$9c` step `+5`, `$d8` step `-4`, `$a8` step `+3`, `$cc` step `-2`, `$b4` step `+1`, each 1 tick x 12; AUDC1 = `$ab` fading `-1` x9, then `$a2` x2 | A **low, rapidly wobbling / converging warble** that settles toward a middle pitch as it fades - the "clunk-wobble" you hear when you ram a block |
| `$04` | **Post-collision "merp"** (ch 2) | AUDF1 `$10` held 1 tick x32; AUDC1 `$c1` decreasing x2 | A very short **quiet high squeak** |
| `$08` | **Extra life** (ch 2) | AUDF2 = `$10` (high pitch) held `$70` ticks x2; AUDC2 alternates `$a2`/`$a0` seven times, 32 ticks each | **Four high-pitched beeps** - one pitch, volume gated on/off |
| `$10` | **New-enemy alert** (ch 2) | AUDF2 = `$40` with step `-1` x24, repeated three times; AUDC2 = `$a3` held 48 ticks x3 | **Three rising "boops"** (period decreasing = pitch rising), ~0.2 s each |
| `$20` | **Saucer hit** (ch 1) | AUDF1 = `$30` step `-4` x12, twice; AUDC2 = `$a3` held 2 ticks x12 | A short **rising chirp, played twice**, looped while the saucer fades out |
| `$40` | **Saucer alive** (ch 1) | AUDF1 alternates `$40` step `-2` x16 then `$20` step `+2` x16, twice; AUDC1 = `$a1` (volume 1) | The distinctive **slow up-and-down "hovering" siren**, quiet, looped continuously while the saucer lives |
| `$80` | **1812 Overture fanfare** (ch 1 **and** 2) | AUDF1 note sequence `$d9, $a2, $90, $80, $90, $a2, $90, $80(x2), $a2(x4)` at 48 ticks each; AUDF2 plays `$6c, $51, $48, $40, $48, $51, $48, $40(x2), $51(x4)`; AUDC1/AUDC2 = `$a7` for 13 steps | **Nine notes** of Tchaikovsky's 1812 Overture, two voices at **slightly different tones** played together (a deliberate detune/harmony). Plays at **100,000 points** and at **high-score entry**. **DIS**, **KLOV**, **SW** |

### Missile buzz (POKEY channels 3 and 4)

- Frequencies are set once at missile creation: **AUDF3 = `$ff`, AUDF4 = `$fe`** - two channels one
  period apart, which beat against each other and give the missile its **low warbling drone**.
  **DIS-L** `$6a33`-`$6a39`
- **Volume tracks distance**: the missile's distance high byte is shifted right 3 and masked to
  0-15, then inverted, so **nearer = louder**. Written to AUDC3 and AUDC4 every frame. Silence when
  the distance high byte has bit 7 set (too far) or the enemy isn't a missile. **DIS-L**
  `$6b87`-`$6b99`
- **SW** and **DIS** both describe the missile as audibly "humming" the whole time it is inbound;
  **SW** notes you can hear it even before missiles are due to appear (on the stall-triggered
  missile).
- The buzz is silenced when the enemy dies (**DIS-L** `$6b3d`), when the missile kills you
  (`$6760`), and at the start of the crack animation (`$51eb`).

### Discrete (non-POKEY) sounds

Bits in `DSOUND_CTRL` (`$1840`) (**DIS-L** file header):

| Bit | Function |
| --- | --- |
| `$80` | motor enable - 1 = **engine sound** on |
| `$40` | **start-button LED** |
| `$20` | sound enable - 0 = **mute everything, including POKEY** |
| `$10` | **engine rev** - 0 = rev down, 1 = rev up |
| `$08` | cannon fire volume - 0 = soft (enemy), 1 = loud (player) |
| `$04` | cannon fire enable - held 1 while the shot is sounding |
| `$02` | explosion volume - 0 = soft, 1 = loud |
| `$01` | explosion enable - held 1 while the explosion is sounding |

- **Engine rumble**: a continuous discrete-circuit sound, enabled whenever the game is being played.
  The **rev bit is set whenever the player moves and cleared when both sticks are centred**, and the
  circuit **ramps up and down over the course of several frames** rather than switching instantly -
  so the pitch/intensity glides. **DIS**, **DIS-L** `$628e`, `$6292`, `$5606`
- **Cannon fire**: enable bit held for a counter of **5 ticks** ("play briefly"). Player = **loud**,
  enemy = **soft** (the disassembler notes the difference is barely audible in MAME). **DIS-L**
  `$62b4`, `$65d5`, **DIS**
- **Explosion**: enable bit held for a counter - **`$ff` (~1 second)** for a loud/major explosion
  (player death, the victim of a kill, the 100K boom, the high-score boom) and **`$70` (~0.5 s)** for
  a soft one (shell hitting an obstacle, the shooter's own feedback). **DIS-L** `$6027`-`$603f`,
  `$60aa`, `$51d3`
- **Slam switch**: if triggered while no game is in progress, the game plays the **saucer-hit sound**
  as a deterrent. (Not reachable from MAME.) **DIS**, **DIS-L** `$561b`
- KLOV lists the cabinet audio as **unamplified mono** (needs a one-channel amp). **KLOV**

### Summary checklist of every audible thing in the original

1. Engine rumble (discrete, revs up/down with motion)
2. Player cannon fire (discrete, loud)
3. Enemy cannon fire (discrete, soft)
4. Explosion, loud (~1 s) - player killed, enemy killed (heard by the victim), 100K bonus, high score
5. Explosion, soft (~0.5 s) - shell hitting an obstacle; shooter's own feedback
6. Vehicle collision warble (POKEY ch 1) when you ram an obstacle
7. Post-collision "merp" (POKEY ch 2)
8. Radar ping (POKEY ch 2), once per sweep pass over the enemy
9. New-enemy alert, three rising boops (POKEY ch 2), once per enemy as it comes into range
10. Extra life, four high beeps (POKEY ch 2)
11. Saucer hovering loop (POKEY ch 1), only while the saucer passes the visible test
12. Saucer hit chirp, looped through the fade-out (POKEY ch 1)
13. Missile buzz (POKEY ch 3 + 4), distance-attenuated, detuned pair
14. Nine-note 1812 Overture fanfare (POKEY ch 1 + 2) at 100K and at high-score entry
15. Total silence (hard mute) whenever the game is in attract mode

There is **no separate "tank tread" sound** and **no dedicated "enemy in range" beep** in the ROM -
what people remember as the in-range alert is the **three-boop new-enemy alert plus the recurring
radar ping**. (`tread_drip_ctr` exists but the disassembler marks the player's tread counter "not
used".) **DIS-L** `$626f`, `$6446`

---

## 6. Text, font and messages

### The character set - complete

The ROM has exactly **41 glyphs** (**DIS-S**):

`space`, `0`-`9`, `A`-`Z`, a second `space`, `-`, `(C)` (copyright symbol), `(P)` (sound-recording
symbol).

**No lowercase. No punctuation other than the hyphen.** Everything on screen is upper case and
angular - the classic Atari vector font. **DIS-S**

### Font metrics, read from the glyph data

- Glyph strokes occupy **16 units wide x 24 units tall**; the advance (and the width of the space
  glyph) is **24 units**. So each cell is 16 of ink plus 8 of gap. **DIS-L** `$331e`-`$3326`
- Glyphs are built almost entirely from **`SVEC` short-vector commands in multiples of 8 units**,
  which is exactly why the letterforms look blocky and angular - the whole font is on an 8-unit grid,
  2 cells wide by 3 cells tall, with occasional 8x8 diagonals.
- Text is drawn at **intensity 12**.
- Two scales: **scale 1 (full)** and **scale 2 (half)**, selected automatically - string indices
  `$00`-`$12` render at **half size**, everything else at full. **DIS-L** `DrawStringPtr` `$6cd8`,
  **DIS-S**
- Max 127 characters per string. **DIS-L** `$6d1b`

### Every string in the game (English)

Verbatim from the ROM (**DIS-S**), with positions from **DIS-L** `$6d93`. Half-size strings are
marked:

| Index | String | Half size |
| --- | --- | --- |
| `$00` | `ENEMY TO ` | yes |
| `$02` | `LEFT` | yes |
| `$04` | `RIGHT` | yes |
| `$06` | `REAR` | yes |
| `$08` | `ENTER YOUR INITIALS` | yes |
| `$0a` | `CHANGE LETTER WITH RIGHT HAND CONTROLLER` | yes |
| `$0c` | `SELECT LETTER WITH FIRE BUTTON` | yes |
| `$0e` | `HIGH SCORE      000` | yes |
| `$10` | `ENEMY IN RANGE` | yes |
| `$12` | `MOTION BLOCKED BY OBJECT` | yes |
| `$14` | `GAME OVER` | no |
| `$16` | `PRESS START` | no |
| `$18` | `SCORE     000` | no |
| `$1a` | `HIGH SCORES` | no |
| `$1c` | `000 ` | no |
| `$1e` | `GREAT SCORE` | no |
| `$20` | `1       2     S` | no |
| `$22` | `1       1` | no |
| `$24` | `2     S 1` | no |
| `$26` | `  COIN    PLAY` | no |
| `$28` | `INSERT COIN` | no |
| `$2a` | `BONUS TANK AT ` | no |
| `$2c` | `000 AND 100000` | no |
| `$2e` | `(C)(P)  ATARI 1980` | no |

**That is the complete set** - there are no other in-game messages. So: yes, `MOTION BLOCKED BY
OBJECT` is real; yes, `ENEMY IN RANGE`, `GAME OVER`, `PRESS START`, `HIGH SCORES`, `SCORE`,
`HIGH SCORE` and `ENTER YOUR INITIALS` are all real, exactly as spelled above.

The coin strings `1       2     S` / `1       1` / `2     S 1` are column-aligned fragments that
overlay `  COIN    PLAY` to spell out things like "1 COIN 2 PLAYS". **DIS-L** `$5172`-`$517f`

### When each message shows, and how it flashes

| Message | Condition | Flash | Source |
| --- | --- | --- | --- |
| `ENEMY IN RANGE` | enemy alive, within radar range, and the radar blip intensity is non-zero | on/off every **2 game frames** (`frame_counter & $02`) - about 3.9 Hz | **DIS-L** `$6c44`-`$6c4e` |
| `ENEMY TO LEFT` / `RIGHT` / `REAR` | enemy alive and the angle from your facing exceeds **`$16` (about 31 degrees)**. `REAR` when the angle exceeds **`$6b` (about 150 degrees)**; otherwise `LEFT` if the signed angle is positive, `RIGHT` if negative | same 2-frame flash | **DIS-L** `$5126`-`$5147` |
| `MOTION BLOCKED BY OBJECT` | `recent_coll_flag` set (you are pressed against an obstacle) | on/off every **4 game frames** (`frame_counter & $04`) | **DIS-L** `$514a`-`$5156` |
| `GAME OVER` | game over, crack animation finished, not showing the logo | steady | **DIS-L** `$5169` |
| `PRESS START` / `INSERT COIN` | game over: `PRESS START` if a credit is banked, otherwise coin strings + `INSERT COIN` (suppressed on free play) | NMI bit 6, about **2 Hz** | **DIS-L** `$516e`-`$518e` |

**Localisation**: French, German and Spanish versions of every string are in ROM, selected by DIP
switch (`11` English, `10` French, `01` German, `00` Spanish). Positions differ per language.
**DIS-S**, **DIP**, **DIS-L** `$6f3a` onward. Known quirk: the Spanish "enemy to right" uses "muy",
so it literally reads "enemy **far** to the right". **DIS**

---

## 7. Everything else a faithful clone should get right

### Timing - the two clocks

This is easy to get wrong and it changes the whole feel:

- A **3 kHz** timer fires an **NMI every 12 ticks = 250 Hz**. The NMI handler does sound, coin
  handling, the start button, and buffer flips. **DIS**
- A counter incremented every **16 NMIs** paces the main game loop: **game logic runs at
  250/16 = 15.625 frames per second (64 ms per frame)**. **DIS**
- A separate counter restarts the vector state machine every **6 NMIs**: **display refresh
  41.7 Hz**. **DIS**
- So the same vector list is redrawn about 2.7 times per logic update. **All the per-frame numbers in
  this document are per game frame (1/15.625 s).**
- Derived time constants used in the code: `frame_count_256x` increments every **256 game frames =
  16.384 seconds**; text flashing off `nmi_count` toggles **4x/second** (BVC on bit 6) or
  **2x/second** (BPL on bit 7). **DIS-L** `$502a`, `$558f` comment
- There is a **watchdog**: if the NMI handler or the main loop stalls, the machine resets. **DIS**

### Difficulty ramp - the full picture

1. **Enemy score**: starts at 0, gains 1,000 per player death. Aggression is a function of
   `player_score - enemy_score`: negative/zero = mild, under 7,000 = medium, **7,000 or more (or any
   score over 100,000) = full aggression**. At full aggression tanks spawn in **any direction** and
   drive straight at you; when mild they spawn **in front of you**, wander, and miss. **DIS**
2. **Per-enemy ramp**: whatever mood a tank spawns in, it becomes aggressive about **17 seconds**
   after spawning. **DIS**
3. **Firing restraint** is lifted once the player passes **2,000 points** (or 17 s of enemy life, or
   100K). **DIS-L** `$659c`-`$65b4`
4. **Saucers** from **2,000** points. **DIS**
5. **Missiles** from the DIP threshold (**default 10,000**). **DIS**
6. **Missiles get nastier** - swerving until nearly on top of you - as the score approaches the
   **DIP threshold + 25,000**, capping out at a `$0800` final-turn distance. **DIS**
7. **Super tanks** replace slow tanks **after the 6th missile launch**, for the next 123 missiles.
   **DIS**
8. **Anti-camping**: evade a tank for **48-64 seconds** and the game sends a missile instead. **DIS**
9. Note what does **not** ramp: the slow tank's speed and turn rate are **constant** all game. Speed
   only increases in the sense that **super tanks** (2x speed, 2x turn) eventually replace slow
   tanks. **DIS-L** `$64f8`, `$6489`
   - So the common claim that "the enemy tank speed increases as your score rises" is **not literally
     true** in the ROM; what happens is the tank *type* changes and the AI becomes bolder.

### The 100,000-point retreat trick

**WIKI** states: "There is a gameplay modification at 100,000 points if the proper conditions are
met. When executed properly, the next appearing supertank will not attack, but will instead
retreat." **This is not corroborated by the disassembly** and no mechanism for it appears in the
code reviewed here. **Flagged as unverified.** (The ROM *does* contain behaviour keyed to 100,000:
the bonus tank, the 1812 fanfare, forced full aggression, the single tank icon in the high score
list, and the authenticity check that suppresses saucer sounds after 100K if the copyright notice was
tampered with - **DIS**.)

### Known original bugs and quirks worth knowing about

From **DIS** ("Bugs & Quirks") unless noted:

- **Multi-million-point score bug**: a documented 4,537,000 score was produced by hitting a saucer
  and a missile almost simultaneously so the hit sounds interfered. The mechanism has never been
  identified in the code. Normally about an hour of play yields 1,000,000.
- **rev 1 vs rev 2**: rev 1 drew one tank icon per 100K on the high score table (up to 10, only ~5
  fit, glitchy at a million). rev 2 draws one. **Only difference between the ROMs.**
- Enemy tanks can **spawn inside obstacles** and back out of them, because neither the spawn code nor
  the reverse-movement code checks collisions.
- The **tread hidden-surface trick leaks**: the far-side tread shows through the tank body when the
  enemy is nearly perpendicular to you.
- Code at `$62e2` reads `$a6` without setting it, so a player shell's angle can be off by up to
  **0.7 degrees**.
- Shells **never hit short boxes** (projectile diameter `$00`).
- Two unexplained empty slots in the object table.
- A RAM self-test bug misreports faults in low RAM (found by Phil Lapsley).

### Cabinet, production, credits

- Roughly **15,000 cabinets sold**. **WIKI**
- Designed by **Ed Rotberg**; the project also involved **Jed Margolin, Harry Jenkins, Roger Hector,
  Howard Delman, Mike Albaugh, Dan Pliskin, Doug Snyder, Owen Rubin** and **Morgan Hoff**. **SW**
  credits Rotberg, Rubin and Hector as designers.
- Inspired by Atari's 1974 top-down **Tank**; built on the vector hardware **Wendi Allen** designed
  for Lunar Lander. **WIKI**
- Developed alongside **Red Baron** (same architecture), and shipped first despite Red Baron getting
  shapes on screen first. **KLOV**
- Prototype names: **Future Tank** and **Moon Tank**. **KLOV**
- Honourable Mention for "Best Commercial Arcade Game", 1982 Arkie Awards, runner-up to Pac-Man.
  **WIKI**
- The military **Bradley Trainer** variant (1981) existed; Rotberg has said only **two cabinets** were
  made, with a Star Wars-style yoke and a TOW missile option. **KLOV**, **SW**

### Practical notes for a JavaScript recreation

- Keep the **two clocks separate**: simulate at **15.625 Hz** (or interpolate from it) and render
  faster. Nearly every constant in this document is in 15.625 Hz frames.
- Use the ROM's **screen units** (X +/-512, Y +/-384) as the canvas coordinate system and scale to
  the viewport - then every position in §1 drops straight in.
- Represent **intensity** as line brightness/alpha and honour the distance fade; it is a large part
  of the look, and the original used it to save beam time.
- The **radar is player-relative**: the wedge points straight up (your facing), the tick marks and
  the enemy dot rotate with you.
- The fixed **21-obstacle layout** is authentic; a randomly generated field is not.
- Remember there is **always exactly one** enemy unit, that the next one appears the **instant** the
  last high-flying debris chunk lands, and that **you cannot shoot enemy shells**.
- Don't forget the **hard mute** in attract mode and the **blinking start LED**.
- Objects **yaw only** - never pitch or roll, not even exploding debris. Any tumbling you add is
  inauthentic.

### Gaps and things still unverified

- The **operator's manual** (**MAN**) was located but not read for these notes. It is the right place
  to confirm the official DIP defaults, the self-test screens, and cabinet dimensions.
- **TCRF** (unused content, regional differences) was unreachable; unused-content claims are not
  covered here.
- The original **Atari source code** is reportedly on GitHub under `historicalsource` (per an
  AtariAge forum thread surfaced in search, and **DIS** links to "Original sources"). Not inspected
  here; it would be the authority on shape vertex coordinates if exact wireframe geometry is needed.
- Exact **vertex coordinates** for the tank, super tank, missile, saucer, pyramids, boxes, moon and
  mountain segments are in the AVG ROM (vertex table at `$388e`, command table at `$7472`) and in the
  disassembly listing, but were not transcribed into this document. **DIS-O**
- The radar wedge angle discrepancy (**~69 degrees** drawn vs **45 degrees** documented) is
  unresolved.
- The shell TTL / shell range arithmetic in the ROM comments is self-inconsistent; see §3.
- The `death_crack_index` hold duration arithmetic in the ROM comment does not match the loop; see
  §4.
