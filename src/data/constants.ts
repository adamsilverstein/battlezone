/**
 * Gameplay constants recovered from the original Atari Battlezone (1980) source
 * and ROMs.
 *
 * Citations are to the line-ending-normalised source listings: `BZONE.MAC.txt`
 * (main game), `BZMTNS.MAC.txt` (vector ROM), `BZSOUN.MAC.txt` (sound),
 * `BZSTST.MAC.txt` (self test / power-on), `VGUT.MAC.txt` and `VGMC.MAC.txt`
 * (vector generator), `MBUCOD.V05` (MathBox microcode) and `BZONE.MAP` (linker
 * map).  Those listings are blank-line separated, so quoted line numbers are the
 * odd-numbered code lines.
 *
 * The listings are not in this repository: they are the Atari sources published at
 * https://github.com/historicalsource/battlezone, and every `*.MAC.txt:NNNN`
 * citation in this project refers to a file there.
 *
 * UNITS
 * -----
 * * Positions are unsigned 16-bit and wrap, so the battlefield is a 65536 x
 *   65536 torus (`TPOSX`/`TPOSY`, BZONE.MAC.txt:413-415; the obstacle table
 *   stores plain 16-bit words).
 * * Headings are a 16-bit fixed-point value: `TANGLE` is the whole part, 0..255
 *   for a full turn (1 unit = 1.40625 degrees), and `LANGLE` is the fraction.
 *   Increasing the heading turns LEFT (ITANGL, BZONE.MAC.txt:5567).
 * * Object heights use the same units as positions; the ground plane is at
 *   z = -320 and the viewpoint is z = 0.
 * * Scores are BCD in units of 1000 (`HITS`, two bytes = four BCD digits; INFO
 *   appends a literal "000", BZONE.MAC.txt:8329 + the ZEROS message).
 */

// --------------------------------------------------------------------------- //
// Timing
// --------------------------------------------------------------------------- //

/**
 * NMI rate in Hz.  The NMI is the 3 kHz line divided by 12; the source header
 * calls it "NMI (4 US)", meaning 4 ms (BZONE.MAC.txt:41), and the self test
 * documents the 3 kHz square wave it is derived from (BZSTST.MAC.txt:425).
 */
export const NMI_HZ = 250;

/**
 * NMIs per game tick.  The NMI bumps `$INTCT` and only every 16th one bumps
 * `SYNC`, which is what MAIN waits on (BZONE.MAC.txt:2115-2123, 793-795).  The
 * source comments the period as 64 ms.
 */
export const NMI_PER_TICK = 16;

/** Game logic rate: one pass of MAIN per SYNC, 250 / 16 Hz. */
export const TICK_HZ = 15.625;

/** Seconds per game tick. */
export const TICK_SECONDS = 1 / TICK_HZ;

/**
 * NMIs between vector generator restarts.  `VTIMER` counts down from 6; on zero
 * the NMI halts the VG, swaps display buffers if the new one is ready, and
 * restarts it (BZONE.MAC.txt:2375-2407, commented "START UP VECTOR GENERATOR
 * FOR 24 MS").
 */
export const NMI_PER_REFRESH = 6;

/** Display refresh rate: 250 / 6 Hz.  The same buffer is re-drawn ~2.7x per tick. */
export const REFRESH_HZ = 250 / 6;

/**
 * Sound engine ticks per second.  MODSND is called from the NMI with no divider
 * (BZONE.MAC.txt:2163), so a "frame" in the BZSOUN sequence tables is one NMI,
 * 4 ms - despite the BZSOUN header saying 16 ms (BZSOUN.MAC.txt:33), which is
 * inherited from the Tube Chase original.
 */
export const SOUND_FRAME_HZ = 250;

/**
 * `FRAME` increments once per tick and `TIMOUT` once per `FRAME` wrap, so one
 * TIMOUT unit is 256 ticks = 16.384 s (BZONE.MAC.txt:827-833).
 */
export const TICKS_PER_TIMOUT = 256;

/** Number of collision/shell-update passes MAIN runs per tick (BZONE.MAC.txt:1163-1173). */
export const SHELL_STEPS_PER_TICK = 4;

// --------------------------------------------------------------------------- //
// Scoring
// --------------------------------------------------------------------------- //

/** One score unit is 1000 displayed points. */
export const SCORE_UNIT = 1000;

/** Score for destroying the ordinary enemy tank: 1 unit (BZONE.MAC.txt:4637). */
export const SCORE_SLOW_TANK = 1;

/** Score for destroying a missile / "buzz bomb": 2 units (BZONE.MAC.txt:4625-4629). */
export const SCORE_MISSILE = 2;

/** Score for destroying a supertank (TR7): 3 units (BZONE.MAC.txt:4631-4635). */
export const SCORE_SUPERTANK = 3;

/** Score for destroying the saucer: 5 units (BZONE.MAC.txt:4923). */
export const SCORE_SAUCER = 5;

/**
 * Score digits.  `HITS`/`HITS+1` hold four BCD digits and the display appends a
 * literal "000", giving a maximum displayed score of 9,999,000.  `HITS+2` is a
 * separate BCD counter of how many times the enemy has killed the player, used
 * for the difficulty ramp; `HITS+3` is unused.
 */
export const SCORE_BCD_BYTES = 2;
export const SCORE_TRAILING_ZEROS = 3;

// --------------------------------------------------------------------------- //
// DIP switches ($0A00 = OPTION, $0C00 = OPTON2)
// --------------------------------------------------------------------------- //

/**
 * Bonus-tank thresholds, `BONTBL` (BZMTNS.MAC.txt:965), selected by OPTION bits
 * 4-5 (NEWLIF, BZONE.MAC.txt:5011-5021).  The stored value is one BCD unit below
 * the advertised threshold because the award fires when the score *crosses* it,
 * and the attract display adds 1 before printing (BZONE.MAC.txt:2025-2033).
 *
 * 0 disables the bonus; the others are 15000, 25000 and 50000.
 */
export const BONUS_TABLE_BCD = [0x00, 0x14, 0x24, 0x49] as const;

/** The advertised bonus thresholds in points; 0 means "no bonus". */
export const BONUS_THRESHOLDS = [0, 15000, 25000, 50000] as const;

/**
 * There is also a fixed "super bonus" at 100000 points, which awards a life and
 * plays the SUPBON tune (NEWLIF, BZONE.MAC.txt:5055-5069; the BONPL1 message
 * reads "000 AND 100000").
 */
export const SUPER_BONUS_SCORE = 100000;

/** Starting lives = 2 + (OPTION & 3), so 2, 3, 4 or 5 (BZONE.MAC.txt:2355-2361). */
export const LIVES_OPTIONS = [2, 3, 4, 5] as const;

/**
 * Score at which missiles start to appear, `MISLVL` (BZMTNS.MAC.txt:967),
 * selected by OPTION bits 2-3 (ROBCHK, BZONE.MAC.txt:7357-7371).
 */
export const MISSILE_LEVEL_BCD = [0x05, 0x10, 0x20, 0x30] as const;
export const MISSILE_THRESHOLDS = [5000, 10000, 20000, 30000] as const;

/**
 * Language, from OPTION bits 6-7 (MSGS, BZONE.MAC.txt:8109-8131; the accumulator
 * is rotated four times and masked with 6, which picks out bits 6 and 7 in that
 * order).  All four message tables are in the ROM.
 */
export const LANGUAGES = ['ENGLISH', 'GERMAN', 'FRENCH', 'SPANISH'] as const;

/**
 * NOTE: the ROM only reads these switches; the factory default settings are a
 * property of the cabinet, not of the code, so they cannot be recovered from the
 * source.  A recreation has to pick its own defaults - the values below are the
 * ones this project uses, not values found in the ROM.
 */
export const DEFAULT_OPTIONS = {
  lives: 3,
  bonusThreshold: 15000,
  missileThreshold: 10000,
  language: 'ENGLISH',
} as const;

// --------------------------------------------------------------------------- //
// Player motion
// --------------------------------------------------------------------------- //

/**
 * One call to ITANGL/DTANGL adds or subtracts 0x80 to the 16-bit heading, i.e.
 * half a `TANGLE` unit = 0.703125 degrees (BZONE.MAC.txt:5567-5597).
 */
export const TURN_STEP_HEADING16 = 0x80;
export const TURN_STEP_DEGREES = 0.703125;

/**
 * `TANGLE` units in a full turn.  One unit is 1.40625 degrees, and most of the
 * ROM's angle thresholds - the radar sweep step, the reticle lock window, the
 * obstacle orientations - are quoted in them.
 */
export const HEADING_UNITS_PER_TURN = 256;

/**
 * One `TANGLE` unit in radians.  The simulation works in radians, and the ROM's
 * angles count the opposite way round - increasing `TANGLE` turns left - so
 * converting a ROM angle also flips the sign (see the angle convention in
 * `engine/math.ts`).
 */
export const TANGLE_UNIT_RADIANS = (Math.PI * 2) / HEADING_UNITS_PER_TURN;

/**
 * Turn steps per tick.  A pivot (one stick forward, one back) turns twice;
 * turning while driving turns once (MTAB dispatch, BZONE.MAC.txt:5217-5247).
 */
export const PLAYER_PIVOT_STEPS = 2;
export const PLAYER_TURN_STEPS = 1;

/** Degrees per second while pivoting: 2 * 0.703125 * 15.625. */
export const PLAYER_PIVOT_DEG_PER_SEC = PLAYER_PIVOT_STEPS * TURN_STEP_DEGREES * TICK_HZ;

/**
 * One M.FOR/M.REV step moves 3/4 of the high byte of sin/cos of the heading, so
 * the step length is 0.75 * 127 = 95 world units (M.SET, BZONE.MAC.txt:5431-5501).
 */
export const MOVE_STEP_UNITS = 95;

/**
 * Move steps per tick: "full ahead" (both sticks forward) takes two, a turning
 * move takes one (M.FF / M.F, BZONE.MAC.txt:5249-5261).
 */
export const PLAYER_FULL_SPEED_STEPS = 2;
export const PLAYER_HALF_SPEED_STEPS = 1;

/** Top speed in world units per second: 2 * 95 * 15.625. */
export const PLAYER_SPEED_UNITS_PER_SEC = PLAYER_FULL_SPEED_STEPS * MOVE_STEP_UNITS * TICK_HZ;

// --------------------------------------------------------------------------- //
// Shells
// --------------------------------------------------------------------------- //

/**
 * `FIRECT` is loaded with 0x7F when a shell is fired and decremented once per
 * SHUPDT pass (BZONE.MAC.txt:5315-5317, 8043-8051).  SHUPDT runs 4x per tick, so
 * the shell lives 127 steps = 31.75 ticks = 2.03 s.
 */
export const SHELL_LIFE_STEPS = 0x7f;

/** Shell life in ticks: 127 / 4. */
export const SHELL_LIFE_TICKS = SHELL_LIFE_STEPS / SHELL_STEPS_PER_TICK;

/**
 * Shell speed.  `SINCX`/`SINCY` are the 16-bit sine/cosine shifted right seven
 * places, i.e. 256 * the unit vector, added once per SHUPDT pass
 * (BZONE.MAC.txt:5329-5411).
 */
export const SHELL_STEP_UNITS = 256;

/** World units per tick: 256 * 4. */
export const SHELL_SPEED_UNITS_PER_TICK = SHELL_STEP_UNITS * SHELL_STEPS_PER_TICK;

/** Maximum shell range: 127 steps of 256 units. */
export const SHELL_RANGE_UNITS = SHELL_LIFE_STEPS * SHELL_STEP_UNITS;

/**
 * There is no separate reload timer: the player can fire again only once
 * `FIRECT` is zero, so the reload time is whatever remains of the shell's flight
 * (BZONE.MAC.txt:5305-5313).  A shell that hits something is set to 0x80 (hit a
 * tank) or 0xA0 (hit an obstacle); negative values are counted up by 0x0F per
 * tick while the impact picture is drawn (BZONE.MAC.txt:3163-3193).
 */
export const SHELL_HIT_TANK_FIRECT = 0x80;
export const SHELL_HIT_OBJECT_FIRECT = 0xa0;
export const SHELL_EXPLOSION_STEP = 0x0f;

/** Cannon-report sound duration in NMIs (`SXPCNT`, BZONE.MAC.txt:5325-5327). */
export const CANNON_SOUND_NMIS = 5;

// --------------------------------------------------------------------------- //
// Enemy tank and supertank
// --------------------------------------------------------------------------- //

/**
 * The enemy drives with the same M.FOR1 step as the player but only once per
 * tick; the supertank doubles both components first, so it is twice as fast
 * (R.37$, BZONE.MAC.txt:5985-6001).
 */
export const ENEMY_MOVE_STEPS = 1;
export const SUPERTANK_SPEED_MULTIPLIER = 2;

/**
 * Move steps a tank takes on a tick that found it pointing exactly at its goal:
 * it puts both treads forward and moves twice (BZONE.MAC.txt:5985-6001;
 * docs/reference/original-game.md section 3, "Speeds").
 */
export const ENEMY_ON_GOAL_MOVE_STEPS = 2;

/**
 * Turn steps per tick while aiming.  Off-target by more than `SKILL` the enemy
 * pivots: two steps for a tank, four for a supertank; on the fine approach it
 * turns one step (BZONE.MAC.txt:5887-5931, 5937-5947).
 */
export const ENEMY_PIVOT_STEPS = 2;
export const SUPERTANK_PIVOT_STEPS = 4;
export const ENEMY_FINE_TURN_STEPS = 1;

/** The enemy's own radar dish spins 0x0B heading units per tick (BZONE.MAC.txt:5807-5813). */
export const ENEMY_DISH_STEP = 0x0b;

/**
 * `ACTION` is the decision timer, decremented once per tick (BZONE.MAC.txt:919).
 * REACT reloads it (BZONE.MAC.txt:5683-5767):
 *   attract mode        0x30 ticks
 *   score >= 10000      4 ticks (fast)
 *   otherwise           (5 - skill) * 16 ticks, where skill = score - deaths
 * and a collision retreat or a random reset uses 0x30/0x34/0x40.
 */
export const ENEMY_ACTION_ATTRACT = 0x30;
export const ENEMY_ACTION_EXPERT = 4;
export const ENEMY_ACTION_SKILL_BASE = 5;
export const ENEMY_ACTION_SKILL_SCALE = 16;
export const ENEMY_ACTION_AFTER_COLLISION = 0x30;
export const ENEMY_ACTION_NEW_GOAL = 0x34;
export const ENEMY_ACTION_EVADE = 0x40;

/**
 * `SKILL` is the heading error, in `TANGLE` units, within which the enemy stops
 * pivoting and starts creeping: 2 * (10 - skill) clamped to at least 2, or 0x14
 * in attract mode (BZONE.MAC.txt:5743-5763).
 */
export const ENEMY_AIM_TOLERANCE_ATTRACT = 0x14;
export const ENEMY_AIM_TOLERANCE_MAX = 20;

/** `TANGLE` units of aiming tolerance given back per point of skill: the 2 in 2 * (10 - skill). */
export const ENEMY_AIM_TOLERANCE_PER_SKILL = 2;

/**
 * How close the enemy drives before it stops closing: a tank keeps advancing
 * only while the distance high byte is at least 5, a supertank while it is at
 * least 8 (BZONE.MAC.txt:5949-6001).
 */
export const ENEMY_STOP_CLOSING_UNITS = 0x500;
export const SUPERTANK_STOP_CLOSING_UNITS = 0x800;

/**
 * The aggression ladder, from the player's skill (score in thousands minus the
 * number of times the enemy has killed them).  The enemy always attacks once the
 * score passes 10000 - and then re-decides every `ENEMY_ACTION_EXPERT` ticks -
 * and is at full aggression when the player is 7 units ahead or past 100000
 * (BZONE.MAC.txt:5683-5767, 6049-6141; docs/reference/original-game.md section 3).
 */
export const ENEMY_EXPERT_SCORE = 10000;
export const ENEMY_MEAN_SKILL = 7;
export const ENEMY_MEAN_SCORE = 100000;

/** `R.EVAD` reverses instead of circling one time in eight (BZONE.MAC.txt:6081-6109). */
export const ENEMY_EVADE_REVERSE_CHANCE = 8;

/** `R.RAND` nudges the goal heading by a random amount masked to 0x1F (BZONE.MAC.txt:6111-6131). */
export const ENEMY_RANDOM_GOAL_MASK = 0x1f;

/** The beginner fire handicap is lifted once the score reaches 2000 (BZONE.MAC.txt:6167-6187). */
export const ROOKIE_FIRE_MAX_SCORE = 2000;

/** The enemy only fires when its heading error is under 2 `TANGLE` units (BZONE.MAC.txt:6201-6207). */
export const ENEMY_FIRE_ANGLE_TOLERANCE = 2;

/**
 * `FTIMER` counts ticks since the current enemy appeared, saturating at 0xFF
 * (BZONE.MAC.txt:921-927).  The enemy will not fire at all for the first 0x20 =
 * 32 ticks (2.05 s) after it appears (FIREIT, BZONE.MAC.txt:6155-6159), and once
 * FTIMER saturates (255 ticks = 16.3 s) it always attacks (BZONE.MAC.txt:6053-6057).
 */
export const ENEMY_FIRE_GRACE_TICKS = 0x20;
export const ENEMY_FTIMER_MAX = 0xff;

/**
 * Beginner handicaps in FIREIT (BZONE.MAC.txt:6167-6187): while the score is
 * under 2000 the enemy will not fire unless it is within 0x20 `TANGLE` units of
 * the player's view direction, and not if `TDIST` (see below) is 0x24 or more.
 */
export const ROOKIE_FIRE_VIEW_WINDOW = 0x20;
export const ROOKIE_FIRE_MAX_TDIST = 0x24;

/**
 * Time between enemies.  When one is destroyed ROBCHK/TANKCK immediately places
 * the next one with `TIMOUT` = 1 and `ACTION` = 1, so the replacement appears on
 * the next tick; `FTIMER` is reset to 0, which is what gives the new arrival its
 * 32-tick grace period (BZONE.MAC.txt:7391-7405, 7653-7657).  A missile that
 * flies out of radar range is replaced after `TIMOUT` reaches 4
 * (BZONE.MAC.txt:7873-7885), i.e. up to 4 * 256 ticks.
 */
export const ENEMY_RESPAWN_TIMOUT = 1;
export const MISSILE_TIMEOUT_TIMOUT = 4;

/**
 * The supertank replaces the ordinary tank while `NOR2D3` reads 5 or more
 * (TR7CHK, BZONE.MAC.txt:7315-7323).  The counter starts at `$FF` and is bumped on
 * every missile launch, so it reads 5 after the sixth launch, and once it passes 127
 * - 123 missiles later - the slow tanks come back
 * (docs/reference/original-game.md section 3).
 */
export const SUPERTANK_AFTER_MISSILES = 5;
export const SUPERTANK_COUNTER_START = 0xff;
export const SUPERTANK_COUNTER_MAX = 127;

/**
 * How long the supertank breaks off its approach after the player fires.
 *
 * ESTIMATE: the ROM has no such behaviour - no enemy reacts to the player's shell
 * at all - but the design spec (5.2) gives the supertank a dodge, so this is the
 * recreation's own number.  It has to cover the swing as well as the run: at four
 * turn steps a tick a 90-degree break takes 32 ticks, so 0x30 ticks (about 3 s)
 * leaves the supertank a second of driving across the player's line of fire before
 * it goes back to attacking.
 */
export const SUPERTANK_DODGE_TICKS = 0x30;

/**
 * Where a new enemy is placed: at a random heading offset from the player, at a
 * distance of 3/4 of a 16-bit cosine, optionally halved again
 * (ROBCHK/ROB1, BZONE.MAC.txt:7483-7641).  The heading window narrows as the
 * player gets better, from a full 0x0F random spread down to a tight window in
 * front (BZONE.MAC.txt:7407-7451).
 */
export const ENEMY_SPAWN_ANGLE_MASK = 0x0f;

/**
 * The four spawn heading windows, widening with the aggression ladder: 0x0F puts
 * the arrival within about +/-21 degrees of the player's view, 0x78 puts it at
 * essentially any bearing (docs/reference/original-game.md section 3, "Spawn
 * placement"; the ROM shifts the 0x0F mask left as `score - deaths` rises).
 *
 * NOTE: docs/reference/atari-source-notes.md glosses this the other way round -
 * "a good player gets enemies in front of them" - but the masks it quotes are
 * left shifts of 0x0F, which widen the window, and the aggression ladder makes
 * the wide window the aggressive one.  Going with the widening reading.
 */
export const ENEMY_SPAWN_ANGLE_MASKS = [0x0f, 0x1e, 0x3c, 0x78] as const;

/**
 * Spawn distance: `ROB1` takes 3/4 of full 16-bit scale, and halves it again for
 * a tank half the time; missiles are always released at the far distance
 * (BZONE.MAC.txt:7483-7641, docs/reference/original-game.md section 3).
 */
export const ENEMY_SPAWN_FAR_UNITS = 0x5fff;
export const ENEMY_SPAWN_NEAR_UNITS = 0x2fff;

// --------------------------------------------------------------------------- //
// Missile ("buzz bomb" / R2D3)
// --------------------------------------------------------------------------- //

/**
 * Missile speed: the sine/cosine high byte shifted left twice, i.e. 4x the
 * player's per-step distance, applied once per tick (BUZBOM,
 * BZONE.MAC.txt:6485-6545).  That makes it about twice the player's top speed.
 */
export const MISSILE_SPEED_MULTIPLIER = 4;

/** Height at which the missile is released, `STARTZ` (BZONE.MAC.txt:717, 7455-7461). */
export const MISSILE_START_HEIGHT = 0x1800;

/**
 * `TOP` - the height the missile levitates to when it is blocked
 * (BZONE.MAC.txt:713).  While its height is below TOP and it is in collision
 * with an obstacle it climbs 0x100 per tick (`INC EXPOSZ+0D`,
 * BZONE.MAC.txt:6621); once clear it sinks 0x100 per tick
 * (BZONE.MAC.txt:6587-6595) - this is the "levitate over the obstacle and
 * resume swooping" behaviour described at BZONE.MAC.txt:6313.
 */
export const MISSILE_LEVITATE_TOP = 0x200;
export const MISSILE_CLIMB_PER_TICK = 0x100;

/**
 * The missile weaves: its heading is `RGOAL` plus or minus (FRAME & 0x1F),
 * flipping direction every 16 ticks (BZONE.MAC.txt:6457-6483).  It only weaves
 * once it is closer than a score-dependent `TDIST` threshold - MISLVL + 0x25
 * (BCD) minus the score, clamped to at least 8 (BZONE.MAC.txt:6409-6451).
 */
export const MISSILE_WEAVE_MASK = 0x1f;
export const MISSILE_SWOOP_TDIST_MIN = 8;
export const MISSILE_SWOOP_BCD_BIAS = 0x25;

/**
 * Ticks between flips of the weave's sign (BZONE.MAC.txt:6457-6483).
 *
 * NOTE: docs/reference/original-game.md reads the sign from bit 3 of the frame
 * counter, which would flip every 8 ticks; the source notes say 16.  Going with
 * the source notes, so the swerve and its mirror image each span one half of the
 * 32-tick `MISSILE_WEAVE_MASK` cycle.
 */
export const MISSILE_WEAVE_SIGN_TICKS = 16;

/** `TANGLE` units the missile's goal heading moves per tick, coarse and fine (BZONE.MAC.txt:6347-6407). */
export const MISSILE_GOAL_STEPS = 2;
export const MISSILE_GOAL_FINE_STEPS = 1;

/** The missile never approaches from behind: its goal is clamped to a 90-degree cone (BZONE.MAC.txt:6347-6373). */
export const MISSILE_APPROACH_CONE_HEADING = 0x40;

/** A missile must be below `TOP` to be hittable by the player's shell (BZONE.MAC.txt:4527-4535). */
export const MISSILE_HITTABLE_BELOW = 0x200;

// --------------------------------------------------------------------------- //
// Saucer
// --------------------------------------------------------------------------- //

/** The saucer only appears once the score is 2000 or more (BZONE.MAC.txt:6827-6833). */
export const SAUCER_MIN_SCORE = 2000;

/**
 * `STIMER` gates the saucer.  After it is destroyed it is reloaded with a full
 * random byte, 0..255 ticks (BZONE.MAC.txt:6729-6731); while flying it is
 * reloaded with a random byte shifted right, 0..127 ticks, after which the
 * saucer picks a new random velocity (BZONE.MAC.txt:6787-6823).
 */
export const SAUCER_RESPAWN_TICKS_MAX = 255;
export const SAUCER_COURSE_TICKS_MAX = 127;

/**
 * Saucer velocity: a random signed byte per axis, sign-extended to 16 bits and
 * added once per tick, so -128..127 units per tick per axis
 * (BZONE.MAC.txt:6787-6817).
 */
export const SAUCER_SPEED_MAX_PER_TICK = 128;

/** The saucer spins 8 heading units (11.25 degrees) per tick (BZONE.MAC.txt:6743-6749). */
export const SAUCER_SPIN_PER_TICK = 8;

/**
 * `SCOLFG` is set to 0x40 when the saucer is hit and decremented twice per tick,
 * so the disintegration lasts 32 ticks (BZONE.MAC.txt:4891-4893, 6721-6727).
 */
export const SAUCER_DEATH_TICKS = 32;

/** The saucer is spawned by randomising only the high bytes of its position (BZONE.MAC.txt:6839-6845). */
export const SAUCER_SPAWN_GRANULARITY = 256;

/**
 * How long a saucer stays before it drifts off.
 *
 * ESTIMATE: the original's saucer never leaves - it wanders until it is shot and
 * merely stops making noise when it is out of view (BZONE.MAC.txt:6697-6849) -
 * but the design spec (5.2) has it time out, so an ignored saucer does not hang
 * around for the rest of the game.  One visit is 256 ticks, 16.4 s, the same span
 * as the ROM's longest gap between saucers.
 */
export const SAUCER_VISIT_TICKS = 256;

/**
 * How high the saucer hovers, in world units.
 *
 * ESTIMATE: the surviving source does not record the saucer's altitude, and its
 * model's own vertices straddle the ground plane, so this is the recreation's
 * choice - high enough to read as flying above the obstacles it passes through.
 */
export const SAUCER_HOVER_HEIGHT = 0x400;

// --------------------------------------------------------------------------- //
// Radar and "ENEMY IN RANGE"
// --------------------------------------------------------------------------- //

/** Radar centre in screen vector units, `CENTRX`/`CENTRY` (BZONE.MAC.txt:707-709). */
export const RADAR_CENTRE = [0, 316] as const;

/**
 * Radar display radius.  `RDRING` never draws the circle; its four tick marks
 * stand 60 units out from the centre and the sweep line runs to the same radius
 * (BZMTNS.MAC.txt:552-577, reference section 1).  A blip's distance from the
 * centre is scaled so `ENEMY_IN_RANGE_UNITS` lands on the rim.
 */
export const RADAR_RADIUS = 60;

/** The sweep advances 0x0B heading units per tick (DRADAR, BZONE.MAC.txt:7697-7703). */
export const RADAR_SWEEP_PER_TICK = 0x0b;

/** Degrees per tick: 0x0B * 360 / 256. */
export const RADAR_SWEEP_DEG_PER_TICK = (RADAR_SWEEP_PER_TICK * 360) / 256;

/** Ticks for one sweep revolution: 256 / 0x0B. */
export const RADAR_SWEEP_TICKS_PER_REV = 256 / RADAR_SWEEP_PER_TICK;

/** Seconds per sweep revolution (about 1.49 s). */
export const RADAR_SWEEP_PERIOD_SECONDS = RADAR_SWEEP_TICKS_PER_REV / TICK_HZ;

/**
 * The blip lights when the sweep line passes within 0x0C heading units of the
 * enemy's bearing (BZONE.MAC.txt:7789-7799); `BLIP` is then set to 0xF0 and
 * decays by 8 per tick, so the blip fades over 30 ticks
 * (BZONE.MAC.txt:8017-8025).
 */
export const RADAR_BLIP_WINDOW = 0x0c;
export const RADAR_BLIP_BRIGHTNESS = 0xf0;
export const RADAR_BLIP_DECAY = 8;

/**
 * Radar range, and the "ENEMY IN RANGE" distance - the same test.  `TDIST` is
 * the high byte of the MathBox distance; when it is 0x80 or more the enemy is
 * out of range: no blip is drawn, `EIRNGE` is cleared, and the message and
 * warning sound are suppressed (BZONE.MAC.txt:7857-7885, 7997-8015).
 */
export const ENEMY_IN_RANGE_TDIST = 0x80;
export const ENEMY_IN_RANGE_UNITS = 0x8000;

/** World units per `TDIST` unit, since `TDIST` is that distance's high byte. */
export const TDIST_UNIT = ENEMY_IN_RANGE_UNITS / ENEMY_IN_RANGE_TDIST;

/**
 * The MathBox "distance" is an octagonal approximation, not a true hypotenuse:
 * DSTNCE computes |dx| and |dy|, then returns max + min/4 + min/8 - i.e.
 * max + 3/8 * min (MBUCOD.V05, ".SBTTL DISTANCE ROUTINE GIVEN TWO POINTS"; the
 * comment there says 2/3 but the microcode shifts give 3/8).
 */
export const DISTANCE_MINOR_NUMERATOR = 3;
export const DISTANCE_MINOR_DENOMINATOR = 8;

/**
 * The enemy engine rumble volume is driven straight from `TDIST`: the POKEY
 * channel 3 and 4 volumes are set to 0x0F - (TDIST >> 3), so the enemy gets
 * louder as it closes (BZONE.MAC.txt:7833-7855).
 */
export const ENEMY_RUMBLE_TDIST_SHIFT = 3;

// --------------------------------------------------------------------------- //
// Reticle and messages
// --------------------------------------------------------------------------- //

/**
 * `PTURN` is |bearing to the enemy - player heading| in `TANGLE` units
 * (BZONE.MAC.txt:971-989).  The reticle switches to the "locked" picture
 * (XCROS1) when PTURN < 2, i.e. the enemy is within 2.8 degrees of dead ahead
 * (BZONE.MAC.txt:995-1019).  While a shell is in flight the reticle is also
 * blanked on alternate NMI groups, which makes it blink.
 */
export const RETICLE_LOCK_HEADING = 2;

/**
 * The reticle blink while a shell is in flight: on for 32 NMIs, off for 32
 * (reference section 1), so the period is two ticks lit and two dark - the same
 * cadence as `MESSAGE_FLASH_MASK`.
 */
export const RETICLE_BLINK_NMIS = 32;
export const RETICLE_BLINK_TICKS = RETICLE_BLINK_NMIS / NMI_PER_TICK;

/**
 * Reserve-tank icons: the origin of the first `TSYMBL` icon and the step to the
 * next one.  The origin is from the ROM (INFO, BZONE.MAC.txt:8275).  The step is
 * NOT: nothing in the source states it, and 57 is inferred from the 48-unit-wide
 * icon art plus the gap the reference measures off the screen photographs
 * ("icon ~57 units wide", reference section 1).  ESTIMATE.
 */
export const LIVES_ICON_ORIGIN = [128, 360] as const;
export const LIVES_ICON_SPACING = 57;

/**
 * The "ENEMY TO LEFT/RIGHT/REAR" prompt appears when the enemy is 22 or more
 * `TANGLE` units off the view direction, i.e. more than ~31 degrees
 * (BZONE.MAC.txt:1063-1089); "REAR" is used beyond 0x6B (~151 degrees).  The
 * message flashes with bit 1 of `FRAME`, i.e. on for two ticks in four.
 */
export const ENEMY_DIRECTION_PROMPT_HEADING = 22;
export const ENEMY_REAR_PROMPT_HEADING = 0x6b;
export const MESSAGE_FLASH_MASK = 2;

/** "MOTION BLOCKED BY OBJECT" flashes with bit 2 of `FRAME` (BZONE.MAC.txt:1095-1103). */
export const BLOCKED_FLASH_MASK = 4;

// --------------------------------------------------------------------------- //
// Collision
// --------------------------------------------------------------------------- //

/**
 * Tank vs obstacle radii, `PROXTB`, indexed by object number
 * (BZONE.MAC.txt:7287-7295).  These are compared against the full 16-bit
 * MathBox distance.  Only the four obstacle types are non-zero.
 */
export type ObstacleModel = 'pyramid' | 'box' | 'pyramidWide' | 'boxShort';

export const OBSTACLE_TANK_RADIUS: Record<ObstacleModel, number> = {
  pyramid: 0x340, // 832
  box: 0x340, // 832
  pyramidWide: 0x400, // 1024
  boxShort: 0x3c0, // 960
};

/**
 * The *player* does not use PROXTB: OBJOBJ substitutes a single 0x480 = 1152
 * unit radius for every obstacle, commented "COLLIDE SO WE CAN SEE OBJECT"
 * (BZONE.MAC.txt:7159-7169).
 */
export const PLAYER_OBSTACLE_RADIUS = 0x480;

/** The missile uses 3/4 of the measured distance, i.e. a 4/3 larger effective radius (BZONE.MAC.txt:7181-7205). */
export const MISSILE_OBSTACLE_SCALE = 0.75;

/**
 * Tank vs tank: the distance high byte must be under 5 (0x500 = 1280 units), or
 * under 3 (0x300 = 768) when the enemy is a missile (BZONE.MAC.txt:7269-7279).
 */
export const TANK_TANK_RADIUS = 0x500;
export const TANK_MISSILE_RADIUS = 0x300;

/**
 * Shell vs obstacle radii, `PRXTBL`, compared against the distance shifted right
 * twice, so the unit here is 4 world units (BZONE.MAC.txt:4945-4953).  The short
 * box is 0, so shells fly straight over it.
 */
export const SHELL_OBSTACLE_RADIUS_QUARTERS: Record<ObstacleModel, number> = {
  pyramid: 56, // 224 units
  box: 88, // 352 units
  pyramidWide: 86, // 344 units
  boxShort: 0, // shells pass over it
};

/** World units per `PRXTBL` unit: the distance is shifted right twice first. */
export const SHELL_OBSTACLE_RADIUS_UNIT = 4;

/**
 * Shell vs tank (SHRTCK, BZONE.MAC.txt:4537-4589).  The hit radius depends on
 * how broadside the target is: with `d` = (|heading difference| * 2) >> 3 for a
 * tank, the threshold is 1.5 * d + 0x38 compared against distance / 4.  So the
 * hit radius runs from 0x38 (224 units, end on) to about 102 (408 units,
 * broadside).  A missile uses (|difference| * 2) >> 2 plus 0x18 instead, making
 * it a fatter target.
 */
export const SHELL_TANK_RADIUS_BASE = 0x38;
export const SHELL_TANK_ANGLE_SHIFT = 3;
export const SHELL_TANK_ANGLE_SCALE = 1.5;
export const SHELL_MISSILE_ANGLE_SHIFT = 2;
export const SHELL_MISSILE_ANGLE_BIAS = 0x18;

/** Shell vs saucer: 0x90 = 144, compared against distance / 4 (BZONE.MAC.txt:4885-4889). */
export const SHELL_SAUCER_RADIUS_QUARTERS = 0x90;

// --------------------------------------------------------------------------- //
// Playfield
// --------------------------------------------------------------------------- //

/** The battlefield wraps every 65536 units in x and y (positions are 16-bit). */
export const WORLD_SIZE = 0x10000;

/**
 * The 21 fixed obstacles.  Types and orientations come from `PTBLO1` in the
 * vector ROM at $3FCC (BZMTNS.MAC.txt:1669-1680) and positions from `PTBLX1` /
 * `PTBLY1` at $7681 / $76AB in the program ROM (BZONE.MAC.txt:9597-9619; the
 * `.NWORD` macro multiplies each listed literal by 4).
 *
 * `orientation` is in `TANGLE` units (0..255 for a full turn).  Obstacles do not
 * move and are never re-randomised.
 */
export interface Obstacle {
  readonly model: ObstacleModel;
  /** Object number used by the original tables. */
  readonly objectNumber: number;
  readonly x: number;
  readonly y: number;
  readonly orientation: number;
}

export const OBSTACLES: readonly Obstacle[] = [
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0x2000, y: 0x2000, orientation: 0x00 },
  { model: 'boxShort', objectNumber: 0x0f, x: 0x0000, y: 0x4000, orientation: 0x10 },
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0x0000, y: 0x8000, orientation: 0x20 },
  { model: 'boxShort', objectNumber: 0x0f, x: 0x4000, y: 0x8000, orientation: 0x40 },
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0x8000, y: 0x8000, orientation: 0x18 },
  { model: 'pyramid', objectNumber: 0x00, x: 0x8000, y: 0x4000, orientation: 0x28 },
  { model: 'box', objectNumber: 0x01, x: 0x8000, y: 0x0000, orientation: 0x30 },
  { model: 'pyramid', objectNumber: 0x00, x: 0x4000, y: 0x0000, orientation: 0x38 },
  { model: 'box', objectNumber: 0x01, x: 0x3000, y: 0x5000, orientation: 0x40 },
  { model: 'boxShort', objectNumber: 0x0f, x: 0xc000, y: 0x1800, orientation: 0x48 },
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0xf700, y: 0x4400, orientation: 0x50 },
  { model: 'pyramid', objectNumber: 0x00, x: 0xc800, y: 0x4000, orientation: 0x58 },
  { model: 'box', objectNumber: 0x01, x: 0xd800, y: 0x8c00, orientation: 0x60 },
  { model: 'boxShort', objectNumber: 0x0f, x: 0x9400, y: 0x0c00, orientation: 0x68 },
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0x9800, y: 0xe800, orientation: 0x70 },
  { model: 'pyramid', objectNumber: 0x00, x: 0xe800, y: 0xe400, orientation: 0x78 },
  { model: 'box', objectNumber: 0x01, x: 0x7000, y: 0x9c00, orientation: 0x80 },
  { model: 'boxShort', objectNumber: 0x0f, x: 0x7800, y: 0xcc00, orientation: 0x88 },
  { model: 'pyramidWide', objectNumber: 0x0c, x: 0x4000, y: 0xb400, orientation: 0x90 },
  { model: 'pyramid', objectNumber: 0x00, x: 0x2400, y: 0xbc00, orientation: 0x98 },
  { model: 'box', objectNumber: 0x01, x: 0x2c00, y: 0xf400, orientation: 0xa0 },
];

/** Number of obstacles on the battlefield. */
export const OBSTACLE_COUNT = OBSTACLES.length;

// --------------------------------------------------------------------------- //
// Projection
// --------------------------------------------------------------------------- //

/**
 * View culling, from ROTPNT (BZONE.MAC.txt:3313-3387).  The MathBox returns the
 * rotated depth X' and lateral offset Y'; the game doubles both and then rejects
 * the object if:
 *   * X' is negative (behind the viewer)
 *   * X' * 2 overflows 15 bits
 *   * X' < 512 (too close)
 *   * X' * 2 >= 0x7B00, i.e. X' >= 15744 (too far)
 *   * |Y'| >= X' (outside the 45-degree half field of view)
 */
export const NEAR_CLIP_UNITS = 512;
export const FAR_CLIP_UNITS = 0x7b00 / 2;

/** Half field of view: the |Y'| < X' test is exactly 45 degrees. */
export const HALF_FOV_DEGREES = 45;

/**
 * Horizontal screen scale.  The mountain range scrolls 512 vector units per 45
 * degrees of heading (see ./mountains.ts) and the 3D view is clipped at 45
 * degrees, so the field of view spans about 1024 vector units - matching the
 * 1016-unit-wide clipping window MAIN sets up with VGVTR at +/-127
 * (BZONE.MAC.txt:815-825, 895-907).  So screen_x is about
 * 512 * lateral / depth.
 *
 * NOTE: this constant is inferred from the mountain scroll rate and the clip
 * test, not read out of the MathBox microcode, whose exact fixed-point scaling
 * depends on the 10-bit divide length in `DIVCYC`.
 */
export const SCREEN_SCALE = 512;

/** Number of quotient bits the MathBox divide produces (`DIVCYC`, BZONE.MAC.txt:929-931). */
export const DIVIDE_BITS = 10;

/** The lower (3D view) clipping window, in vector units (BZONE.MAC.txt:815-825, 895-907). */
export const VIEW_WINDOW = { left: -508, right: 508, bottom: -508, top: 192 } as const;

/** With the window opened for the radar and score strip (BIGWND, BZONE.MAC.txt:1217-1229). */
export const FULL_WINDOW = { left: -508, right: 508, bottom: -508, top: 508 } as const;

/** Maximum vertices per object: `NPTS` in the projected point table (BZONE.MAC.txt:427). */
export const MAX_POINTS_PER_OBJECT = 26;

/** Maximum objects considered per frame: `NOBJ` (BZONE.MAC.txt:525). */
export const MAX_OBJECTS_IN_VIEW = 28;

/**
 * Depth cueing: DRAW dims an object by its depth.  `DQUE` is the high nibble of
 * the object's view depth, subtracted from the object's own intensity and
 * clamped to a minimum of 0x30 (BZONE.MAC.txt:3761-3775, 3989-3991).
 */
export const DEPTH_CUE_MIN_INTENSITY = 0x30;

/**
 * Depth cue shift: `DQUE` is the high nibble of the 16-bit view depth, so the
 * cue is `depth >> 12` in the vector generator's 0..15 intensity units.
 */
export const DEPTH_CUE_SHIFT = 12;

/** Maximum vector generator intensity (a nibble). */
export const INTENSITY_MAX = 0xf;

/**
 * Height of the viewpoint above the ground plane.  Object vertices are stored
 * relative to the viewpoint with the ground at -320 (see the UNITS note at the
 * top of this file), so putting the world's y = 0 on the ground puts the eye at
 * +320.
 */
export const EYE_HEIGHT_UNITS = 320;

/** The ground plane in the ROM's viewpoint-relative vertical units. */
export const GROUND_PLANE_UNITS = -320;

// --------------------------------------------------------------------------- //
// Display
// --------------------------------------------------------------------------- //

/**
 * Logical display half-extents.  The monitor is 4:3 and the vector coordinates
 * the game uses reach about +/-512 horizontally (the 1016-unit clipping window
 * plus overscan), so the logical space is 1024 x 768.
 *
 * ESTIMATE: the ROM only fixes the clipping windows above; the exact visible
 * extent depends on the monitor's deflection gain, which the reference notes
 * describe as reaching +/-1024 with overscan
 * (docs/reference/original-game.md section 1).
 */
export const SCREEN_HALF_WIDTH = 512;
export const SCREEN_HALF_HEIGHT = 384;

/**
 * What the tube actually shows.  The ROM's clipping windows are squarer than the
 * 4:3 monitor - `VIEW_WINDOW` reaches down to -508 - because the hardware window
 * circuit worked in deflection units, not visible ones.  Anything drawn outside
 * this rectangle was off the screen.
 */
export const DISPLAY_WINDOW = {
  left: -SCREEN_HALF_WIDTH,
  right: SCREEN_HALF_WIDTH,
  bottom: -SCREEN_HALF_HEIGHT,
  top: SCREEN_HALF_HEIGHT,
} as const;

/** The horizon line's screen y (docs/reference/original-game.md section 1). */
export const HORIZON_Y = 0;

/**
 * Draw the arcade cabinet's colour overlay by default: a red gel band over the
 * HUD strip above `VIEW_WINDOW.top` and green below it (design spec 5.4).
 */
export const OVERLAY_ENABLED = true;

// --------------------------------------------------------------------------- //
// Volcano
// --------------------------------------------------------------------------- //

/**
 * Where the crater sits on the 4096-unit mountain strip: the right-hand end of
 * segment 5, range coordinate 5 * 512 + 504
 * (docs/reference/atari-source-notes.md, "Mountains, moon and volcano").
 */
export const VOLCANO_RANGE_X = 3064;

/** Screen y of the emitter, `$5E` above the horizon (BZONE.MAC.txt:2535-2577). */
export const VOLCANO_CRATER_Y = 94;

/** Rock slots `VOLCNO` manages, and the 1-in-8 chance an idle slot launches (BZONE.MAC.txt:2721-2839). */
export const VOLCANO_ROCK_SLOTS = 5;
export const VOLCANO_LAUNCH_CHANCE_DENOMINATOR = 8;

/** Rock lifetime in ticks; the top three bits of the remaining life are its intensity. */
export const VOLCANO_ROCK_LIFETIME_TICKS = 0x1f;

/** Initial rock speeds: horizontal 1..4 either way, vertical 5..12 up. */
export const VOLCANO_ROCK_VX_MIN = 1;
export const VOLCANO_ROCK_VX_MAX = 4;
export const VOLCANO_ROCK_VY_MIN = 5;
export const VOLCANO_ROCK_VY_MAX = 12;

/** Vertical speed lost per tick, and how far below the crater a rock may fall. */
export const VOLCANO_ROCK_GRAVITY = -1;
export const VOLCANO_ROCK_FALL_LIMIT = 0xa2;

// --------------------------------------------------------------------------- //
// Death sequence
// --------------------------------------------------------------------------- //

/**
 * `CRACK` is set to 2 when the player is killed and incremented by 2 each tick.
 * WNSHLD emits the first `CRACK / 2` crack groups, capped at 8, and keeps
 * counting until CRACK passes 32 - so the crack grows over 8 ticks and the whole
 * sequence lasts 16 ticks, about 1.0 s, and also waits for any shell in flight
 * to finish (BZONE.MAC.txt:1231-1345).
 */
export const CRACK_GROUPS = 8;
export const CRACK_STEP_PER_TICK = 2;
export const CRACK_HOLD_UNTIL = 32;
export const DEATH_SEQUENCE_TICKS = 16;

/** The view shake: `BOUNCE` starts at 0xFF on death, 0x3F on an obstacle bump, and halves each tick (BOUND, BZONE.MAC.txt:4195-4199). */
export const BOUNCE_ON_DEATH = 0xff;
export const BOUNCE_ON_BUMP = 0x3f;

/**
 * Explosion debris.  Six pieces fly apart with fixed per-tick x/y velocities
 * from `EXPTBX`/`EXPTBY` and initial vertical velocities from `IZVEL`
 * (BZMTNS.MAC.txt:1655-1665; the `.NWORD` macro multiplies by 4).  Vertical
 * position advances by 4 * the velocity each tick and the velocity falls by
 * `GRAVTY` = -4 per tick (EXPLDE, BZONE.MAC.txt:3449-3537).  The explosion ends
 * when every piece's height has gone negative.
 */
export const DEBRIS_PIECES = 6;
export const DEBRIS_VELOCITY_X = [-120, -120, 20, 200, 0, -160] as const;
export const DEBRIS_VELOCITY_Y = [120, 0, -20, 200, -160, -160] as const;
export const DEBRIS_VELOCITY_Z = [55, 40, 70, 88, 40, 66] as const;
export const GRAVITY_PER_TICK = -4;
export const DEBRIS_Z_VELOCITY_SCALE = 4;

/**
 * The piece thrown highest: `IZVEL` entry 3 is 88, well above the other five, and
 * the next enemy appears the instant it lands
 * (docs/reference/original-game.md section 2, "Hit / explosion behaviour").
 */
export const DEBRIS_HIGH_PIECE = 3;

/**
 * How much smaller the missile's and saucer's debris spray is than a tank's.
 *
 * ESTIMATE: the ROM gives the missile its own six chunk models ($18-$1D) but
 * reuses `EXPTBX`/`EXPTBY` and `IZVEL` unchanged, and it scatters no chunks at all
 * for the saucer - it fades the saucer out instead (BZONE.MAC.txt:6699-6727).  The
 * design spec asks for smaller debris for both, so their spray is scaled down.
 */
export const DEBRIS_SMALL_SCALE = 0.5;

/**
 * Debris spin: a piece's orientation changes by `piece * 4 + 3` heading units per
 * tick, the direction depending on its index, and only about the vertical axis -
 * "the chunks that appear to be tumbling wildly are actually just spinning in
 * circles" (EXPLDE, BZONE.MAC.txt:3449-3645; original-game.md section 2).
 */
export const DEBRIS_SPIN_PER_PIECE = 4;
export const DEBRIS_SPIN_BASE = 3;

/** Explosion sound durations in NMIs (`EXPCNT`): long for a tank, short for an obstacle hit. */
export const EXPLOSION_NMIS_TANK = 0xff;
export const EXPLOSION_NMIS_OBJECT = 0x70;
export const EXPLOSION_NMIS_SAUCER = 0xa0;

// --------------------------------------------------------------------------- //
// Attract mode
// --------------------------------------------------------------------------- //

/**
 * The attract mode alternates between demo play and the high-score display.
 * `DSPLAY` bit 7 is toggled, and `TIMOUT` reset to 3, whenever TIMOUT reaches 4
 * - which happens one `FRAME` wrap later, so every 256 ticks = 16.384 s
 * (BZONE.MAC.txt:829-879).
 *
 * NOTE: the carry flag that gates this test is only set on the tick when FRAME
 * wraps; on other ticks `BCC` at BZONE.MAC.txt:853 reads a stale carry.  The
 * intent is clearly "every TIMOUT step", but the original is fragile here.
 */
export const ATTRACT_PHASE_TICKS = 256;
export const ATTRACT_PHASE_SECONDS = ATTRACT_PHASE_TICKS / TICK_HZ;
export const ATTRACT_TIMOUT_TRIGGER = 4;
export const ATTRACT_TIMOUT_RELOAD = 3;

/**
 * The demo pilot drives forward while bit 6 of `FRAME` is clear and reverses while
 * it is set, so it changes its mind every 64 ticks - about four seconds
 * (`MOTION` in attract mode, BZONE.MAC.txt:5143-5175).
 */
export const ATTRACT_DRIVE_MASK = 0x40;

/**
 * The flying BATTLE ZONE logo.  BATINT starts it at x = 0x0400, z = 0xFC00
 * (-1024); each tick x grows by 0x40 and z by 8, and when z passes 0x200 the
 * sequence restarts (BATTLE/BATINT, BZONE.MAC.txt:1397-1551).  That is 192
 * ticks, about 12.3 s.  "ZONE" is held back until z reaches about -592
 * ("DON'T DRAW ZONE UNTIL WE HAVE ENOUGH TIME", BZONE.MAC.txt:1471).
 */
export const LOGO_START_X = 0x0400;
export const LOGO_START_Z = -0x0400;
export const LOGO_X_PER_TICK = 0x40;
export const LOGO_Z_PER_TICK = 8;
export const LOGO_END_Z = 0x200;
export const LOGO_TICKS = 192;

/** The logo is drawn at a fixed bright intensity (`SINT` = 0xF0, BZONE.MAC.txt:1419-1421). */
export const LOGO_INTENSITY = 0xf0;

/**
 * The logo letters are "pre-tilted in the shape data (rotate 76 degrees about X
 * and the logo faces the viewer squarely)" (docs/reference/original-game.md
 * section 4).  Undoing that rotation stands the three groups up as one flat sign,
 * which is what `render/screens.ts` projects.
 */
export const LOGO_TILT_DEGREES = 76;

/**
 * "ZONE" is held back until the group has risen past this height, so the words
 * arrive in sequence - the ROM's reason is that the vector generator cannot draw
 * all three groups plus the playfield in one 24 ms refresh while they are large.
 *
 * The two references disagree on the threshold: `$FCB0` = -848
 * (docs/reference/original-game.md section 4) against "about -592"
 * (docs/reference/atari-source-notes.md, "Attract mode").  The byte value is the
 * more specific of the two, so it is the one used here.
 */
export const LOGO_ZONE_HELD_UNTIL = -0x350;

/**
 * How long `GAME OVER` is held over the battlefield before the score is checked
 * against the table.
 *
 * ESTIMATE: the original has no such hold.  Game over *is* attract mode there -
 * `CKSCOR` runs the instant the crack sequence ends, and the `GAME OVER` line then
 * sits on the attract display until someone spends a credit.  This recreation has
 * a `gameOver` phase of its own, so it holds the message for two seconds, the same
 * pause the ROM's own crack comment asks for, before moving on.
 */
export const GAME_OVER_TICKS = 32;

/**
 * `PRESS START` flashes at about 2 Hz, off NMI counter bit 6
 * (docs/reference/original-game.md section 6).
 *
 * ESTIMATE: 2 Hz at 15.625 ticks per second is eight ticks lit and eight dark.
 * The ROM counts NMIs, not game ticks, so the phase is not recoverable.
 */
export const PRESS_START_FLASH_TICKS = 8;

/**
 * Where the three characters being entered are drawn: 18 quarter-units left of
 * and below centre, i.e. (-72, -72) (BZONE.MAC.txt:1679-1815,
 * docs/reference/original-game.md section 4).
 */
export const INITIALS_ENTRY_ORIGIN = [-72, -72] as const;

// --------------------------------------------------------------------------- //
// High scores
// --------------------------------------------------------------------------- //

/** `HSCNUM` - the size of the high score table (BZONE.MAC.txt:559). */
export const HSCNUM = 10;

/**
 * Power-on defaults.  Every entry gets a score of 5 (= 5000 points) and the
 * initials come from `FDGTBL` (BZSTST.MAC.txt:206-242, found at $7B7F in the
 * program ROM).  The seventh entry really is "EL " with a trailing space.
 */
export const DEFAULT_HIGH_SCORE = 5000;
export const DEFAULT_INITIALS = [
  'EDR',
  'MPH',
  'JED',
  'DES',
  'TKE',
  'VKB',
  'EL ',
  'HAD',
  'ORR',
  'GJR',
] as const;

/**
 * Initial entry.  The first letter starts at 'A' (character byte 0x16) and the
 * other two show the underline glyph (byte 0x4C).  The right-hand controller
 * steps through 'A'..'Z' plus one blank (bytes 0x16..0x4A) with a four-tick
 * repeat delay in `LTIMER`, and the fire button commits a letter
 * (BZONE.MAC.txt:1667-1675, 1723-1755, 1817-1869).
 */
export const INITIALS_LENGTH = 3;
export const INITIALS_REPEAT_TICKS = 4;
export const INITIALS_FIRST_CODE = 0x16;
export const INITIALS_LAST_CODE = 0x4a;
export const INITIALS_UNDERLINE_CODE = 0x4c;

/**
 * Entry times out after `TIMOUT` reaches 4 (BZONE.MAC.txt:1679-1683), i.e. up to
 * 4 * 256 ticks; whatever is on screen is stored.
 */
export const INITIALS_TIMEOUT_TIMOUT = 4;

/**
 * Table layout on the high score screen: the first line is at (-32, 30) in
 * quarter-units (so (-128, 120) vector units) and each following line drops 10
 * quarter-units (BZONE.MAC.txt:1883-2005).  A tank icon is drawn beside each
 * entry, one per 1000 points, capped at 10 (BZONE.MAC.txt:1951-1971).
 */
export const HIGH_SCORE_LINE_X_QUARTERS = -32;
export const HIGH_SCORE_FIRST_LINE_Y_QUARTERS = 30;
export const HIGH_SCORE_LINE_SPACING_QUARTERS = 10;
export const HIGH_SCORE_MAX_TANK_ICONS = 10;

/**
 * Each line of the table is drawn `SSSS000 III` - eleven characters, 264 units -
 * and the ROM then backs the beam up 268, so every line starts four units further
 * left than the one above: a deliberate slight slant
 * (BZONE.MAC.txt:551c-5537, docs/reference/original-game.md section 4).
 */
export const HIGH_SCORE_LINE_X_SLANT = -4;

/**
 * How wide a tank icon beside a high score is.
 *
 * ESTIMATE: derived.  A line carrying an icon backs up 349 rather than 268, and
 * both have to land on the same next line, so the icon occupies the 81-unit
 * difference (docs/reference/original-game.md section 4).
 */
export const HIGH_SCORE_TANK_ICON_ADVANCE = 81;

// --------------------------------------------------------------------------- //
// Two-player mode
// --------------------------------------------------------------------------- //

/**
 * There isn't one.  Battlezone is a single-player game: the ROM has one start
 * button (`START` = 0x20, BZONE.MAC.txt:719, tested at BZONE.MAC.txt:2291-2295),
 * one `LIVES` counter and one score.  The "1 COIN 2 PLAY" style messages
 * (MODE1..MODE3, CONPLY) describe the coin *pricing*, not a two-player mode, and
 * are printed by the coin handling in COIN65.
 */
export const PLAYERS = 1;

// --------------------------------------------------------------------------- //
// Sound
// --------------------------------------------------------------------------- //

/**
 * Bit values passed to SNDON, which picks the sequence table by bit position
 * (BZSOUN.MAC.txt:136-152, 509-587).
 */
export const SOUND_BITS = {
  NONE: 0x00,
  /** Radar blip beep (table BE). */
  RADAR_BEEP: 0x01,
  /** Bump into an obstacle (table WP, the "boing"). */
  BOING: 0x02,
  /** Motion-blocked tone (table BK). */
  BLOCKED: 0x04,
  /** Bonus tank awarded (table BO). */
  BONUS: 0x08,
  /** "Enemy in range" warning warble (table WG). */
  WARNING: 0x10,
  /** Saucer disintegration (table DS). */
  SAUCER_DEATH: 0x20,
  /** Saucer present (table SA). */
  SAUCER: 0x40,
  /** The 100000-point super-bonus tune (table SU). */
  SUPER_BONUS: 0x80,
} as const;

/**
 * Bits written to the discrete sound latch at $1840 (`SOUND`).  Named after the
 * source's own equates (BZONE.MAC.txt:687-705) and their use sites.
 */
export const SOUND_LATCH_BITS = {
  /** Explosion trigger (`EXPLOD`). */
  EXPLOSION: 0x01,
  /** Explosion pitch select: set = low/big (`LOX`), clear = high/small (`HIX` masks it off). */
  EXPLOSION_LOW: 0x02,
  /** Shell / cannon report. */
  SHELL: 0x04,
  /** Shell loudness: set = loud (`LOUDSH`, the player's own gun), clear = soft (`SOFTSH`). */
  SHELL_LOUD: 0x08,
  /** Engine speed: set = revving (`HIDLE`), clear = idling (`LIDLE`). */
  ENGINE_REV: 0x10,
  /** Master sound enable (also the slam alarm in attract, BZONE.MAC.txt:2245-2251). */
  ENABLE: 0x20,
  /** Start-button lamp; the sense is inverted, setting it turns the lamp off. */
  START_LAMP_OFF: 0x40,
  /** Cabinet rumble / motor enable, set only while a game is running. */
  RUMBLE: 0x80,
} as const;

/**
 * POKEY registers at $1820.  The BZSOUN sequence engine drives AUDF1/AUDC1/
 * AUDF2/AUDC2 (its "channels" 1-4); the game writes AUDF3/AUDC3/AUDF4/AUDC4
 * directly for the enemy engine rumble.
 */
export const POKEY = {
  BASE: 0x1820,
  AUDF1: 0x1820,
  AUDC1: 0x1821,
  AUDF2: 0x1822,
  AUDC2: 0x1823,
  AUDF3: 0x1824,
  AUDC3: 0x1825,
  AUDF4: 0x1826,
  AUDC4: 0x1827,
  AUDCTL: 0x1828,
  RANDOM: 0x182a,
  POTGO: 0x182b,
  SKCTL: 0x182f,
} as const;

/**
 * The missile's engine note: when a missile is launched the game writes 0xFF to
 * AUDF3 and 0xFE to AUDF4 (BZONE.MAC.txt:7467-7473); the self test uses 0xFE for
 * both (BZSTST.MAC.txt:198-204).  Volume for both channels tracks `TDIST`.
 */
export const MISSILE_AUDF = [0xff, 0xfe] as const;

/** `AUDCTL` is always written with 0 by the sound engine (`AUDCV`, BZSOUN.MAC.txt:248). */
export const AUDCTL_VALUE = 0;

/**
 * Sound sequence tables, transcribed from BZSOUN.MAC.txt:334-507.  Each entry of
 * a channel is [startValue, framesPerStep, delta, steps]; a two-byte entry
 * [value, 0] ends the channel and leaves `value` as the idle level.  A "frame"
 * is one NMI (4 ms).  Channel order is [AUDF1, AUDC1, AUDF2, AUDC2]; a channel
 * with no data is left alone by that sound.
 *
 * In an AUDC byte the high nibble is the POKEY distortion/noise select and the
 * low nibble is volume, so e.g. 0xA3 is "pure tone, volume 3".
 */
export interface SoundStep {
  readonly start: number;
  readonly frames: number;
  readonly delta: number;
  readonly steps: number;
}

export interface SoundTable {
  readonly name: string;
  /** Bit passed to SNDON. */
  readonly bit: number;
  /** Per-channel sequences: AUDF1, AUDC1, AUDF2, AUDC2.  null = channel untouched. */
  readonly channels: readonly (readonly SoundStep[] | null)[];
}

const step = (start: number, frames: number, delta: number, steps: number): SoundStep => ({
  start,
  frames,
  delta,
  steps,
});

export const SOUND_TABLES: readonly SoundTable[] = [
  {
    name: 'RADAR_BEEP',
    bit: SOUND_BITS.RADAR_BEEP,
    channels: [null, null, [step(0x23, 0x10, 0, 1)], [step(0xa3, 0x10, 0, 1)]],
  },
  {
    name: 'BOING',
    bit: SOUND_BITS.BOING,
    channels: [
      [
        step(0xc0, 1, -0x0a, 6),
        step(0x84, 1, 9, 0x0c),
        step(0xf0, 1, -8, 0x0c),
        step(0x90, 1, 7, 0x0c),
        step(0xe4, 1, -6, 0x0c),
        step(0x9c, 1, 5, 0x0c),
        step(0xd8, 1, -4, 0x0c),
        step(0xa8, 1, 3, 0x0c),
        step(0xcc, 1, -2, 0x0c),
        step(0xb4, 1, 1, 0x0c),
      ],
      [step(0xab, 4, -1, 9), step(0xa2, 0x27, -1, 2)],
      null,
      null,
    ],
  },
  {
    name: 'BLOCKED',
    bit: SOUND_BITS.BLOCKED,
    channels: [[step(0x10, 1, 0, 0x20)], [step(0xc1, 0x10, -1, 2)], null, null],
  },
  {
    name: 'BONUS',
    bit: SOUND_BITS.BONUS,
    channels: [
      null,
      null,
      [step(0x10, 0x70, 0, 2)],
      [
        step(0xa2, 0x20, 0, 1),
        step(0xa0, 0x20, 0, 1),
        step(0xa2, 0x20, 0, 1),
        step(0xa0, 0x20, 0, 1),
        step(0xa2, 0x20, 0, 1),
        step(0xa0, 0x20, 0, 1),
        step(0xa2, 0x20, 0, 1),
      ],
    ],
  },
  {
    name: 'WARNING',
    bit: SOUND_BITS.WARNING,
    channels: [
      null,
      null,
      [step(0x40, 2, -1, 0x18), step(0x40, 2, -1, 0x18), step(0x40, 2, -1, 0x18)],
      [step(0xa3, 0x30, 0, 3)],
    ],
  },
  {
    name: 'SAUCER_DEATH',
    bit: SOUND_BITS.SAUCER_DEATH,
    channels: [
      [step(0x30, 1, -4, 0x0c), step(0x30, 1, -4, 0x0c)],
      [step(0xa3, 2, 0, 0x0c)],
      null,
      null,
    ],
  },
  {
    name: 'SAUCER',
    bit: SOUND_BITS.SAUCER,
    channels: [
      [
        step(0x40, 1, -2, 0x10),
        step(0x20, 1, 2, 0x10),
        step(0x40, 1, -2, 0x10),
        step(0x20, 1, 2, 0x10),
      ],
      [step(0xa1, 0x10, 0, 4)],
      null,
      null,
    ],
  },
  {
    name: 'SUPER_BONUS',
    bit: SOUND_BITS.SUPER_BONUS,
    channels: [
      [
        step(0xd9, 0x30, 0, 1),
        step(0xa2, 0x30, 0, 1),
        step(0x90, 0x30, 0, 1),
        step(0x80, 0x30, 0, 1),
        step(0x90, 0x30, 0, 1),
        step(0xa2, 0x30, 0, 1),
        step(0x90, 0x30, 0, 1),
        step(0x80, 0x30, 0, 2),
        step(0xa2, 0x30, 0, 4),
      ],
      [step(0xa7, 0x30, 0, 0x0d)],
      [
        step(0x6c, 0x30, 0, 1),
        step(0x51, 0x30, 0, 1),
        step(0x48, 0x30, 0, 1),
        step(0x40, 0x30, 0, 1),
        step(0x48, 0x30, 0, 1),
        step(0x51, 0x30, 0, 1),
        step(0x48, 0x30, 0, 1),
        step(0x40, 0x30, 0, 2),
        step(0x51, 0x30, 0, 4),
      ],
      [step(0xa7, 0x30, 0, 0x0d)],
    ],
  },
];

/**
 * POKEY divider base for Battlezone: the chip is clocked at 1.512 MHz / 28
 * (the 15 kHz mode POKEY is put in by `SKCTL` = 7), so an AUDF value n plays
 * roughly 1512000 / 28 / 2 / (n + 1) Hz.
 *
 * NOTE: the clock divider is a hardware property and is not stated in the
 * surviving source; treat this as an approximation to be checked against a real
 * board or against MAME.
 */
export const POKEY_CLOCK_HZ = 1512000 / 28;

// --------------------------------------------------------------------------- //
// Constants present in the source but unused
// --------------------------------------------------------------------------- //

/**
 * These are defined in BZONE.MAC.txt:703-721 but never referenced by any code in
 * the listing: `TNKPRX` = 0x38, `SWOOP` = 0x100, `LAMP` = 0x20, `COMAND` = 0x20.
 * They are recorded here only so a reader is not left hunting for them.
 */
export const UNUSED_EQUATES = { TNKPRX: 0x38, SWOOP: 0x100, LAMP: 0x20, COMAND: 0x20 } as const;
