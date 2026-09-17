import { describe, expect, it } from 'vitest';
import { FakeAudioContext, asAudioContext, type FakeScheduledSource } from './fakeAudioContext';
import {
  createAudioSystem,
  MAX_DEVICE_RECOVERIES,
  MIN_WORKING_SECONDS,
  type AudioSystem,
} from '../../src/audio/audioSystem';
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
    // The mix reaches the destination through the output stage, never around it.
    expect(master?.reaches(fake.destination)).toBe(true);
    expect(master?.gain.value).toBeGreaterThan(0);

    await audio.unlock();
    expect(factoryCalls()).toBe(1);
  });

  it('stays silent when the context cannot be created', async () => {
    const audio = createAudioSystem(() => {
      throw new Error('no audio here');
    });
    await expect(audio.unlock()).resolves.toBe(false);
    expect(() => audio.handle({ type: 'playerFired' })).not.toThrow();
  });

  it('reports whether the context is actually running, so a refused gesture shows', async () => {
    const fake = new FakeAudioContext();
    // A browser that will not resume yet: the page is hidden, or the gesture was
    // not one it accepts. The caller has to keep listening rather than give up.
    fake.resume = async (): Promise<void> => {};
    const audio = createAudioSystem(() => asAudioContext(fake));

    expect(await audio.unlock()).toBe(false);

    const real = new FakeAudioContext();
    const second = createAudioSystem(() => asAudioContext(real));
    expect(await second.unlock()).toBe(true);
  });
});

describe('a context the audio device kills', () => {
  /** Every node bar the destination the context was born with. */
  function graphSize(fake: FakeAudioContext): number {
    return fake.nodes.filter((node) => node.kind !== 'destination').length;
  }

  function playSomething(audio: { handle: AudioSystem['handle']; update: AudioSystem['update'] }) {
    audio.handle({ type: 'playerFired' });
    audio.handle({ type: 'radarPing' });
    audio.update({ ...PLAYING, saucerActive: true, missileActive: true, missileDistance: 5000 });
  }

  it('stops building into a context whose clock has stopped', async () => {
    const { fake, audio } = await unlocked();
    audio.update(PLAYING);
    const before = graphSize(fake);

    fake.failDevice();
    // The clock of a failed context never moves again, so everything scheduled
    // from here lands on one instant and is never rendered.
    for (let i = 0; i < 20; i += 1) playSomething(audio);

    expect(graphSize(fake)).toBe(before);
  });

  it('builds a fresh context on the next gesture, since a dead one never comes back', async () => {
    const { fake, fakes, audio, factoryCalls } = await unlocked();
    audio.update(PLAYING);
    // A device that was working and then went away: the clock had been running.
    fake.advance(MIN_WORKING_SECONDS + 10);
    fake.failDevice();

    expect(await audio.unlock()).toBe(true);
    expect(factoryCalls()).toBe(2);
    // The dead one is let go of rather than left holding its graph.
    expect(fake.closeCalls).toBe(1);

    const replacement = fakes[1] as FakeAudioContext;
    expect(replacement.state).toBe('running');
    playSomething(audio);
    expect(replacement.activeSources(0).length).toBeGreaterThan(0);
    // The engine belonged to the dead graph, so the new context gets its own.
    expect(replacement.violations).toEqual([]);
  });

  it('gives up once the replacements have been used, rather than asking forever', async () => {
    const { fakes, audio, factoryCalls } = await unlocked();
    audio.update(PLAYING);

    // A device that keeps dropping out after playing for a while.
    const die = (fake: FakeAudioContext): void => {
      fake.advance(MIN_WORKING_SECONDS + 10);
      fake.failDevice();
    };
    for (let i = 0; i < MAX_DEVICE_RECOVERIES; i += 1) {
      die(fakes[i] as FakeAudioContext);
      expect(await audio.unlock()).toBe(true);
    }
    expect(factoryCalls()).toBe(MAX_DEVICE_RECOVERIES + 1);

    die(fakes[MAX_DEVICE_RECOVERIES] as FakeAudioContext);
    expect(await audio.unlock()).toBe(false);
    expect(await audio.unlock()).toBe(false);
    expect(factoryCalls()).toBe(MAX_DEVICE_RECOVERIES + 1);
    expect(() => playSomething(audio)).not.toThrow();
  });

  it('does not replace a context that never rendered a sound in the first place', async () => {
    const { fake, audio, factoryCalls } = await unlocked();
    audio.update(PLAYING);

    // This is the machine with no working output device: the context reports
    // running, its clock never moves, and the browser gives up on it. Building
    // another only makes the browser log the same error again.
    fake.advance(MIN_WORKING_SECONDS / 2);
    fake.failDevice();

    expect(await audio.unlock()).toBe(false);
    expect(await audio.unlock()).toBe(false);
    expect(factoryCalls()).toBe(1);
  });

  it('stops muting into a dead context, however long the cabinet is left alone', async () => {
    const { fake, audio } = await unlocked();
    audio.update(PLAYING);
    const master = gains(fake)[0]!;
    fake.advance(MIN_WORKING_SECONDS + 4);
    fake.failDevice();
    const after = master.gain.changes.length;

    // Attract mode mutes and unmutes every cycle, and the clock of a dead
    // context never moves again, so every one of these would land on the same
    // instant and pile up there for as long as nobody touches the cabinet.
    for (let i = 0; i < 20; i += 1) {
      audio.setMuted(true);
      audio.setMuted(false);
    }

    expect(master.gain.changes.length).toBe(after);
  });

  it('remembers a mute asked for while the context was dead', async () => {
    const { fakes, audio } = await unlocked();
    const first = fakes[0] as FakeAudioContext;
    first.advance(MIN_WORKING_SECONDS + 4);
    first.failDevice();

    audio.setMuted(true);
    expect(await audio.unlock()).toBe(true);

    // The replacement is born at the gain the game last asked for, not at the
    // one the dead context happened to be holding.
    const replacement = fakes[1] as FakeAudioContext;
    expect(gains(replacement)[0]?.gain.value).toBe(0);
  });

  it('ignores a late error from a context it has already let go of', async () => {
    const { fakes, audio, factoryCalls } = await unlocked();
    const first = fakes[0] as FakeAudioContext;
    first.advance(MIN_WORKING_SECONDS + 10);
    first.failDevice();
    expect(await audio.unlock()).toBe(true);
    const replacement = fakes[1] as FakeAudioContext;

    // The listener goes with the graph rather than being removed, so the dead
    // context can still speak; its news is old, and acting on it would condemn
    // the replacement that is working.
    first.failDevice();

    playSomething(audio);
    expect(replacement.activeSources(0).length).toBeGreaterThan(0);
    expect(replacement.closeCalls).toBe(0);
    expect(factoryCalls()).toBe(2);
  });

  it('leaves a running context alone, however many gestures arrive', async () => {
    const { fake, audio, factoryCalls } = await unlocked();

    for (let i = 0; i < 50; i += 1) expect(await audio.unlock()).toBe(true);

    expect(factoryCalls()).toBe(1);
    expect(fake.resumeCalls).toBe(1);
    expect(fake.closeCalls).toBe(0);
  });
});

describe('setMuted', () => {
  it('ignores a repeat of the mute it is already in', async () => {
    const { fake, audio } = await unlocked();
    const master = gains(fake)[0]!;

    audio.setMuted(true);
    const afterFirst = master.gain.changes.length;
    audio.setMuted(true);
    audio.setMuted(true);

    // A repeated mute would start a fresh fade - and stop every voice again -
    // every tick it was asked for.
    expect(master.gain.changes.length).toBe(afterFirst);

    audio.setMuted(false);
    expect(master.gain.changes.length).toBeGreaterThan(afterFirst);
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
    obstacle.audio.handle({ type: 'shellHitObstacle', owner: 'player', pos: { x: 0, z: 0 } });
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

  it('keeps the merp on channel 1 with its warble', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'motionBlocked' });

    const merp = fake.nodesOfKind('bufferSource')[0];
    const merpEnd = merp?.kind === 'bufferSource' ? (merp as FakeScheduledSource).stopTime : null;
    expect(merpEnd).not.toBeNull();

    // Channel 2 traffic must not touch it.
    fake.advance(0.1);
    audio.handle({ type: 'radarPing' });
    audio.handle({ type: 'extraLife' });
    expect((merp as FakeScheduledSource).stopTime).toBe(merpEnd);

    // Channel 1 traffic does, because that is where it lives.
    fake.advance(0.1);
    audio.handle({ type: 'enemyDestroyed', kind: 'saucer', points: 5000 });
    expect((merp as FakeScheduledSource).stopTime).toBe(0.2);
  });

  it('booms once the fanfare finishes, as the original does at 100K', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'fanfare' });

    const fanfareEnd = (13 * 48) / 250;
    const boom = fake
      .sources()
      .find((source) => source.kind === 'bufferSource' && source.startTime === fanfareEnd);
    expect(boom).toBeDefined();
    expect((boom?.stopTime as number) - fanfareEnd).toBeCloseTo(LOUD_EXPLOSION_SECONDS, 9);
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

  it('lets a collision interrupt the fanfare on channel 1', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'fanfare' });
    const [channel1] = oscillators(fake);

    fake.advance(0.2);
    audio.handle({ type: 'motionBlocked' });
    expect(channel1?.stopTime).toBe(0.2);
  });

  it('stays silent for events the original has no sound for', async () => {
    const { fake, audio } = await unlocked();
    const before = fake.nodes.length;

    audio.handle({ type: 'shellExpired', owner: 'player', pos: { x: 0, z: 0 } });
    audio.handle({ type: 'enemySpawned', kind: 'tank' });
    audio.handle({ type: 'saucerAppeared' });
    audio.handle({ type: 'saucerLeft' });

    expect(fake.nodes.length).toBe(before);
  });
});
