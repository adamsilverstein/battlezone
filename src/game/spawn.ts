/**
 * Who arrives next, and where from.
 *
 * THE ONE-UNIT RULE
 * -----------------
 * There is exactly one hostile unit on the battlefield at all times - a tank, a
 * supertank, a missile, or the chunks of the one that just died - and never two or
 * none (docs/reference/original-game.md section 2).  The saucer is independent of
 * all this and lives in `enemies/saucer.ts`.  `spawnExplosion` books the tick the
 * dead unit's highest chunk lands on, and this places the replacement on exactly
 * that tick, which is what gives the original its gapless stream of enemies.
 *
 * THE LADDER
 * ----------
 * `ROBCHK` / `TANKCK` / `R2D3CK` / `TR7CHK` (BZONE.MAC.txt:7315-7481), which
 * `docs/reference/original-game.md` section 3 sets out as:
 *
 * 1. slow tanks only, until the score reaches the DIP missile threshold;
 * 2. from then on a coin flip between a missile and a tank;
 * 3. supertanks replace slow tanks once five missiles have been launched - the
 *    count, not the score, is what the ROM tests;
 * 4. a missile that flies out of radar range and stays there is replaced;
 * 5. a tank the player has evaded for a very long time is replaced by a missile;
 * 6. after a missile kill, and while the player is dead, the next unit is a tank.
 *
 * WHERE FROM
 * ----------
 * `ROB1` (BZONE.MAC.txt:7483-7641) offsets the arrival from the player's own
 * heading by a random amount masked by the aggression ladder's window - narrow and
 * in front while the enemy is winning, anywhere at all once the player is well
 * ahead - and puts it at 3/4 of full scale, or half that for a tank on a coin
 * flip.  Missiles are always released far out and always close to the player's
 * facing.  Nothing checks the obstacles, so an arrival can be standing inside a
 * pyramid; that is the original's behaviour, and it backs itself out.
 */

import {
  DEFAULT_OPTIONS,
  ENEMY_RESPAWN_TIMOUT,
  ENEMY_SPAWN_ANGLE_MASK,
  ENEMY_SPAWN_ANGLE_MASKS,
  ENEMY_SPAWN_FAR_UNITS,
  ENEMY_SPAWN_NEAR_UNITS,
  MISSILE_START_HEIGHT,
  MISSILE_TIMEOUT_TIMOUT,
  SUPERTANK_AFTER_MISSILES,
  SUPERTANK_COUNTER_MAX,
  SUPERTANK_COUNTER_START,
  TANGLE_UNIT_RADIANS,
  TICKS_PER_TIMOUT,
} from '../data/constants';
import { wrapAngle } from '../engine/math';
import { wrapCoordinate } from './collision';
import { aggressionTier } from './enemies/tank';
import type { Enemy, EnemyKind, GameEvent, Rng, World } from './types';
import { enemyBrain, internalState, type EnemyBrain } from './worldState';

/** How long a unit may be ignored before the game changes its tactics. */
const STALL_TICKS = MISSILE_TIMEOUT_TIMOUT * TICKS_PER_TIMOUT;

/** The living tank, supertank or missile, or null while the field is clear. */
function liveUnit(world: World): Enemy | null {
  return world.enemies.find((enemy) => enemy.alive && enemy.kind !== 'saucer') ?? null;
}

/** Whether it is time to give up on this unit and send a different one. */
function hasGivenUp(unit: Enemy, brain: EnemyBrain): boolean {
  if (unit.kind === 'missile') return brain.outOfRangeTicks >= STALL_TICKS;
  // A tank the player has simply avoided for the best part of a minute.
  return brain.aliveTicks >= STALL_TICKS;
}

/**
 * Which tank the ladder is up to.  `GetTankType` reads an 8-bit counter that starts
 * at `$FF` and is incremented on every missile launch, and sends supertanks while it
 * reads 5 to 127 inclusive - so the first supertank arrives after the *sixth*
 * missile, and 123 missiles later the slow tanks come back
 * (docs/reference/original-game.md section 3, "Enemy selection ladder").
 */
function tankKind(world: World): EnemyKind {
  const counter = (SUPERTANK_COUNTER_START + internalState(world).missilesLaunched) & 0xff;
  return counter >= SUPERTANK_AFTER_MISSILES && counter <= SUPERTANK_COUNTER_MAX
    ? 'supertank'
    : 'tank';
}

/** What arrives next. */
function nextKind(world: World, rng: Rng): EnemyKind {
  const state = internalState(world);
  const forced = state.nextUnitOverride;
  if (forced !== null) {
    state.nextUnitOverride = null;
    return forced === 'missile' ? 'missile' : tankKind(world);
  }
  const missilesAllowed = world.score >= DEFAULT_OPTIONS.missileThreshold;
  return missilesAllowed && rng.int(2) === 0 ? 'missile' : tankKind(world);
}

/** Places one unit, facing the player, and says what it is. */
function place(world: World, rng: Rng): GameEvent[] {
  const state = internalState(world);
  const kind = nextKind(world, rng);
  const missile = kind === 'missile';

  // Missiles keep to the tight window in front of the player; tanks get the
  // window the ladder has opened up.
  const window = missile ? ENEMY_SPAWN_ANGLE_MASK : ENEMY_SPAWN_ANGLE_MASKS[aggressionTier(world)];
  const offset = rng.int(window + 1) * (rng.int(2) === 0 ? 1 : -1);
  const bearing = wrapAngle(world.player.heading + offset * TANGLE_UNIT_RADIANS);
  const far = missile || rng.int(2) === 0;
  const distance = far ? ENEMY_SPAWN_FAR_UNITS : ENEMY_SPAWN_NEAR_UNITS;

  const enemy: Enemy = {
    id: state.nextEnemyId,
    kind,
    pos: {
      x: wrapCoordinate(world.player.pos.x + distance * Math.sin(bearing)),
      z: wrapCoordinate(world.player.pos.z + distance * Math.cos(bearing)),
    },
    // Looking back down its own bearing, at the player.
    heading: wrapAngle(bearing + Math.PI),
    y: missile ? MISSILE_START_HEIGHT : 0,
    alive: true,
    state: missile ? 'swoop' : 'approach',
    // `ACTION` = 1, so a tank makes its first decision on the very next tick.
    timer: ENEMY_RESPAWN_TIMOUT,
  };
  state.nextEnemyId += 1;
  world.enemies.push(enemy);
  enemyBrain(enemy).goal = enemy.heading;
  // `ROB1` resets `EIRNGE` along with `FTIMER`, so the warning re-arms for the new
  // arrival even when the one it replaced was in range on this very tick
  // (BZONE.MAC.txt:7483-7641, 7989-8015).
  world.enemyInRange = false;

  const events: GameEvent[] = [{ type: 'enemySpawned', kind }];
  if (missile) {
    state.missilesLaunched += 1;
    events.push({ type: 'missileLaunched' });
  }
  return events;
}

/** One tick of the spawner: keep exactly one unit on the field. */
export function updateSpawner(world: World, rng: Rng): GameEvent[] {
  const state = internalState(world);
  const unit = liveUnit(world);

  if (unit) {
    if (!hasGivenUp(unit, enemyBrain(unit))) return [];
    // Withdrawn rather than destroyed: no debris, no score, and the ROM sends a
    // tank after an evaded missile (BZONE.MAC.txt:7869-7885).
    world.enemies = world.enemies.filter((enemy) => enemy !== unit);
    // An evaded missile is replaced by a tank; a tank the player has been dodging
    // for the best part of a minute is answered with a missile.
    state.nextUnitOverride = unit.kind === 'missile' ? 'tank' : 'missile';
    state.nextUnitAt = world.tick;
  }

  // While the player is dead the death sequence owns the field.
  if (!world.player.alive) return [];
  // And the replacement waits for the last chunk of the previous unit to land.
  if (world.tick < state.nextUnitAt) return [];

  return place(world, rng);
}
