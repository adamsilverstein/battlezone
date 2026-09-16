/**
 * Web Audio building blocks: POKEY voices, noise bursts and the raw node
 * helpers the discrete-circuit sounds use. Everything is synthesized; there are
 * no samples anywhere in this module.
 */

import {
  POKEY_CLOCK_64K,
  type PokeyChunk,
  type PokeyDistortion,
  audcDistortion,
  audcVolume,
  expandPokeyStream,
  pokeyFrequency,
  pokeyStreamDuration,
  volumeToGain,
} from './pokey';

/** Gain floor for exponential ramps, which cannot reach zero. */
const SILENCE = 0.0001;

/** A sounding thing that can be cut short. */
export interface Voice {
  /** Context time the voice stops on its own; Infinity for continuous loops. */
  readonly endTime: number;
  stop(when?: number): void;
}

export interface PokeyVoiceOptions {
  /** AUDF (period) data stream. */
  audf: readonly PokeyChunk[];
  /** AUDC (distortion + volume) data stream. */
  audc: readonly PokeyChunk[];
  /** Context time to start at. */
  at: number;
  /** POKEY base clock; defaults to 64 kHz. */
  clock?: number;
  /** Plays the stream pair this many times back to back (looped effects). */
  repeat?: number;
  /** Scales AUDC volume for mix balance. */
  level?: number;
}

export interface NoiseVoiceOptions {
  at: number;
  duration: number;
  /** Peak gain. */
  level: number;
  /** Attack ramp in seconds. */
  attack?: number;
  /** Optional filter swept across the burst. */
  filter?: { type: BiquadFilterType; from: number; to: number; q?: number };
}

export interface Synth {
  readonly ctx: AudioContext;
  readonly out: AudioNode;
  now(): number;
  /** Plays one POKEY channel from its AUDF/AUDC data streams. */
  pokeyVoice(options: PokeyVoiceOptions): Voice;
  /** A filtered white-noise burst, for the discrete cannon and explosions. */
  noiseVoice(options: NoiseVoiceOptions): Voice;
  whiteNoiseBuffer(): AudioBuffer;
  polyBuffer(kind: Exclude<PokeyDistortion, 'tone'>): AudioBuffer;
  oscillator(type: OscillatorType, frequency: number): OscillatorNode;
  gain(value: number): GainNode;
  filter(type: BiquadFilterType, frequency: number, q?: number): BiquadFilterNode;
  /** Looping white noise, for hand-built continuous graphs. */
  noiseSource(): AudioBufferSourceNode;
  /** Wraps hand-built graphs so the audio system can stop them uniformly. */
  voice(sources: readonly AudioScheduledSourceNode[], endTime: number): Voice;
}

/** Deterministic PRNG so synthesized noise sounds the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One period of a polynomial counter as +/-1 samples, one sample per bit. The
 * buffer is clocked by playbackRate so a single buffer serves every pitch.
 * POKEY's counters are 4-bit (period 15) and 17-bit (period 131071); the tap
 * positions come from the POKEY datasheet, since the reference does not list
 * them.
 */
function fillPolyBuffer(data: Float32Array, bits: 4 | 17): void {
  const tap = bits === 4 ? 3 : 12;
  let register = (1 << bits) - 1;
  for (let i = 0; i < data.length; i += 1) {
    const bit = register & 1;
    data[i] = bit ? 1 : -1;
    const feedback = (register ^ (register >> (bits - tap))) & 1;
    register = (register >> 1) | (feedback << (bits - 1));
  }
}

function stopSources(sources: readonly AudioScheduledSourceNode[], when: number): void {
  for (const source of sources) {
    try {
      source.stop(when);
    } catch {
      // Already stopped, or the context went away. Nothing to do.
    }
  }
}

export function createSynth(ctx: AudioContext, out: AudioNode): Synth {
  const polyBuffers = new Map<string, AudioBuffer>();
  let white: AudioBuffer | null = null;

  function whiteNoiseBuffer(): AudioBuffer {
    if (!white) {
      white = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
      const data = white.getChannelData(0);
      const random = mulberry32(0x5a17);
      for (let i = 0; i < data.length; i += 1) data[i] = random() * 2 - 1;
    }
    return white;
  }

  function polyBuffer(kind: Exclude<PokeyDistortion, 'tone'>): AudioBuffer {
    const cached = polyBuffers.get(kind);
    if (cached) return cached;
    const bits = kind === 'poly4' ? 4 : 17;
    const buffer = ctx.createBuffer(1, (1 << bits) - 1, ctx.sampleRate);
    fillPolyBuffer(buffer.getChannelData(0), bits);
    polyBuffers.set(kind, buffer);
    return buffer;
  }

  function voice(sources: readonly AudioScheduledSourceNode[], endTime: number): Voice {
    let stopped = false;
    return {
      endTime,
      stop(when?: number) {
        if (stopped) return;
        stopped = true;
        stopSources(sources, when ?? ctx.currentTime);
      },
    };
  }

  function noiseSource(): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = whiteNoiseBuffer();
    source.loop = true;
    return source;
  }

  function pokeyVoice(options: PokeyVoiceOptions): Voice {
    const { audf, audc, at } = options;
    const clock = options.clock ?? POKEY_CLOCK_64K;
    const repeat = Math.max(1, options.repeat ?? 1);
    const level = options.level ?? 1;
    const distortion = audcDistortion(audc[0]?.value ?? 0xa0);
    const period = Math.max(pokeyStreamDuration(audf), pokeyStreamDuration(audc));
    const endTime = at + period * repeat;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(out);

    let source: AudioScheduledSourceNode;
    let setFrequency: (hz: number, time: number) => void;
    if (distortion === 'tone') {
      // A POKEY "pure tone" is a square wave.
      const osc = ctx.createOscillator();
      osc.type = 'square';
      setFrequency = (hz, time) => osc.frequency.setValueAtTime(hz, time);
      source = osc;
    } else {
      const bufferSource = ctx.createBufferSource();
      bufferSource.buffer = polyBuffer(distortion);
      bufferSource.loop = true;
      // The polynomial counter is clocked at the channel frequency, and the
      // buffer holds one bit per sample.
      setFrequency = (hz, time) =>
        bufferSource.playbackRate.setValueAtTime(hz / ctx.sampleRate, time);
      source = bufferSource;
    }
    source.connect(gainNode);

    const audfSteps = expandPokeyStream(audf);
    const audcSteps = expandPokeyStream(audc);
    for (let pass = 0; pass < repeat; pass += 1) {
      const offset = at + pass * period;
      for (const step of audfSteps)
        setFrequency(pokeyFrequency(step.value, clock), offset + step.time);
      for (const step of audcSteps) {
        gainNode.gain.setValueAtTime(
          volumeToGain(audcVolume(step.value)) * level,
          offset + step.time,
        );
      }
    }
    gainNode.gain.setValueAtTime(0, endTime);
    source.start(at);
    source.stop(endTime);
    return voice([source], endTime);
  }

  function noiseVoice(options: NoiseVoiceOptions): Voice {
    const { at, duration, level } = options;
    const attack = Math.min(options.attack ?? 0.004, duration / 2);
    const endTime = at + duration;

    const source = noiseSource();
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(SILENCE, at);
    gainNode.gain.linearRampToValueAtTime(level, at + attack);
    gainNode.gain.exponentialRampToValueAtTime(SILENCE, endTime);

    if (options.filter) {
      const { type, from, to, q } = options.filter;
      const filterNode = ctx.createBiquadFilter();
      filterNode.type = type;
      if (q !== undefined) filterNode.Q.value = q;
      filterNode.frequency.setValueAtTime(from, at);
      filterNode.frequency.exponentialRampToValueAtTime(Math.max(to, 1), endTime);
      source.connect(filterNode);
      filterNode.connect(gainNode);
    } else {
      source.connect(gainNode);
    }
    gainNode.connect(out);

    source.start(at);
    source.stop(endTime);
    return voice([source], endTime);
  }

  return {
    ctx,
    out,
    now: () => ctx.currentTime,
    pokeyVoice,
    noiseVoice,
    whiteNoiseBuffer,
    polyBuffer,
    oscillator(type: OscillatorType, frequency: number): OscillatorNode {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      return osc;
    },
    gain(value: number): GainNode {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    },
    filter(type: BiquadFilterType, frequency: number, q?: number): BiquadFilterNode {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      if (q !== undefined) node.Q.value = q;
      return node;
    },
    noiseSource,
    voice,
  };
}
