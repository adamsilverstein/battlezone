/**
 * The enemy tank: `ROBOT` and `FIREIT` (BZONE.MAC.txt:5791-6301).
 *
 * THE STATE MACHINE
 * -----------------
 * The tank keeps a goal heading (`RGOAL`) and a decision timer (`ACTION`), and it
 * only re-thinks when the timer runs out - which is why a distant tank has that
 * characteristic jerky drive-rotate-drive gait rather than tracking you smoothly.
 * `Enemy.state` names what it is doing:
 *
 * | state      | set by                                   | what happens                            |
 * | ---------- | ---------------------------------------- | --------------------------------------- |
 * | `approach` | a decision that attacks (`R.ATCK`)       | goal = the bearing to the player        |
 * | `circle`   | a level decision (`R.EVAD`)              | goal = that bearing plus 90 degrees     |
 * | `wander`   | a losing decision (`R.RAND`)             | goal nudged by up to +/-0x1F units      |
 * | `align`    | any tick whose heading error is small    | one fine turn step, then close in       |
 * | `fire`     | any tick that got a shell away           | as `align`, and the cannon went off     |
 * | `retreat`  | driving into an obstacle, or 1 in 8 evades | reverse and swing for 0x30 ticks      |
 *
 * `align` and `fire` describe the tick rather than the plan: the plan is the goal
 * in the unit's brain, which outlives them.
 *
 * WHAT THE LADDER CHANGES
 * ----------------------
 * `REACT` (BZONE.MAC.txt:5683-5767) turns `score - deaths` into the decision
 * interval and the aiming tolerance, so a beginner faces a tank that re-thinks
 * every 5 s and gives up turning while still 28 degrees off, and a good player one
 * that re-thinks every quarter second and lines up to a couple of degrees.
 * `aggressionTier` is the same ladder, and the spawner reads it to pick how wide a
 * window the next arrival may come from.
 *
 * FIRING
 * ------
 * `FIREIT` is called after every single turn step, not once a tick, so a tank
 * sweeping past the player's bearing gets its shot off mid-pivot.  It needs the
 * heading error under 2 heading units, no shell of its own in the air and 32 ticks
 * of life; a beginner is additionally only shot at from in front and from close
 * range.  Nothing couples it to the player's shell - the enemy fires whether or
 * not one is in flight, and neither shell can shoot the other down.
 */

import {
  ENEMY_ACTION_AFTER_COLLISION,
  ENEMY_ACTION_EVADE,
  ENEMY_ACTION_EXPERT,
  ENEMY_ACTION_NEW_GOAL,
  ENEMY_ACTION_SKILL_BASE,
  ENEMY_ACTION_SKILL_SCALE,
  ENEMY_AIM_TOLERANCE_MAX,
  ENEMY_AIM_TOLERANCE_PER_SKILL,
  ENEMY_EVADE_REVERSE_CHANCE,
  ENEMY_EXPERT_SCORE,
  ENEMY_FINE_TURN_STEPS,
  ENEMY_FIRE_ANGLE_TOLERANCE,
  ENEMY_FIRE_GRACE_TICKS,
  ENEMY_FTIMER_MAX,
  ENEMY_MEAN_SCORE,
  ENEMY_MEAN_SKILL,
  ENEMY_MOVE_STEPS,
  ENEMY_ON_GOAL_MOVE_STEPS,
  ENEMY_PIVOT_STEPS,
  ENEMY_RANDOM_GOAL_MASK,
  ENEMY_STOP_CLOSING_UNITS,
  MOVE_STEP_UNITS,
  ROOKIE_FIRE_MAX_SCORE,
  ROOKIE_FIRE_MAX_TDIST,
  ROOKIE_FIRE_VIEW_WINDOW,
  SCORE_UNIT,
  SHELL_LIFE_TICKS,
  TANGLE_UNIT_RADIANS,
  TANK_TANK_RADIUS,
  TDIST_UNIT,
} from '../../data/constants';
import { TAU, clamp, wrapAngle } from '../../engine/math';
import { bearingTo, circleHitsObstacle, octagonalDistance, wrapCoordinate } from '../collision';
import { TURN_STEP_RADIANS } from '../player';
import type { Enemy, GameEvent, Rng, World } from '../types';
import { ageEnemy, enemyBrain, internalState, type EnemyBrain } from '../worldState';

/** What the tank is allowed to do with its treads, and how near it will come. */
export interface TankProfile {
  /** Turn steps per tick while pivoting towards the goal. */
  pivotSteps: number;
  /** Multiplier on every move step: the supertank is twice as fast. */
  speedMultiplier: number;
  /** It stops closing once the distance falls below this. */
  stopClosing: number;
}

export const TANK_PROFILE: TankProfile = {
  pivotSteps: ENEMY_PIVOT_STEPS,
  speedMultiplier: 1,
  stopClosing: ENEMY_STOP_CLOSING_UNITS,
};

/** Firing needs the heading error under 2 heading units. */
const FIRE_TOLERANCE_RADIANS = ENEMY_FIRE_ANGLE_TOLERANCE * TANGLE_UNIT_RADIANS;

/** The beginner handicap's window on the player's view direction. */
const ROOKIE_VIEW_RADIANS = ROOKIE_FIRE_VIEW_WINDOW * TANGLE_UNIT_RADIANS;

/** `R.EVAD` circles the player by aiming 0x40 heading units off the bearing. */
const QUARTER_TURN = TAU / 4;

/** The game's idea of skill: the score in thousands, less the enemy's own kills. */
function skillOf(world: World): number {
  return Math.floor(world.score / SCORE_UNIT) - internalState(world).playerDeaths;
}

/**
 * Where the player sits on the aggression ladder: 0 while the enemy is ahead
 * ("be nice"), 1 level with it, 2 while the player leads, 3 once the player is 7
 * units ahead or past 100000 ("mean").  The spawner uses the same number to pick
 * the arrival window (docs/reference/original-game.md section 3).
 */
export function aggressionTier(world: World): 0 | 1 | 2 | 3 {
  if (world.score >= ENEMY_MEAN_SCORE) return 3;
  const skill = skillOf(world);
  if (skill >= ENEMY_MEAN_SKILL) return 3;
  if (skill > 0) return 2;
  return skill === 0 ? 1 : 0;
}

/** `ACTION`: ticks until the next decision. */
function reactionTicks(world: World): number {
  if (world.score >= ENEMY_EXPERT_SCORE) return ENEMY_ACTION_EXPERT;
  const patience = (ENEMY_ACTION_SKILL_BASE - skillOf(world)) * ENEMY_ACTION_SKILL_SCALE;
  return clamp(patience, ENEMY_ACTION_EXPERT, ENEMY_ACTION_SKILL_BASE * ENEMY_ACTION_SKILL_SCALE);
}

/**
 * `SKILL`: the heading error the tank settles for before it starts creeping.  The
 * ROM's floor is two heading units, which is the same number as the firing window -
 * a tank that has lined up as far as it ever will is also lined up enough to shoot.
 */
function aimTolerance(world: World): number {
  const units = clamp(
    ENEMY_AIM_TOLERANCE_MAX - ENEMY_AIM_TOLERANCE_PER_SKILL * skillOf(world),
    ENEMY_FIRE_ANGLE_TOLERANCE,
    ENEMY_AIM_TOLERANCE_MAX,
  );
  return units * TANGLE_UNIT_RADIANS;
}

/** Turns at most `steps` steps towards `goal`, and says whether it arrived. */
function turnTowards(enemy: Enemy, goal: number, steps: number): boolean {
  const error = wrapAngle(goal - enemy.heading);
  const swing = steps * TURN_STEP_RADIANS;
  if (Math.abs(error) <= swing) {
    enemy.heading = wrapAngle(goal);
    return true;
  }
  enemy.heading = wrapAngle(enemy.heading + Math.sign(error) * swing);
  return false;
}

/** Puts the tank into its back-out, turning whichever way the dice picked. */
function startRetreat(enemy: Enemy, brain: EnemyBrain, rng: Rng): void {
  enemy.state = 'retreat';
  enemy.timer = ENEMY_ACTION_AFTER_COLLISION;
  brain.retreatTurn = rng.int(2) === 0 ? 1 : -1;
}

/** `R.RAND`: a fresh goal within about 45 degrees of the present one. */
function wanderGoal(enemy: Enemy, brain: EnemyBrain, rng: Rng, ticks: number): void {
  const nudge = rng.int(ENEMY_RANDOM_GOAL_MASK + 1) * (rng.int(2) === 0 ? 1 : -1);
  brain.goal = wrapAngle(brain.goal + nudge * TANGLE_UNIT_RADIANS);
  enemy.state = 'wander';
  enemy.timer = ticks;
}

/**
 * Decision time.  The tank attacks whenever it is winning the ladder, whenever it
 * has been alive long enough that `FTIMER` has saturated, whenever the score has
 * passed 10000, or on a coin flip; level on points it circles, or reverses one
 * time in eight; losing, it just wanders (BZONE.MAC.txt:6049-6141).
 */
function decide(world: World, enemy: Enemy, brain: EnemyBrain, rng: Rng): void {
  const tier = aggressionTier(world);
  const attacks =
    tier >= 2 ||
    brain.ftimer >= ENEMY_FTIMER_MAX ||
    world.score >= ENEMY_EXPERT_SCORE ||
    rng.int(2) === 0;

  if (attacks) {
    brain.goal = bearingTo(enemy.pos, world.player.pos);
    enemy.state = 'approach';
    enemy.timer = reactionTicks(world);
    return;
  }

  if (tier === 1) {
    if (rng.int(ENEMY_EVADE_REVERSE_CHANCE) === 0) {
      startRetreat(enemy, brain, rng);
      return;
    }
    brain.goal = wrapAngle(bearingTo(enemy.pos, world.player.pos) + QUARTER_TURN);
    enemy.state = 'circle';
    enemy.timer = ENEMY_ACTION_EVADE;
    return;
  }

  wanderGoal(enemy, brain, rng, ENEMY_ACTION_AFTER_COLLISION);
}

/**
 * Fires the enemy's cannon: one shell at a time, from the tank's own position,
 * along its own heading.  The player's shell is no business of this - the two
 * slots are independent, which is why an enemy can shoot back while your shot is
 * still on its way (BZONE.MAC.txt:6209-6301).
 */
export function fireEnemyShell(world: World, enemy: Enemy): GameEvent[] {
  if (world.shells.some((shell) => shell.owner === 'enemy')) return [];

  const state = internalState(world);
  world.shells.push({
    id: state.nextShellId,
    owner: 'enemy',
    pos: { ...enemy.pos },
    y: 0,
    heading: enemy.heading,
    ticksLeft: SHELL_LIFE_TICKS,
  });
  state.nextShellId += 1;
  return [{ type: 'enemyFired' }];
}

/** `FIREIT`: takes the shot if every one of its conditions holds. */
function tryFire(world: World, enemy: Enemy, brain: EnemyBrain): GameEvent[] {
  if (!world.player.alive) return [];
  if (brain.ftimer < ENEMY_FIRE_GRACE_TICKS) return [];

  const bearing = bearingTo(enemy.pos, world.player.pos);
  if (Math.abs(wrapAngle(bearing - enemy.heading)) >= FIRE_TOLERANCE_RADIANS) return [];

  // The beginner handicap: until the enemy has been alive 255 ticks or the player
  // has 2000 points, it only shoots from within the player's view and up close.
  if (brain.ftimer < ENEMY_FTIMER_MAX && world.score < ROOKIE_FIRE_MAX_SCORE) {
    const offView = wrapAngle(bearingTo(world.player.pos, enemy.pos) - world.player.heading);
    if (Math.abs(offView) >= ROOKIE_VIEW_RADIANS) return [];
    if (octagonalDistance(enemy.pos, world.player.pos) >= ROOKIE_FIRE_MAX_TDIST * TDIST_UNIT) {
      return [];
    }
  }

  const events = fireEnemyShell(world, enemy);
  if (events.length > 0) enemy.state = 'fire';
  return events;
}

/**
 * Drives `steps` move steps along the current heading, backing the move out again
 * if it ran into something.  Reports what was hit: the ROM backs out of both, but
 * only an obstacle makes the tank retreat - bumping the player does not
 * (BZONE.MAC.txt:6003-6047, and the comment at DIS-L `$6531`).
 */
function drive(world: World, enemy: Enemy, steps: number): 'obstacle' | 'player' | null {
  const before = { ...enemy.pos };
  const distance = steps * MOVE_STEP_UNITS;
  enemy.pos = {
    x: wrapCoordinate(before.x + distance * Math.sin(enemy.heading)),
    z: wrapCoordinate(before.z + distance * Math.cos(enemy.heading)),
  };

  if (circleHitsObstacle(enemy.pos, 0, world.obstacles)) {
    enemy.pos = before;
    return 'obstacle';
  }
  if (octagonalDistance(enemy.pos, world.player.pos) < TANK_TANK_RADIUS) {
    enemy.pos = before;
    return 'player';
  }
  return null;
}

/**
 * Backing out of a collision: reverse and swing, with no collision test at all -
 * which is exactly how the original's tanks get themselves out of the obstacle
 * they are standing in (docs/reference/original-game.md section 2).
 */
function backOut(enemy: Enemy, brain: EnemyBrain, profile: TankProfile): void {
  enemy.heading = wrapAngle(
    enemy.heading + brain.retreatTurn * profile.pivotSteps * TURN_STEP_RADIANS,
  );
  const distance = -ENEMY_MOVE_STEPS * profile.speedMultiplier * MOVE_STEP_UNITS;
  enemy.pos = {
    x: wrapCoordinate(enemy.pos.x + distance * Math.sin(enemy.heading)),
    z: wrapCoordinate(enemy.pos.z + distance * Math.cos(enemy.heading)),
  };
}

/** One tick of a tank or supertank. */
export function updateTank(
  world: World,
  enemy: Enemy,
  rng: Rng,
  profile: TankProfile = TANK_PROFILE,
): GameEvent[] {
  const brain = enemyBrain(enemy);
  ageEnemy(brain);
  enemy.timer -= 1;

  if (enemy.state === 'retreat') {
    backOut(enemy, brain, profile);
    if (enemy.timer <= 0) wanderGoal(enemy, brain, rng, ENEMY_ACTION_NEW_GOAL);
    return [];
  }

  if (enemy.timer <= 0) decide(world, enemy, brain, rng);
  if (enemy.state === 'retreat') return [];

  const events: GameEvent[] = [];
  const error = wrapAngle(brain.goal - enemy.heading);

  if (Math.abs(error) > aimTolerance(world)) {
    // Badly off: pivot without moving, trying a shot between each step.
    for (let step = 0; step < profile.pivotSteps; step += 1) {
      turnTowards(enemy, brain.goal, 1);
      events.push(...tryFire(world, enemy, brain));
    }
    return events;
  }

  // Lined up: one fine turn step, a shot, and then close in - at double speed
  // when the turn brought it exactly onto the goal.
  const onGoal = turnTowards(enemy, brain.goal, ENEMY_FINE_TURN_STEPS);
  enemy.state = 'align';
  events.push(...tryFire(world, enemy, brain));

  if (octagonalDistance(enemy.pos, world.player.pos) >= profile.stopClosing) {
    const steps = (onGoal ? ENEMY_ON_GOAL_MOVE_STEPS : ENEMY_MOVE_STEPS) * profile.speedMultiplier;
    if (drive(world, enemy, steps) === 'obstacle') startRetreat(enemy, brain, rng);
  }

  return events;
}
