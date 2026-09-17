import { describe, expect, it } from 'vitest';
import { MUTE_RAMP_SECONDS } from '../../src/audio/audioSystem';
import {
  PLAYING,
  SILENT,
  buzzGain,
  gains,
  oscillators,
  sirenGain,
  unlocked,
  type Harness,
} from './audioSystemHarness';

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

  it('buzzes while a missile is alive and stops when it is gone', async () => {
    const { fake, audio } = await unlocked();

    audio.update({ ...PLAYING, missileActive: true, missileDistance: 12000 });
    // Two square oscillators for the buzz, on top of the engine's sawtooths.
    const buzz = oscillators(fake).filter((osc) => osc.type === 'square');
    expect(buzz).toHaveLength(2);

    fake.advance(1);
    audio.update({ ...PLAYING, missileActive: true, missileDistance: 12000 });
    expect(oscillators(fake).filter((osc) => osc.type === 'square')).toHaveLength(2);

    audio.update(PLAYING);
    expect(buzz.every((osc) => osc.stopTime !== null)).toBe(true);
  });

  it('scales the missile buzz by distance, and silences it when too far', async () => {
    const near = await unlocked();
    near.audio.update({ ...PLAYING, missileActive: true, missileDistance: 512 });
    const far = await unlocked();
    far.audio.update({ ...PLAYING, missileActive: true, missileDistance: 24575 });
    const gone = await unlocked();
    gone.audio.update({ ...PLAYING, missileActive: true, missileDistance: 40000 });

    // The buzz pair runs through its own 900 Hz lowpass into its output gain.
    const buzzLevel = (h: Harness): number => buzzGain(h.fake).gain.value;

    expect(buzzLevel(near)).toBeGreaterThan(buzzLevel(far));
    expect(buzzLevel(far)).toBeGreaterThan(0);
    // The high byte's top bit means "too far to hear".
    expect(buzzLevel(gone)).toBe(0);

    // The volume is rewritten every frame as the missile closes in, one game
    // frame behind, like the original's per-frame AUDC write.
    far.fake.advance(1);
    far.audio.update({ ...PLAYING, missileActive: true, missileDistance: 0 });
    expect(buzzGain(far.fake).gain.changes.at(-1)).toEqual({
      method: 'linearRampToValueAtTime',
      value: 1,
      time: 1 + 0.064,
    });
  });

  it('hovers while a saucer is alive and pauses for channel-1 effects', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, saucerActive: true });

    // A square carrier plus its triangle LFO, on top of the engine's sawtooths.
    const hover = oscillators(fake).filter((osc) => osc.type !== 'sawtooth');
    expect(hover.map((osc) => osc.type)).toEqual(['square', 'triangle']);
    const output = gains(fake).find((gain) => gain.gain.value > 0);
    expect(output).toBeDefined();

    // Ramming a block takes channel 1, so the siren drops out and comes back.
    fake.advance(1);
    audio.handle({ type: 'motionBlocked' });
    const suppressions = sirenGain(fake).gain.changes.filter((change) => {
      return change.method === 'setValueAtTime' && change.time === 1 && change.value === 0;
    });
    expect(suppressions).toHaveLength(1);

    audio.update(PLAYING);
    expect(hover.every((osc) => osc.stopTime !== null)).toBe(true);
  });

  it('keeps the siren down for the longest overlapping channel-1 sound', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, saucerActive: true });
    const siren = sirenGain(fake);
    const level = siren.gain.value;

    // A short warble, then a long saucer-hit chirp over the top of it: the siren
    // must come back after the chirp, not part-way through it.
    audio.handle({ type: 'motionBlocked' });
    const warbleEnd = 120 / 250;
    fake.advance(0.1);
    audio.handle({ type: 'enemyDestroyed', kind: 'saucer', points: 5000 });
    const chirpEnd = 0.1 + (24 * 21) / 250;

    const restores = siren.gain.schedule().filter((change) => change.value === level);
    expect(restores).toHaveLength(1);
    expect(restores[0]?.time).toBeCloseTo(chirpEnd, 9);
    expect(chirpEnd).toBeGreaterThan(warbleEnd);
  });

  it('starts the siren already down when channel 1 is busy', async () => {
    const { fake, audio } = await unlocked();
    audio.handle({ type: 'motionBlocked' });

    fake.advance(0.1);
    audio.update({ ...PLAYING, saucerActive: true });

    const scheduled = sirenGain(fake).gain.schedule();
    expect(scheduled[0]).toEqual({ method: 'setValueAtTime', value: 0, time: 0.1 });
    // Channel 1 is booked through the warble and the merp queued behind it.
    expect(scheduled[1]?.time).toBeCloseTo((120 + 32) / 250, 9);
  });
});

describe('muting', () => {
  it('drops the master gain, stops everything and recovers', async () => {
    const { fake, audio } = await unlocked();
    audio.update({ ...PLAYING, saucerActive: true, missileActive: true, missileDistance: 8000 });
    expect(fake.activeSources(0).length).toBeGreaterThan(0);

    fake.advance(1);
    audio.setMuted(true);
    const master = gains(fake)[0];
    // A short ramp rather than an instant flip, so the mute itself cannot click.
    expect(master?.gain.changes.at(-1)).toEqual({
      method: 'linearRampToValueAtTime',
      value: 0,
      time: 1 + MUTE_RAMP_SECONDS,
    });
    expect(master?.gain.value).toBe(0);
    expect(fake.activeSources(1 + MUTE_RAMP_SECONDS)).toHaveLength(0);

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
      audio.update({
        ...PLAYING,
        enemyInRange: true,
        missileActive: true,
        saucerActive: true,
        missileDistance: 5000,
      });
      audio.update(SILENT);
      audio.setMuted(true);
    }).not.toThrow();
    // A closed context can never be resumed, and unlock says so rather than
    // letting a caller believe sound is running.
    await expect(audio.unlock()).resolves.toBe(false);
  });
});
