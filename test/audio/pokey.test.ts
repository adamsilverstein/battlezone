import { describe, expect, it } from 'vitest';
import {
  NMI_HZ,
  POKEY_CLOCK_15K,
  POKEY_CLOCK_64K,
  audcDistortion,
  audcVolume,
  expandPokeyStream,
  pokeyDividerClock,
  pokeyFrequency,
  pokeyStreamDuration,
  volumeToGain,
} from '../../src/audio/pokey';

describe('pokeyFrequency', () => {
  it('treats AUDF as a divider off the 64 kHz clock', () => {
    // f = clock / (2 * (AUDF + 1)).
    expect(pokeyFrequency(0x23)).toBeCloseTo(POKEY_CLOCK_64K / (2 * 36), 6);
  });

  it('puts the radar ping in the high blip range and the missile buzz low', () => {
    expect(pokeyFrequency(0x23)).toBeGreaterThan(800);
    expect(pokeyFrequency(0x23)).toBeLessThan(950);
    // AUDF3 = $ff and AUDF4 = $fe are one period apart, which is what beats.
    expect(pokeyFrequency(0xff)).toBeCloseTo(124.8, 1);
    expect(pokeyFrequency(0xfe)).toBeCloseTo(125.3, 1);
    expect(pokeyFrequency(0xfe) - pokeyFrequency(0xff)).toBeGreaterThan(0.3);
  });

  it('supports the slower 15 kHz base clock', () => {
    expect(pokeyFrequency(0x23, POKEY_CLOCK_15K)).toBeCloseTo(POKEY_CLOCK_15K / 72, 6);
  });
});

describe('AUDC decoding', () => {
  it('reads volume from the low nibble', () => {
    expect(audcVolume(0xab)).toBe(11);
    expect(audcVolume(0xa0)).toBe(0);
    expect(audcVolume(0xc1)).toBe(1);
  });

  it('normalises volume to gain', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(15)).toBe(1);
    expect(volumeToGain(11)).toBeCloseTo(11 / 15, 6);
  });

  it('reads distortion from the high nibble, per the datasheet table', () => {
    expect(audcDistortion(0xa3)).toBe('tone');
    expect(audcDistortion(0xe0)).toBe('tone');
    expect(audcDistortion(0xc1)).toBe('poly4');
    expect(audcDistortion(0x8f)).toBe('poly17');
    // $00 is 5-bit gating 17-bit, $40 is 5-bit gating 4-bit: each takes the
    // finer poly it gates. $20 and $60 are 5-bit only.
    expect(audcDistortion(0x0f)).toBe('poly17');
    expect(audcDistortion(0x4f)).toBe('poly4');
    expect(audcDistortion(0x2f)).toBe('poly5');
    expect(audcDistortion(0x6f)).toBe('poly5');
  });
});

describe('pokeyDividerClock', () => {
  it('is the divider output, twice the audible frequency', () => {
    // The polynomial counters are clocked by the divider, which toggles the
    // square wave, so the bit rate is twice the tone frequency.
    expect(pokeyDividerClock(0x23)).toBeCloseTo(POKEY_CLOCK_64K / 36, 6);
    expect(pokeyDividerClock(0x23)).toBeCloseTo(2 * pokeyFrequency(0x23), 6);
  });
});

describe('expandPokeyStream', () => {
  it('holds each value for duration NMI ticks then adds the increment', () => {
    const steps = expandPokeyStream([{ value: 0x40, duration: 2, increment: -1, repetitions: 3 }]);
    expect(steps).toEqual([
      { value: 0x40, time: 0 },
      { value: 0x3f, time: 2 / NMI_HZ },
      { value: 0x3e, time: 4 / NMI_HZ },
    ]);
  });

  it('runs chunks back to back', () => {
    const steps = expandPokeyStream([
      { value: 0x10, duration: 4, increment: 0, repetitions: 2 },
      { value: 0x20, duration: 1, increment: 0, repetitions: 1 },
    ]);
    expect(steps.map((s) => s.value)).toEqual([0x10, 0x10, 0x20]);
    expect(steps[2]?.time).toBeCloseTo(8 / NMI_HZ, 9);
  });

  it('stops at a chunk whose value is $00', () => {
    const steps = expandPokeyStream([
      { value: 0x10, duration: 1, increment: 0, repetitions: 1 },
      { value: 0x00, duration: 1, increment: 0, repetitions: 4 },
      { value: 0x20, duration: 1, increment: 0, repetitions: 1 },
    ]);
    expect(steps.map((s) => s.value)).toEqual([0x10]);
  });

  it('wraps values into the 8-bit register range', () => {
    const steps = expandPokeyStream([{ value: 0xfe, duration: 1, increment: 3, repetitions: 2 }]);
    expect(steps.map((s) => s.value)).toEqual([0xfe, 0x01]);
  });

  it('reports the total stream duration in seconds', () => {
    expect(
      pokeyStreamDuration([
        { value: 0x40, duration: 2, increment: -1, repetitions: 24 },
        { value: 0x40, duration: 2, increment: -1, repetitions: 24 },
      ]),
    ).toBeCloseTo(96 / NMI_HZ, 9);
  });
});
