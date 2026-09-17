/**
 * A long game, played through the strict fake context.
 *
 * The fake throws on everything a real browser throws on - a non-finite value, a
 * negative time, an exponential ramp to zero, a buffer offset past the end of the
 * buffer, a source started twice - so this is the regression guard for the class
 * of bug that poisons the Web Audio renderer mid-game. The audio system swallows
 * its own exceptions so a bad frame can never break the game loop, which means a
 * scheduling bug would otherwise be silent; here the fake's throws are asserted
 * on directly instead.
 */

import { describe, expect, it } from 'vitest';
import { createAudioSystem } from '../../src/audio/audioSystem';
import { asAudioContext, FakeAudioContext } from './fakeAudioContext';
import type { AudioSnapshot, GameEvent } from '../../src/game/types';

const TICK_SECONDS = 1 / 15.625;
/** Long enough to cover a full game: 60 s at the simulation's 15.625 Hz. */
const TICKS = Math.round(60 / TICK_SECONDS);

/** Every event the world can report, in the order a game tends to produce them. */
const EVENTS: readonly GameEvent[] = [
  { type: 'playerFired' },
  { type: 'enemyFired' },
  { type: 'shellHitObstacle', owner: 'player', pos: { x: 0, z: 0 } },
  { type: 'shellExpired', owner: 'enemy', pos: { x: 0, z: 0 } },
  { type: 'enemySpawned', kind: 'tank' },
  { type: 'enemyInRange' },
  { type: 'radarPing' },
  { type: 'motionBlocked' },
  { type: 'enemyDestroyed', kind: 'tank', points: 1000 },
  { type: 'enemyDestroyed', kind: 'saucer', points: 5000 },
  { type: 'saucerAppeared' },
  { type: 'saucerLeft' },
  { type: 'missileLaunched' },
  { type: 'extraLife' },
  { type: 'fanfare' },
  { type: 'playerDestroyed', by: 'missile' },
];

/**
 * A snapshot that sweeps the missile in from its spawn distance to zero and out
 * again, so `buzzVolume` is exercised across its whole range and at its ends.
 */
function snapshotFor(tick: number): AudioSnapshot {
  const missileActive = tick % 120 >= 20 && tick % 120 < 90;
  return {
    engineRunning: tick % 200 !== 0,
    moving: tick % 7 < 3,
    enemyInRange: tick % 31 === 0,
    missileActive,
    saucerActive: tick % 90 < 40,
    missileDistance: missileActive ? Math.max(0, 0x5fff - (tick % 120) * 400) : null,
  };
}

describe('a full game through the strict fake context', () => {
  it('never schedules a value or a time a real browser would refuse', async () => {
    const fake = new FakeAudioContext();
    const audio = createAudioSystem(() => asAudioContext(fake));
    expect(await audio.unlock()).toBe(true);

    for (let tick = 0; tick < TICKS; tick += 1) {
      // The event mix walks the whole catalogue, and the rarer sounds - the
      // fanfare, the extra life, a death - come round often enough to overlap
      // the ones that share their channel.
      const event = EVENTS[tick % EVENTS.length];
      if (event) audio.handle(event);
      if (tick % 3 === 0) audio.handle({ type: 'radarPing' });
      if (tick % 5 === 0) audio.handle({ type: 'playerFired' });
      // Grinding along a wall reports a block every single tick.
      if (tick % 40 < 8) audio.handle({ type: 'motionBlocked' });
      audio.update(snapshotFor(tick));
      // Attract mode's hard mute, on and off, over the top of everything.
      if (tick % 150 === 0) audio.setMuted(true);
      if (tick % 150 === 10) audio.setMuted(false);
      fake.advance(TICK_SECONDS);
    }

    // The audio system catches its own exceptions, so the throw is not what
    // proves the point: the context's record of what it refused is.
    expect(fake.violations).toEqual([]);

    // These only prove the run was a real workout rather than a no-op.
    const sources = fake.sources();
    expect(sources.length).toBeGreaterThan(200);
    for (const source of sources) {
      expect(source.startTime).not.toBeNull();
      expect(Number.isFinite(source.startTime as number)).toBe(true);
      if (source.stopTime !== null) expect(source.stopTime).toBeGreaterThanOrEqual(0);
    }
  });
});
