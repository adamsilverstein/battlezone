/**
 * The little bit of per-world bookkeeping the shared `World` type has no room
 * for.
 *
 * `game/types.ts` is the contract between the simulation, the renderer and the
 * audio system, and it deliberately describes only what those three need to see.
 * Two things the simulation needs are not in it: whether the player was already
 * grinding against an obstacle last tick (so "MOTION BLOCKED" is reported once
 * per contact, as the ROM plays `BOING` once) and the next shell id.  They live
 * here, in a `WeakMap` keyed on the world, so the contract stays as published and
 * the state still disappears with the world it belongs to.
 */

import type { World } from './types';

interface InternalState {
  /** True while the player's move is being backed out every tick. */
  playerBlocked: boolean;
  /** Next `Shell.id`; ids are per-world so two worlds stay comparable. */
  nextShellId: number;
}

const states = new WeakMap<World, InternalState>();

/** The world's private state, created on first use. */
export function internalState(world: World): InternalState {
  const existing = states.get(world);
  if (existing) return existing;
  const fresh: InternalState = { playerBlocked: false, nextShellId: 1 };
  states.set(world, fresh);
  return fresh;
}
