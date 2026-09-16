import { describe, expect, it } from 'vitest';
import {
  FakeAudioBufferSourceNode,
  FakeAudioContext,
  FakeBiquadFilterNode,
  FakeGainNode,
  FakeOscillatorNode,
  asAudioContext,
} from './fakeAudioContext';
import { createSynth, type Synth } from '../../src/audio/synth';
import { pokeyFrequency, volumeToGain } from '../../src/audio/pokey';
import { playRadarPing } from '../../src/audio/sounds/radarPing';
import { playCollisionWarble } from '../../src/audio/sounds/collisionWarble';
import { playMerp } from '../../src/audio/sounds/merp';
import { playExtraLife } from '../../src/audio/sounds/extraLife';
import { playEnemyAlert } from '../../src/audio/sounds/enemyAlert';
import { SAUCER_HIT_REPEAT, playSaucerHit } from '../../src/audio/sounds/saucerHit';
import { startSaucerHover } from '../../src/audio/sounds/saucerHover';
import { playFanfare } from '../../src/audio/sounds/fanfare';
import { ENGINE_RAMP_SECONDS, startEngine } from '../../src/audio/sounds/engine';
import { CANNON_ENABLE_SECONDS, playCannon } from '../../src/audio/sounds/cannon';
import {
  LOUD_EXPLOSION_SECONDS,
  SOFT_EXPLOSION_SECONDS,
  playExplosion,
} from '../../src/audio/sounds/explosion';
import { startMissileBuzz } from '../../src/audio/sounds/missileBuzz';

function setup(): { fake: FakeAudioContext; out: FakeGainNode; synth: Synth } {
  const fake = new FakeAudioContext();
  const out = fake.createGain();
  out.connect(fake.destination);
  const synth = createSynth(asAudioContext(fake), out as unknown as AudioNode);
  return { fake, out, synth };
}

function oscillators(fake: FakeAudioContext): FakeOscillatorNode[] {
  return fake.nodes.filter((node): node is FakeOscillatorNode => {
    return node instanceof FakeOscillatorNode;
  });
}

function voiceGains(fake: FakeAudioContext, out: FakeGainNode): FakeGainNode[] {
  return fake.nodes.filter((node): node is FakeGainNode => {
    return node instanceof FakeGainNode && node !== out;
  });
}

describe('radar ping', () => {
  it('is a single short high blip at volume 3', () => {
    const { fake, out, synth } = setup();
    const voice = playRadarPing(synth, 0);

    const [osc] = oscillators(fake);
    if (!osc) throw new Error('no oscillator');
    expect(osc.frequency.scheduledValues()).toEqual([pokeyFrequency(0x23)]);
    expect(voice.endTime).toBeCloseTo(16 / 250, 9);
    const [gain] = voiceGains(fake, out);
    expect(gain?.gain.scheduledValues()[0]).toBeCloseTo(volumeToGain(3), 6);
  });
});

describe('collision warble', () => {
  it('sweeps ten converging chunks while fading out', () => {
    const { fake, out, synth } = setup();
    const voice = playCollisionWarble(synth, 0);

    const [osc] = oscillators(fake);
    if (!osc) throw new Error('no oscillator');
    const freqs = osc.frequency.scheduledValues();
    expect(freqs).toHaveLength(120);
    // Chunks alternate direction: the first falls in period (rises in pitch),
    // the second rises in period.
    expect(freqs[1]).toBeGreaterThan(freqs[0] as number);
    expect(freqs[13]).toBeLessThan(freqs[12] as number);
    expect(voice.endTime).toBeCloseTo(120 / 250, 9);

    const [gain] = voiceGains(fake, out);
    const volumes = gain?.gain.scheduledValues() ?? [];
    expect(volumes[0]).toBeCloseTo(volumeToGain(11), 6);
    expect(volumes[8]).toBeCloseTo(volumeToGain(3), 6);
  });
});

describe('post-collision merp', () => {
  it('is a short 4-bit-poly squeak that gates itself off', () => {
    const { fake, out, synth } = setup();
    const voice = playMerp(synth, 0);

    expect(oscillators(fake)).toHaveLength(0);
    const source = fake.nodesOfKind('bufferSource')[0];
    if (!(source instanceof FakeAudioBufferSourceNode)) throw new Error('no buffer source');
    expect(source.buffer?.length).toBe(15);
    expect(voice.endTime).toBeCloseTo(32 / 250, 9);

    const [gain] = voiceGains(fake, out);
    const volumes = gain?.gain.scheduledValues() ?? [];
    expect(volumes[0]).toBeCloseTo(volumeToGain(1), 6);
    expect(volumes[1]).toBe(0);
  });
});

describe('extra life', () => {
  it('gates one pitch into four beeps', () => {
    const { fake, out, synth } = setup();
    const voice = playExtraLife(synth, 0);

    const [osc] = oscillators(fake);
    expect(osc?.frequency.scheduledValues()).toEqual([pokeyFrequency(0x10), pokeyFrequency(0x10)]);

    const [gain] = voiceGains(fake, out);
    const volumes = gain?.gain.scheduledValues() ?? [];
    // $a2/$a0 alternation, then the release: four audible beeps.
    expect(volumes.filter((v) => v > 0)).toHaveLength(4);
    expect(voice.endTime).toBeCloseTo(224 / 250, 9);
  });
});

describe('new-enemy alert', () => {
  it('rises three times', () => {
    const { fake, synth } = setup();
    const voice = playEnemyAlert(synth, 0);

    const [osc] = oscillators(fake);
    const freqs = osc?.frequency.scheduledValues() ?? [];
    expect(freqs).toHaveLength(72);
    // Each boop rises, then the next boop restarts at the low pitch.
    expect(freqs[23]).toBeGreaterThan(freqs[0] as number);
    expect(freqs[24]).toBeCloseTo(freqs[0] as number, 6);
    expect(voice.endTime).toBeCloseTo(144 / 250, 9);
  });
});

describe('saucer hit', () => {
  it('loops a rising chirp across the fade-out', () => {
    const { fake, synth } = setup();
    const voice = playSaucerHit(synth, 0);

    const [osc] = oscillators(fake);
    const freqs = osc?.frequency.scheduledValues() ?? [];
    expect(freqs).toHaveLength(24 * SAUCER_HIT_REPEAT);
    expect(freqs[11]).toBeGreaterThan(freqs[0] as number);
    expect(voice.endTime).toBeCloseTo((24 * SAUCER_HIT_REPEAT) / 250, 9);
    // Covers the 32-game-frame fade-out to within one game frame.
    expect(voice.endTime).toBeGreaterThan(32 / 15.625 - 1 / 15.625);
  });
});

describe('saucer hover', () => {
  it('warbles a quiet carrier from an LFO and can be suppressed', () => {
    const { fake, out, synth } = setup();
    const voice = startSaucerHover(synth, 3);

    const [carrier, lfo] = oscillators(fake);
    if (!carrier || !lfo) throw new Error('missing oscillators');
    expect(carrier.type).toBe('square');
    expect(lfo.type).toBe('triangle');
    // 32 steps of 4 NMI ticks per cycle.
    expect(lfo.frequency.value).toBeCloseTo(250 / (32 * 4), 6);
    expect(carrier.frequency.value).toBeCloseTo(
      (pokeyFrequency(0x40) + pokeyFrequency(0x20)) / 2,
      4,
    );

    const depth = voiceGains(fake, out).find((gain) => gain.paramOutputs.length > 0);
    expect(depth?.gain.value).toBeCloseTo((pokeyFrequency(0x20) - pokeyFrequency(0x40)) / 2, 4);
    expect(depth?.paramOutputs[0]).toBe(carrier.frequency);

    const output = voiceGains(fake, out).find((gain) => gain.outputs.includes(out));
    expect(output?.gain.value).toBeCloseTo(volumeToGain(1), 6);

    expect(voice.endTime).toBe(Infinity);
    expect(carrier.startTime).toBe(3);

    voice.suppress(4, 4.5);
    expect(output?.gain.changes).toEqual([
      { method: 'setValueAtTime', value: 0, time: 4 },
      { method: 'setValueAtTime', value: volumeToGain(1), time: 4.5 },
    ]);

    voice.stop(9);
    expect(carrier.stopTime).toBe(9);
    expect(lfo.stopTime).toBe(9);
  });
});

describe('fanfare', () => {
  it('plays thirteen note steps on two voices an octave apart', () => {
    const { fake, synth } = setup();
    const voice = playFanfare(synth, 0);

    const [low, high] = oscillators(fake);
    const lowNotes = low?.frequency.scheduledValues() ?? [];
    const highNotes = high?.frequency.scheduledValues() ?? [];
    expect(lowNotes).toHaveLength(13);
    expect(highNotes).toHaveLength(13);
    expect((highNotes[0] as number) / (lowNotes[0] as number)).toBeCloseTo(2, 1);
    expect(voice.endTime).toBeCloseTo((13 * 48) / 250, 9);

    voice.stop(1);
    expect(low?.stopTime).toBe(1);
    expect(high?.stopTime).toBe(1);
  });
});

describe('engine', () => {
  it('rumbles from two detuned sawtooths plus filtered noise', () => {
    const { fake, synth } = setup();
    const voice = startEngine(synth, 0);

    const oscs = oscillators(fake);
    expect(oscs.map((osc) => osc.type)).toEqual(['sawtooth', 'sawtooth']);
    expect(oscs[1]?.frequency.value).toBeGreaterThan(oscs[0]?.frequency.value as number);
    expect(fake.nodesOfKind('bufferSource')).toHaveLength(1);
    const filter = fake.nodesOfKind('biquad')[0];
    expect(filter).toBeInstanceOf(FakeBiquadFilterNode);
    expect(voice.endTime).toBe(Infinity);
    expect(fake.activeSources(0)).toHaveLength(3);
  });

  it('glides up when the treads engage and back down at rest', () => {
    const { fake, synth } = setup();
    const voice = startEngine(synth, 0);
    const oscs = oscillators(fake);
    const idle = oscs[0]?.frequency.value as number;

    voice.setRev(true, 1);
    const ramp = oscs[0]?.frequency.changes[0];
    expect(ramp?.method).toBe('linearRampToValueAtTime');
    expect(ramp?.value).toBeGreaterThan(idle);
    expect(ramp?.time).toBeCloseTo(1 + ENGINE_RAMP_SECONDS, 9);

    // Already revved: no further scheduling.
    voice.setRev(true, 2);
    expect(oscs[0]?.frequency.changes).toHaveLength(1);

    voice.setRev(false, 3);
    expect(oscs[0]?.frequency.changes[1]?.value).toBeCloseTo(idle, 6);
  });

  it('stops every source', () => {
    const { fake, synth } = setup();
    startEngine(synth, 0).stop(5);
    expect(fake.activeSources(6)).toHaveLength(0);
  });
});

describe('cannon', () => {
  it('cracks louder for the player than for the enemy', () => {
    const loudSetup = setup();
    const loud = playCannon(loudSetup.synth, 0, true);
    const softSetup = setup();
    playCannon(softSetup.synth, 0, false);

    const peak = (ctx: FakeAudioContext, out: FakeGainNode): number =>
      Math.max(...(voiceGains(ctx, out)[0]?.gain.changes.map((c) => c.value) ?? []));

    expect(peak(loudSetup.fake, loudSetup.out)).toBeGreaterThan(
      peak(softSetup.fake, softSetup.out),
    );
    expect(loud.endTime).toBeGreaterThan(CANNON_ENABLE_SECONDS);
    expect(loudSetup.fake.nodesOfKind('bufferSource')).toHaveLength(1);
  });
});

describe('explosion', () => {
  it('uses the original $ff and $70 counters for loud and soft', () => {
    const { synth } = setup();
    expect(playExplosion(synth, 0, true).endTime).toBeCloseTo(LOUD_EXPLOSION_SECONDS, 9);
    expect(playExplosion(synth, 0, false).endTime).toBeCloseTo(SOFT_EXPLOSION_SECONDS, 9);
    expect(LOUD_EXPLOSION_SECONDS).toBeCloseTo(1.02, 2);
    expect(SOFT_EXPLOSION_SECONDS).toBeCloseTo(0.448, 3);
  });
});

describe('missile buzz', () => {
  it('beats two channels one AUDF period apart', () => {
    const { fake, out, synth } = setup();
    const voice = startMissileBuzz(synth, 0, 8);

    const oscs = oscillators(fake);
    expect(oscs.map((osc) => osc.frequency.value)).toEqual([
      pokeyFrequency(0xff),
      pokeyFrequency(0xfe),
    ]);
    expect(oscs.every((osc) => osc.type === 'square')).toBe(true);

    const output = voiceGains(fake, out).find((gain) => gain.outputs.includes(out));
    expect(output?.gain.value).toBeCloseTo(volumeToGain(8), 6);

    voice.setVolume(15, 1);
    expect(output?.gain.changes[0]?.value).toBeCloseTo(1, 6);
    expect(voice.endTime).toBe(Infinity);
  });
});
