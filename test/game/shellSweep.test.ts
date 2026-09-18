/**
 * A shell against a player who is driving.
 *
 * `updateWorld` moves the player before it flies the shells, so within a tick
 * the player is a fixed point as far as a shell is concerned - and the player's
 * whole tick of travel happens in one jump.  While that jump was shorter than
 * the shell's hit radius the two could not miss each other; once the player
 * drives further in a tick than the radius is wide, a shell aimed down the
 * middle of the path the player swept can arrive with the player already at the
 * far end of it and register nothing.
 *
 * These tests sweep every heading the player can drive off on, which is the
 * only way to catch it: the gap is at oblique angles, not head on.
 */

import { describe, expect, it } from 'vitest';
import { SHELL_STEP_UNITS } from '../../src/data/constants';
import { makeWorld, sticks } from './fixtures';
import { updateWorld } from '../../src/game/world';
import { createRng } from '../../src/engine/rng';
import { fireShell } from '../../src/game/shells';
// Registers the enemy shell-versus-player test into `shellTargets`.
import '../../src/game/enemies';

/** The headings on which a shell fired from behind fails to kill the player. */
function missHeadings(): number[] {
  const missed: number[] = [];
  for (let deg = 0; deg < 360; deg += 1) {
    const world = makeWorld();
    world.player.heading = (deg / 360) * Math.PI * 2;
    // Two sub-steps back and flying +Z: it crosses the ground the player is
    // about to drive across, whichever way they turn out of it.
    fireShell(world, 'enemy', { x: 0, z: -2 * SHELL_STEP_UNITS }, 0);
    updateWorld(world, sticks(1, 1), createRng(1));
    if (world.player.alive) missed.push(deg);
  }
  return missed;
}

describe('an enemy shell against a player driving at full speed', () => {
  it('cannot be escaped by driving out of its way inside a single tick', () => {
    expect(missHeadings()).toEqual([]);
  });
});
