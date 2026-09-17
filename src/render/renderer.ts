/**
 * Composes a frame for a `GameState`: the backdrop, the battlefield, the HUD and,
 * while the player is dead, the shattered windshield over the lot.
 *
 * Interpolation lives here and nowhere else.  The simulation runs at 15.625 Hz
 * and stores no render state, so the renderer keeps its own snapshot of the
 * previous two ticks and blends them by `alpha`, the fraction of the pending tick
 * the loop reports (design spec 4).  Mid-tick frames therefore move smoothly
 * without the world ever knowing.
 *
 * The snapshot covers the player transform and every drawable entity, keyed by
 * identity so that a blend is only ever between two states of the same thing.
 * Enemies and shells have ids; debris does not, so pieces are keyed by their slot
 * and model - good enough for a visual smoothing, and a piece that changes slot
 * mid-flight simply snaps for one tick.  Everything snaps rather than blending
 * when the ticks are not consecutive, when a world is replaced outright, or when
 * an entity is new, since there is nothing truthful to blend from.
 */

import { CRACK_GROUPS, EYE_HEIGHT_UNITS } from '../data/constants';
import type { Debris, Enemy, GameState, Shell, World } from '../game/types';
import { clamp, lerp, wrapAngle } from '../engine/math';
import type { Camera } from './camera';
import { drawCrack } from './crack';
import { drawHud } from './hud';
import { drawWorldObjects } from './objects';
import { drawHorizon } from './scene';
import type { VectorDisplay } from './vectorDisplay';

/** Where something was at the end of a tick: ground position, height and yaw. */
interface Transform {
  x: number;
  z: number;
  y: number;
  heading: number;
}

interface Snapshot {
  camera: Transform;
  entities: Map<string, Transform>;
}

const transformOf = (pos: { x: number; z: number }, y: number, heading: number): Transform => ({
  x: pos.x,
  z: pos.z,
  y,
  heading,
});

const enemyKey = (unit: Enemy): string => `enemy:${unit.id}`;
const shellKey = (shell: Shell): string => `shell:${shell.id}`;
const debrisKey = (piece: Debris, slot: number): string => `debris:${slot}:${piece.model}`;

function snapshotOf(world: World): Snapshot {
  const entities = new Map<string, Transform>();
  for (const unit of world.enemies) {
    entities.set(enemyKey(unit), transformOf(unit.pos, unit.y, unit.heading));
  }
  for (const shell of world.shells) {
    entities.set(shellKey(shell), transformOf(shell.pos, shell.y, shell.heading));
  }
  world.debris.forEach((piece, slot) => {
    entities.set(debrisKey(piece, slot), transformOf(piece.pos, piece.y, piece.rot.y));
  });
  return {
    camera: transformOf(world.player.pos, EYE_HEIGHT_UNITS, world.player.heading),
    entities,
  };
}

/** Blends two transforms, taking the short way round the heading wrap. */
function blend(from: Transform, to: Transform, alpha: number): Transform {
  return {
    x: lerp(from.x, to.x, alpha),
    z: lerp(from.z, to.z, alpha),
    y: lerp(from.y, to.y, alpha),
    heading: from.heading + wrapAngle(to.heading - from.heading) * alpha,
  };
}

/**
 * `CRACK` is 2 on the tick the player is hit and grows by `CRACK_STEP_PER_TICK`,
 * and `WNSHLD` draws `CRACK / 2` groups capped at `CRACK_GROUPS` - so one group is
 * already up when the phase starts and one more arrives per tick, then the view
 * holds (until `CRACK_HOLD_UNTIL`, which is the state machine's business).
 */
function crackProgress(phaseTicks: number): number {
  return clamp(phaseTicks / CRACK_GROUPS, 0, 1);
}

export function createRenderer(d: VectorDisplay): {
  render(state: GameState, alpha: number): void;
} {
  // NaN so the first render always takes the "new tick" path and seeds both ends,
  // which is why this placeholder is never actually drawn from.
  let lastTick = Number.NaN;
  let previous: Snapshot = {
    camera: { x: 0, z: 0, y: EYE_HEIGHT_UNITS, heading: 0 },
    entities: new Map(),
  };
  let current: Snapshot = previous;

  return {
    render(state: GameState, alpha: number): void {
      const { world } = state;
      const { tick } = world;
      if (tick !== lastTick) {
        const snapshot = snapshotOf(world);
        // Only consecutive ticks are worth blending. When the loop catches up
        // several ticks before a render, or the world is replaced outright, the
        // held snapshot is stale and interpolating from it would rewind
        // everything; snap to the new state instead.
        previous = tick === lastTick + 1 ? current : snapshot;
        current = snapshot;
        lastTick = tick;
      }

      /** An entity's transform this frame: blended if it was here last tick. */
      const at = (key: string, now: Transform): Transform => {
        const before = previous.entities.get(key);
        return before ? blend(before, now, alpha) : now;
      };

      const camera = blend(previous.camera, current.camera, alpha);
      const cam: Camera = {
        pos: { x: camera.x, z: camera.z },
        heading: camera.heading,
        eyeHeight: EYE_HEIGHT_UNITS,
      };

      // A shallow copy of the world with every moving thing where it should be
      // mid-tick. Nothing here is written back: the simulation owns the truth.
      const view: World = {
        ...world,
        enemies: world.enemies.map((unit) => {
          const t = at(enemyKey(unit), transformOf(unit.pos, unit.y, unit.heading));
          return { ...unit, pos: { x: t.x, z: t.z }, y: t.y, heading: t.heading };
        }),
        shells: world.shells.map((shell) => {
          const t = at(shellKey(shell), transformOf(shell.pos, shell.y, shell.heading));
          return { ...shell, pos: { x: t.x, z: t.z }, y: t.y, heading: t.heading };
        }),
        debris: world.debris.map((piece, slot) => {
          const t = at(debrisKey(piece, slot), transformOf(piece.pos, piece.y, piece.rot.y));
          return { ...piece, pos: { x: t.x, z: t.z }, y: t.y, rot: { ...piece.rot, y: t.heading } };
        }),
      };

      d.beginFrame();
      drawHorizon(d, cam, tick);
      drawWorldObjects(d, cam, view);
      drawHud(d, view, {
        // The ROM draws no gunsight behind the attract logo; everything else
        // keeps it (BZONE.MAC.txt:961-965).
        showReticle: state.phase !== 'attractTitle',
        blinkTick: tick,
        // The table is not guaranteed to be sorted, so take the best of it, and
        // of the score in hand once the player has passed it.
        highScore: Math.max(...state.highScores.map((entry) => entry.score), world.score),
      });
      if (state.phase === 'playerDead') drawCrack(d, crackProgress(state.phaseTicks));
      d.endFrame();
    },
  };
}
