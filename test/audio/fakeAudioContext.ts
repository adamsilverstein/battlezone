/**
 * Minimal fake Web Audio implementation for the audio tests.
 *
 * It records every node that gets created, how nodes are connected, every
 * scheduled AudioParam change and every start/stop call, so tests can assert on
 * the graph the synth builds without a real audio device.
 *
 * It is also strict where a real browser is strict. A `NaN` frequency, a
 * negative time, an exponential ramp to zero, a buffer offset past the end of
 * the buffer or a source started twice all throw here, exactly as they throw in
 * Chrome - so a sound that would poison the renderer fails a unit test instead
 * of reaching a player.
 *
 * Every such refusal is also recorded on the context's `violations` list before
 * it is thrown. The audio system deliberately swallows its own exceptions so a
 * bad frame can never break the game loop, which would otherwise make a throw
 * from here invisible; the list survives the swallowing.
 */

/** Something that collects the refusals, so a swallowed throw still shows up. */
export interface ViolationLog {
  readonly violations: string[];
}

/** Records the refusal on the owning context, then throws it as a browser does. */
function refuse(log: ViolationLog | undefined, error: Error): never {
  log?.violations.push(error.message);
  throw error;
}

/** Rejects the values a real AudioParam rejects. */
function checkValue(log: ViolationLog | undefined, label: string, value: number): void {
  if (!Number.isFinite(value)) {
    refuse(log, new TypeError(`${label}: value must be finite, got ${String(value)}`));
  }
  // A real exponential ramp cannot reach or leave zero: the browser throws.
  if (label.endsWith('exponentialRampToValueAtTime') && value === 0) {
    refuse(log, new RangeError(`${label}: an exponential ramp cannot reach 0`));
  }
}

/** Rejects the times a real AudioParam or source node rejects. */
function checkTime(log: ViolationLog | undefined, label: string, time: number): void {
  if (!Number.isFinite(time)) {
    refuse(log, new TypeError(`${label}: time must be finite, got ${String(time)}`));
  }
  if (time < 0) refuse(log, new RangeError(`${label}: time must not be negative, got ${time}`));
}

export type ParamMethod =
  | 'setValueAtTime'
  | 'linearRampToValueAtTime'
  | 'exponentialRampToValueAtTime'
  | 'setTargetAtTime'
  | 'cancelScheduledValues'
  | 'cancelAndHoldAtTime';

export interface ParamChange {
  method: ParamMethod;
  value: number;
  time: number;
}

export class FakeAudioParam {
  value: number;
  readonly changes: ParamChange[] = [];

  constructor(
    readonly name: string,
    value: number,
    /** The context whose violation list refusals are recorded on. */
    private readonly log?: ViolationLog,
  ) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number): this {
    return this.record('setValueAtTime', value, time);
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.record('linearRampToValueAtTime', value, time);
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    return this.record('exponentialRampToValueAtTime', value, time);
  }

  setTargetAtTime(value: number, time: number, _timeConstant: number): this {
    return this.record('setTargetAtTime', value, time);
  }

  cancelScheduledValues(time: number): this {
    checkTime(this.log, `${this.name}.cancelScheduledValues`, time);
    this.changes.push({ method: 'cancelScheduledValues', value: this.value, time });
    return this;
  }

  /** Anchors an automation curve at its current value. */
  cancelAndHoldAtTime(time: number): this {
    checkTime(this.log, `${this.name}.cancelAndHoldAtTime`, time);
    this.changes.push({ method: 'cancelAndHoldAtTime', value: this.value, time });
    return this;
  }

  /** Values in scheduling order, handy for asserting on a swept stream. */
  scheduledValues(): number[] {
    return this.changes
      .filter((c) => c.method !== 'cancelScheduledValues' && c.method !== 'cancelAndHoldAtTime')
      .map((c) => c.value);
  }

  /**
   * The effective schedule: events still standing once cancellations have been
   * applied. `cancelScheduledValues` and `cancelAndHoldAtTime` both drop events
   * at or after their time, so this is what the parameter would really do.
   */
  schedule(): ParamChange[] {
    const standing: ParamChange[] = [];
    for (const change of this.changes) {
      if (change.method === 'cancelScheduledValues' || change.method === 'cancelAndHoldAtTime') {
        for (let i = standing.length - 1; i >= 0; i -= 1) {
          if ((standing[i] as ParamChange).time >= change.time) standing.splice(i, 1);
        }
        continue;
      }
      standing.push(change);
    }
    return standing;
  }

  /** Just the scheduling methods, in order. */
  methods(): ParamMethod[] {
    return this.changes.map((c) => c.method);
  }

  private record(method: ParamMethod, value: number, time: number): this {
    checkValue(this.log, `${this.name}.${method}`, value);
    checkTime(this.log, `${this.name}.${method}`, time);
    this.changes.push({ method, value, time });
    this.value = value;
    return this;
  }
}

export type FakeNodeKind =
  'oscillator' | 'gain' | 'biquad' | 'bufferSource' | 'compressor' | 'waveShaper' | 'destination';

export class FakeAudioNode {
  readonly outputs: FakeAudioNode[] = [];
  /** Modulation targets, i.e. connections made to an AudioParam. */
  readonly paramOutputs: FakeAudioParam[] = [];
  disconnectCalls = 0;

  constructor(
    readonly kind: FakeNodeKind,
    readonly context: FakeAudioContext,
  ) {
    context.nodes.push(this);
  }

  connect<T extends FakeAudioNode | FakeAudioParam>(destination: T): T {
    if (destination instanceof FakeAudioParam) this.paramOutputs.push(destination);
    else this.outputs.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.outputs.length = 0;
    this.paramOutputs.length = 0;
  }

  /** True when this node reaches the target by following connections. */
  reaches(target: FakeAudioNode): boolean {
    return this.outputs.some((out) => out === target || out.reaches(target));
  }
}

export class FakeScheduledSource extends FakeAudioNode {
  startTime: number | null = null;
  /** Offset into the buffer passed to start(), when the caller gave one. */
  startOffset: number | null = null;
  stopTime: number | null = null;
  startCalls = 0;
  stopCalls = 0;
  onended: (() => void) | null = null;

  start(when = 0, offset?: number): void {
    // A real source is one-shot: starting it again is an InvalidStateError.
    if (this.startCalls > 0) {
      refuse(this.context, new Error(`${this.kind}.start: already started`));
    }
    checkTime(this.context, `${this.kind}.start`, when);
    if (offset !== undefined) {
      checkTime(this.context, `${this.kind}.start offset`, offset);
      // A source started at or past the end of its buffer plays nothing at all,
      // which is a bug the ear never hears: fail here instead.
      const buffer = (this as { buffer?: FakeAudioBuffer | null }).buffer;
      if (buffer && offset >= buffer.duration) {
        refuse(
          this.context,
          new RangeError(
            `${this.kind}.start: offset ${offset} is beyond the ${buffer.duration}s buffer`,
          ),
        );
      }
    }
    this.startCalls += 1;
    this.startTime = when;
    this.startOffset = offset ?? null;
  }

  stop(when = 0): void {
    if (this.startCalls === 0) {
      refuse(this.context, new Error(`${this.kind}.stop: not started`));
    }
    checkTime(this.context, `${this.kind}.stop`, when);
    this.stopCalls += 1;
    this.stopTime = this.stopTime === null ? when : Math.min(this.stopTime, when);
  }

  /** Sounding at the given context time? */
  isActiveAt(time: number): boolean {
    if (this.startTime === null || this.startTime > time) return false;
    return this.stopTime === null || this.stopTime > time;
  }
}

export class FakeOscillatorNode extends FakeScheduledSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam('frequency', 440, this.context);
  readonly detune = new FakeAudioParam('detune', 0, this.context);

  constructor(context: FakeAudioContext) {
    super('oscillator', context);
  }
}

export class FakeAudioBuffer {
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new Error(`no channel ${channel}`);
    return data;
  }
}

export class FakeAudioBufferSourceNode extends FakeScheduledSource {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeAudioParam('playbackRate', 1, this.context);

  constructor(context: FakeAudioContext) {
    super('bufferSource', context);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam('gain', 1, this.context);

  constructor(context: FakeAudioContext) {
    super('gain', context);
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam('frequency', 350, this.context);
  readonly Q = new FakeAudioParam('Q', 1, this.context);

  constructor(context: FakeAudioContext) {
    super('biquad', context);
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam('threshold', -24, this.context);
  readonly knee = new FakeAudioParam('knee', 30, this.context);
  readonly ratio = new FakeAudioParam('ratio', 12, this.context);
  readonly attack = new FakeAudioParam('attack', 0.003, this.context);
  readonly release = new FakeAudioParam('release', 0.25, this.context);

  constructor(context: FakeAudioContext) {
    super('compressor', context);
  }
}

export class FakeWaveShaperNode extends FakeAudioNode {
  oversample: OverSampleType = 'none';
  private shape: Float32Array | null = null;

  constructor(context: FakeAudioContext) {
    super('waveShaper', context);
  }

  get curve(): Float32Array | null {
    return this.shape;
  }

  /**
   * A real WaveShaper refuses a curve of fewer than two points - there is
   * nothing to interpolate between - and reads every point as a number, so a
   * non-finite one poisons the output silently.
   */
  set curve(next: Float32Array | null) {
    if (next) {
      if (next.length < 2) {
        refuse(this.context, new RangeError('WaveShaper.curve: needs at least 2 points'));
      }
      const bad = next.findIndex((point) => !Number.isFinite(point));
      if (bad !== -1) {
        refuse(
          this.context,
          new TypeError(`WaveShaper.curve: point ${bad} is ${String(next[bad])}`),
        );
      }
    }
    this.shape = next;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: AudioContextState = 'suspended';
  readonly destination: FakeAudioNode;
  readonly nodes: FakeAudioNode[] = [];
  /** Every value or time this context refused, in the order it refused them. */
  readonly violations: string[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor() {
    this.destination = new FakeAudioNode('destination', this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * What Chrome does when the audio device or the renderer gives up: it fires an
   * `error` event, logs "The AudioContext encountered an error from the audio
   * device or the WebAudio renderer" and leaves the context suspended, with its
   * clock stopped, for good. Nothing resumes it.
   */
  failDevice(): void {
    this.state = 'suspended';
    this.dispatch('error');
    this.dispatch('statechange');
  }

  private dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type } as Event);
  }

  createOscillator(): FakeOscillatorNode {
    this.assertOpen();
    return new FakeOscillatorNode(this);
  }

  createGain(): FakeGainNode {
    this.assertOpen();
    return new FakeGainNode(this);
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    this.assertOpen();
    return new FakeBiquadFilterNode(this);
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    this.assertOpen();
    return new FakeAudioBufferSourceNode(this);
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    this.assertOpen();
    return new FakeDynamicsCompressorNode(this);
  }

  createWaveShaper(): FakeWaveShaperNode {
    this.assertOpen();
    return new FakeWaveShaperNode(this);
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    this.assertOpen();
    return new FakeAudioBuffer(channels, length, sampleRate);
  }

  async resume(): Promise<void> {
    this.assertOpen();
    this.resumeCalls += 1;
    this.state = 'running';
    this.dispatch('statechange');
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    this.dispatch('statechange');
  }

  /** Move the clock forward, as a real context's does. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  /** Every node of a kind, in creation order. */
  nodesOfKind(kind: FakeNodeKind): FakeAudioNode[] {
    return this.nodes.filter((node) => node.kind === kind);
  }

  sources(): FakeScheduledSource[] {
    return this.nodes.filter((node): node is FakeScheduledSource => {
      return node instanceof FakeScheduledSource;
    });
  }

  /** Sources sounding at the given context time. */
  activeSources(time: number = this.currentTime): FakeScheduledSource[] {
    return this.sources().filter((source) => source.isActiveAt(time));
  }

  private assertOpen(): void {
    // A real context throws InvalidStateError once closed; the audio system has
    // to survive that.
    if (this.state === 'closed') throw new Error('AudioContext is closed');
  }
}

/** The fake, typed as the real thing for injection into the audio system. */
export function asAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}
