/**
 * Composes a frame for a `GameState`.  Later tasks add the world objects and the
 * HUD; for now it is the backdrop seen from the player's camera.
 *
 * Interpolation lives here and nowhere else.  The simulation runs at 15.625 Hz
 * and stores no render state, so the renderer keeps its own snapshot of the
 * player transform from the previous two ticks and blends them by `alpha`, the
 * fraction of the pending tick the loop reports (design spec 4).  Mid-tick frames
 * therefore move the camera smoothly without the world ever knowing.
 */

import { EYE_HEIGHT_UNITS } from '../data/constants';
import type { GameState } from '../game/types';
import { lerp, wrapAngle } from '../engine/math';
import type { Camera } from './camera';
import { drawHorizon } from './scene';
import type { VectorDisplay } from './vectorDisplay';

interface CameraSnapshot {
  x: number;
  z: number;
  heading: number;
}

export function createRenderer(d: VectorDisplay): {
  render(state: GameState, alpha: number): void;
} {
  // NaN so the first render always takes the "new tick" path and seeds both ends.
  let lastTick = Number.NaN;
  let previous: CameraSnapshot = { x: 0, z: 0, heading: 0 };
  let current: CameraSnapshot = previous;

  return {
    render(state: GameState, alpha: number): void {
      const { player, tick } = state.world;
      if (tick !== lastTick) {
        const snapshot = { x: player.pos.x, z: player.pos.z, heading: player.heading };
        // Only consecutive ticks are worth blending. When the loop catches up
        // several ticks before a render, or the world is replaced outright, the
        // held snapshot is stale and interpolating from it would rewind the
        // camera; snap to the new state instead.
        previous = tick === lastTick + 1 ? current : snapshot;
        current = snapshot;
        lastTick = tick;
      }

      const cam: Camera = {
        pos: {
          x: lerp(previous.x, current.x, alpha),
          z: lerp(previous.z, current.z, alpha),
        },
        // Take the short way round so a wrap does not spin the view.
        heading: previous.heading + wrapAngle(current.heading - previous.heading) * alpha,
        eyeHeight: EYE_HEIGHT_UNITS,
      };

      d.beginFrame();
      drawHorizon(d, cam, tick);
      d.endFrame();
    },
  };
}
