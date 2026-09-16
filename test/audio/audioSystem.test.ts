import { describe, expect, it } from 'vitest';
import {
  FakeAudioContext,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
} from './fakeAudioContext';
import { createAudioSystem, type AudioSystem } from '../../src/audio/audioSystem';
import type { AudioSnapshot } from '../../src/game/types';
import { LOUD_EXPLOSION_SECONDS, SOFT_EXPLOSION_SECONDS } from '../../src/audio/sounds/explosion';

const SILENT: AudioSnapshot = {
  engineRunning: false,
  moving: false,
  enemyInRange: false,
  missileActive: false,
  saucerActive: false,
};

const PLAYING: AudioSnapshot = { ...SILENT, engineRunning: true };

interface Harness {
  fake: FakeAudioContext;
  audio: AudioSystem;
  factoryCalls: () => number;
}

function harness(): Harness {
  const fake = new FakeAudioContext();
  let calls = 0;
  const audio = createAudioSystem(() => {
    calls += 1;
    return asAudioContext(fake);
  });
  return { fake, audio, factoryCalls: () => calls };
}

async function unlocked(): Promise<Harness> {
  const h = harness();
  await h.audio.unlock();
  return h;
}

function oscillators(fake: FakeAudioContext): FakeOscillatorNode[] {
  return fake.nodes.filter((node): node is FakeOscillatorNode => {
    return node instanceof FakeOscillatorNode;
  });
}

/** Longest voice duration scheduled on any gain, used to tell loud from soft. */
function sourceDurations(fake: FakeAudioContext): number[] {
  return fake
    .sources()
    .filter((source) => source.startTime !== null && source.stopTime !== null)
    .map((source) => (source.stopTime as number) - (source.startTime as number));
}

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
    const master = fake.nodes.find((node): node is FakeGainNode => node instanceof FakeGainNode);
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
      Math.max(
        ...fake.nodes
          .filter((node): node is FakeGainNode => node instanceof FakeGainNode)
          .flatMap((gain) => gain.gain.changes.map((change) => change.value)),
      );
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
    audio.update({ ...PLAYING, missileActive: true });
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

    const gains = fake.nodes.filter((node): node is FakeGainNode => node instanceof FakeGainNode);
    const beeps = gains.flatMap((gain) => gain.gain.scheduledValues().filter((v) => v > 0));
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

describe('continuous sounds', () => {
  it('runs the engine only while a game is being played', async () => {
    const { fake, audio } = await unlocked();

    audio.update(PLAYING);
    const running = fake.activeSources(0).length;
    expect(running).toBe(3);

    audio.update(PLAYING);
    expect(fake.activeSources(0)).toHaveLength(running);

    fake.advance(1);
    audio.update(SILENT);
    expect(fake.activeSources(1)).toHaveLength(0);
  });

  it('revs the engine up when the treads engage and back down at rest', async () => {
    const { fake, audio } = await unlocked();
    audio.update(PLAYING);
    const [low] = oscillators(fake);
    const idle = low?.frequency.value as number;

    fake.advance(0.064);
    audio.update({ ...PLAYING, moving: true });
    expect(low?.frequency.changes.at(-1)?.value).toBeGreaterThan(idle);

    fake.advance(0.064);
    audio.update(PLAYING);
    expect(low?.frequency.changes.at(-1)?.value).toBeCloseTo(idle, 6);
  });

  it('pings once per radar sweep while an enemy is in range', async () => {
    const { fake, audio } = await unlocked();
    const inRange = { ...PLAYING, enemyInRange: true };

    audio.update(inRange);
    const afterFirst = oscillators(fake).length;

    fake.advance(0.5);
    audio.update(inRange);
    expect(oscillators(fake)).toHaveLength(afterFirst);

    // One revolution is 23 game frames at 15.625 Hz.
    fake.advance(23 / 15.625);
    audio.update(inRange);
    expect(oscillators(fake).length).toBe(afterFirst + 1);

    // Out of range, then back in: the next ping is immediate.
    fake.advance(0.1);
    audio.update(PLAYING);
    audio.update(inRange);
    expect(oscillators(fake).length).toBe(afterFirst + 2);
  });

  it('buzzes while a missile is alive and stops when it is gone', async () => {
    const { fake, audio } = await unlocked();

    audio.update({ ...PLAYING, missileActive: true });
    // Two square oscillators for the buzz, on top of the engine's sawtooths.
    const buzz = oscillators(fake).filter((osc) => osc.type === 'square');
    expect(buzz).toHaveLength(2);

    fake.advance(1);
    audio.update({ ...PLAYING, missileActive: true });
    expect(oscillators(fake).filter((osc) => osc.type === 'square')).toHaveLength(2);

    audio.update(PLAYING);
    expect(buzz.every((osc) => osc.stopTime !== null)).toBe(true);
  });

  it('hovers while a saucer is alive and pauses for channel-1 effects', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, saucerActive: true });

    // A square carrier plus its triangle LFO, on top of the engine's sawtooths.
    const hover = oscillators(fake).filter((osc) => osc.type !== 'sawtooth');
    expect(hover.map((osc) => osc.type)).toEqual(['square', 'triangle']);
    const output = fake.nodes.find(
      (node): node is FakeGainNode => node instanceof FakeGainNode && node.gain.value > 0,
    );
    expect(output).toBeDefined();

    // Ramming a block takes channel 1, so the siren drops out and comes back.
    fake.advance(1);
    audio.handle({ type: 'motionBlocked' });
    const suppressions = fake.nodes
      .filter((node): node is FakeGainNode => node instanceof FakeGainNode)
      .flatMap((gain) => gain.gain.changes)
      .filter((change) => change.time === 1 && change.value === 0);
    expect(suppressions).toHaveLength(1);

    audio.update(PLAYING);
    expect(hover.every((osc) => osc.stopTime !== null)).toBe(true);
  });
});

describe('muting', () => {
  it('drops the master gain, stops everything and recovers', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, saucerActive: true, missileActive: true });
    expect(fake.activeSources(0).length).toBeGreaterThan(0);

    fake.advance(1);
    audio.setMuted(true);
    const master = fake.nodes.find((node): node is FakeGainNode => node instanceof FakeGainNode);
    expect(master?.gain.value).toBe(0);
    expect(fake.activeSources(1)).toHaveLength(0);

    // Muted means silent, whatever happens in the game.
    const before = fake.nodes.length;
    audio.handle({ type: 'playerFired' });
    audio.update(PLAYING);
    expect(fake.nodes.length).toBe(before);

    audio.setMuted(false);
    expect(master?.gain.value).toBeGreaterThan(0);
    audio.update(PLAYING);
    expect(fake.activeSources(1).length).toBeGreaterThan(0);
  });
});

describe('a closed context', () => {
  it('never throws', async () => {
    const { fake, audio } = await unlocked();
    audio.update(PLAYING);
    await fake.close();

    expect(() => {
      audio.handle({ type: 'playerFired' });
      audio.handle({ type: 'motionBlocked' });
      audio.update({ ...PLAYING, enemyInRange: true, missileActive: true, saucerActive: true });
      audio.update(SILENT);
      audio.setMuted(true);
    }).not.toThrow();
    await expect(audio.unlock()).resolves.toBeUndefined();
  });
});
