import { describe, expect, it } from 'vitest';
import type { FakeAudioContext } from './fakeAudioContext';
import { createAudioSystem } from '../../src/audio/audioSystem';
import { LOUD_EXPLOSION_SECONDS, SOFT_EXPLOSION_SECONDS } from '../../src/audio/sounds/explosion';
import {
  PLAYING,
  gains,
  harness,
  oscillators,
  sourceDurations,
  unlocked,
} from './audioSystemHarness';

describe('before unlock', () => {
  it('is inert: no context is created and nothing throws', () => {
    const { fake, audio, factoryCalls } = harness();

    audio.handle({ type: 'playerFired' });
    audio.update(PLAYING);
    audio.setMuted(true);
    audio.setMuted(false);

    expect(factoryCalls()).toBe(0);
    expect(fake.nodes.filter((node) => node.kind !== 'destination')).toHaveLength(0);
  });
});

describe('unlock', () => {
  it('creates one context, a master gain into the destination, and resumes', async () => {
    const { fake, audio, factoryCalls } = await unlocked();

    expect(factoryCalls()).toBe(1);
    expect(fake.resumeCalls).toBe(1);
    expect(fake.state).toBe('running');
    const master = gains(fake)[0];
    expect(master?.outputs).toEqual([fake.destination]);
    expect(master?.gain.value).toBeGreaterThan(0);

    await audio.unlock();
    expect(factoryCalls()).toBe(1);
  });

  it('stays silent when the context cannot be created', async () => {
    const audio = createAudioSystem(() => {
      throw new Error('no audio here');
    });
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(() => audio.handle({ type: 'playerFired' })).not.toThrow();
  });
});

describe('one-shot events', () => {
  it('fires the cannon loud for the player and soft for the enemy', async () => {
    const loud = await unlocked();
    loud.audio.handle({ type: 'playerFired' });
    const soft = await unlocked();
    soft.audio.handle({ type: 'enemyFired' });

    const peak = (fake: FakeAudioContext): number =>
      Math.max(...gains(fake).flatMap((gain) => gain.gain.changes.map((change) => change.value)));
    expect(peak(loud.fake)).toBeGreaterThan(peak(soft.fake));
    expect(loud.fake.nodesOfKind('bufferSource')).toHaveLength(1);
  });

  it('keeps one voice per sound circuit when events repeat', async () => {
    const { fake, audio } = await unlocked();

    for (let i = 0; i < 20; i += 1) audio.handle({ type: 'playerFired' });

    // Every earlier shot is cut off, exactly as one discrete circuit would be.
    expect(fake.activeSources(0)).toHaveLength(1);
  });

  it('plays a soft explosion for an obstacle hit and a loud one for a kill', async () => {
    const obstacle = await unlocked();
    obstacle.audio.handle({ type: 'shellHitObstacle' });
    expect(sourceDurations(obstacle.fake)).toEqual([SOFT_EXPLOSION_SECONDS]);

    const kill = await unlocked();
    kill.audio.handle({ type: 'enemyDestroyed', kind: 'tank', points: 1000 });
    expect(sourceDurations(kill.fake)).toEqual([LOUD_EXPLOSION_SECONDS]);
  });

  it('chirps instead of exploding when the saucer is hit', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'enemyDestroyed', kind: 'saucer', points: 5000 });

    expect(oscillators(fake)).toHaveLength(1);
    expect(fake.nodesOfKind('bufferSource')).toHaveLength(0);
  });

  it('silences the missile buzz when the missile kills the player', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, missileActive: true, missileDistance: 4000 });
    const buzzSources = fake.activeSources(0).length;
    expect(buzzSources).toBeGreaterThan(0);

    fake.advance(1);
    audio.handle({ type: 'playerDestroyed', by: 'missile' });

    const buzzOscillators = oscillators(fake).filter((osc) => osc.type === 'square');
    expect(buzzOscillators).toHaveLength(2);
    expect(buzzOscillators.every((osc) => osc.stopTime !== null)).toBe(true);
    expect(sourceDurations(fake)).toContain(LOUD_EXPLOSION_SECONDS);
  });

  it('plays the three-boop alert as an enemy comes into range', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'enemyInRange' });

    const [osc] = oscillators(fake);
    expect(osc?.frequency.scheduledValues()).toHaveLength(72);
  });

  it('plays four beeps for an extra life', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'extraLife' });

    const beeps = gains(fake).flatMap((gain) => gain.gain.scheduledValues().filter((v) => v > 0));
    expect(beeps).toHaveLength(4);
  });

  it('warbles then merps when the tank is blocked, without machine-gunning', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'motionBlocked' });

    const afterFirst = oscillators(fake).length;
    // The warble on channel 1 plus the merp queued behind it on channel 2.
    expect(afterFirst).toBe(1);
    const merp = fake.nodesOfKind('bufferSource')[0];
    expect(merp?.kind).toBe('bufferSource');

    // Still grinding against the block on the next tick: no retrigger.
    fake.advance(0.064);
    audio.handle({ type: 'motionBlocked' });
    expect(oscillators(fake)).toHaveLength(afterFirst);

    // Once the warble has finished, a fresh collision sounds again.
    fake.advance(1);
    audio.handle({ type: 'motionBlocked' });
    expect(oscillators(fake).length).toBeGreaterThan(afterFirst);
  });

  it('pings the radar when the world refreshes a blip', async () => {
    const { fake, audio } = await unlocked();

    audio.handle({ type: 'radarPing' });
    const [ping] = oscillators(fake);
    expect(ping?.frequency.scheduledValues()).toHaveLength(1);
    expect(ping?.stopTime).toBeCloseTo(16 / 250, 9);

    // Every refresh pings again, and the alert shares the channel, so a ping
    // cuts the boops off exactly as the original does.
    audio.handle({ type: 'enemyInRange' });
    fake.advance(0.05);
    audio.handle({ type: 'radarPing' });
    const alert = oscillators(fake).find((osc) => osc.frequency.changes.length === 72);
    expect(alert?.stopTime).toBe(0.05);
    expect(oscillators(fake)).toHaveLength(3);
  });

  it('plays the fanfare on both channels at 100K and high-score entry', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'fanfare' });

    const voices = oscillators(fake);
    expect(voices).toHaveLength(2);
    expect(voices.map((osc) => osc.frequency.scheduledValues().length)).toEqual([13, 13]);

    // It holds channels 1 and 2, so the next channel-2 sound cuts it off.
    fake.advance(0.1);
    audio.handle({ type: 'radarPing' });
    expect(voices.every((osc) => osc.stopTime === 0.1)).toBe(true);
  });

  it('stays silent for events the original has no sound for', async () => {
    const { fake, audio } = await unlocked();
    const before = fake.nodes.length;

    audio.handle({ type: 'shellExpired' });
    audio.handle({ type: 'enemySpawned', kind: 'tank' });
    audio.handle({ type: 'saucerAppeared' });
    audio.handle({ type: 'saucerLeft' });

    expect(fake.nodes.length).toBe(before);
  });
});
