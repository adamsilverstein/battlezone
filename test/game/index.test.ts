/**
 * The simulation entry point.  This file deliberately imports `src/game` and
 * nothing from `src/game/enemies`, so the assertions below fail if the entry point
 * stops pulling the enemy systems in.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { createWorld, systems, updateWorld } from '../../src/game';
import type { GameEvent } from '../../src/game/types';
import { NEUTRAL_INPUT } from '../../src/input/types';

describe('src/game', () => {
  it('has the two enemy systems installed just by being imported', () => {
    expect(systems).toHaveLength(2);
    expect(systems.every((system) => typeof system === 'function')).toBe(true);
  });

  it('gives a world built through it an enemy to fight', () => {
    const world = createWorld(createRng(1));
    const events = updateWorld(world, NEUTRAL_INPUT, createRng(1));

    expect(events).toContainEqual<GameEvent>({ type: 'enemySpawned', kind: 'tank' });
    expect(world.enemies).toHaveLength(1);
  });
});
