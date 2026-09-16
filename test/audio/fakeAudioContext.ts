/**
 * Minimal fake Web Audio implementation for the audio tests.
 *
 * It records every node that gets created, how nodes are connected, every
 * scheduled AudioParam change and every start/stop call, so tests can assert on
 * the graph the synth builds without a real audio device.
 */

export type ParamMethod =
  | 'setValueAtTime'
  | 'linearRampToValueAtTime'
  | 'exponentialRampToValueAtTime'
  | 'setTargetAtTime'
  | 'cancelScheduledValues';

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
    this.changes.push({ method: 'cancelScheduledValues', value: this.value, time });
    return this;
  }

  /** Values in scheduling order, handy for asserting on a swept stream. */
  scheduledValues(): number[] {
    return this.changes.filter((c) => c.method !== 'cancelScheduledValues').map((c) => c.value);
  }

  private record(method: ParamMethod, value: number, time: number): this {
    this.changes.push({ method, value, time });
    this.value = value;
    return this;
  }
}

export type FakeNodeKind = 'oscillator' | 'gain' | 'biquad' | 'bufferSource' | 'destination';

export class FakeAudioNode {
  readonly outputs: FakeAudioNode[] = [];
  disconnectCalls = 0;

  constructor(
    readonly kind: FakeNodeKind,
    readonly context: FakeAudioContext,
  ) {
    context.nodes.push(this);
  }

  connect<T extends FakeAudioNode>(destination: T): T {
    this.outputs.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.outputs.length = 0;
  }

  /** True when this node reaches the target by following connections. */
  reaches(target: FakeAudioNode): boolean {
    return this.outputs.some((out) => out === target || out.reaches(target));
  }
}

export class FakeScheduledSource extends FakeAudioNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  startCalls = 0;
  stopCalls = 0;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startCalls += 1;
    this.startTime = when;
  }

  stop(when = 0): void {
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
  readonly frequency = new FakeAudioParam('frequency', 440);
  readonly detune = new FakeAudioParam('detune', 0);

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
  readonly playbackRate = new FakeAudioParam('playbackRate', 1);

  constructor(context: FakeAudioContext) {
    super('bufferSource', context);
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam('gain', 1);

  constructor(context: FakeAudioContext) {
    super('gain', context);
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam('frequency', 350);
  readonly Q = new FakeAudioParam('Q', 1);

  constructor(context: FakeAudioContext) {
    super('biquad', context);
  }
}

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: AudioContextState = 'suspended';
  readonly destination: FakeAudioNode;
  readonly nodes: FakeAudioNode[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  constructor() {
    this.destination = new FakeAudioNode('destination', this);
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

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    this.assertOpen();
    return new FakeAudioBuffer(channels, length, sampleRate);
  }

  async resume(): Promise<void> {
    this.assertOpen();
    this.resumeCalls += 1;
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
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
