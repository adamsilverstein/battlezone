/**
 * POKEY register maths and sound-effect data-stream expansion.
 *
 * The original drives its four POKEY voices from tables of
 * `{initial value, duration, increment, repetition count}` chunks, stepped by
 * the 250 Hz NMI (docs/reference/original-game.md section 5, "The 8 POKEY
 * sound effects"). This module converts those tables into plain
 * value/time steps and converts AUDF/AUDC register values into the frequency
 * and gain a Web Audio node wants. It is pure: no audio nodes here.
 */

/**
 * POKEY divides a 1.7897725 MHz colour-clock derivative. The two selectable
 * base clocks are 64 kHz (clock / 28) and 15 kHz (clock / 114); AUDCTL picks
 * between them. The reference does not record Battlezone's AUDCTL value, so we
 * assume the reset default of 64 kHz, which is also the only setting that puts
 * every documented AUDF value in the pitch range the reference describes (the
 * radar ping near 890 Hz, the missile buzz near 125 Hz).
 */
export const POKEY_CLOCK_64K = 63921;
/** The alternate POKEY base clock, kept for completeness. */
export const POKEY_CLOCK_15K = 15700;

/** The NMI that steps every sound-effect data stream (250 Hz). */
export const NMI_HZ = 250;

/** Distortion selected by the high nibble of AUDC. */
export type PokeyDistortion = 'tone' | 'poly4' | 'poly5' | 'poly17';

/** One chunk of a POKEY register data stream. */
export interface PokeyChunk {
  /** Initial register value. A chunk value of $00 ends the stream. */
  value: number;
  /** NMI ticks each value is held. */
  duration: number;
  /** Added to the value after each hold. */
  increment: number;
  /** How many values this chunk produces. */
  repetitions: number;
}

/** One register write, at a time in seconds from the start of the stream. */
export interface PokeyStep {
  value: number;
  time: number;
}

/**
 * AUDF is a period divider: frequency = clock / (2 * (AUDF + 1)), so larger
 * AUDF means lower pitch.
 */
export function pokeyFrequency(audf: number, clock: number = POKEY_CLOCK_64K): number {
  return clock / (2 * ((audf & 0xff) + 1));
}

/**
 * The divider's own output rate, which is what latches the polynomial counters.
 * The divider toggles the square wave, so this is twice the audible frequency.
 */
export function pokeyDividerClock(audf: number, clock: number = POKEY_CLOCK_64K): number {
  return clock / ((audf & 0xff) + 1);
}

/** AUDC is `NNNFVVVV`: the low nibble is volume 0-15. */
export function audcVolume(audc: number): number {
  return audc & 0x0f;
}

/** Maps a POKEY volume (0-15) onto a linear gain (0-1). */
export function volumeToGain(volume: number): number {
  return Math.max(0, Math.min(15, volume)) / 15;
}

/**
 * Maps the AUDC high nibble onto a synthesizable waveform, following the POKEY
 * datasheet's distortion table:
 *
 * | Bits 7-5 | Datasheet | Here |
 * | --- | --- | --- |
 * | `$00` | 5-bit poly gating 17-bit poly | `poly17` |
 * | `$20` | 5-bit poly only | `poly5` |
 * | `$40` | 5-bit poly gating 4-bit poly | `poly4` |
 * | `$60` | 5-bit poly only | `poly5` |
 * | `$80` | 17-bit poly | `poly17` |
 * | `$a0` | pure tone | `tone` |
 * | `$c0` | 4-bit poly | `poly4` |
 * | `$e0` | pure tone | `tone` |
 *
 * The two gated combinations take the finer poly they gate, since we play one
 * counter per voice rather than gating one with another. Battlezone only ever
 * writes `$a_` and `$c1`, so that approximation is never actually heard.
 */
export function audcDistortion(audc: number): PokeyDistortion {
  switch (audc & 0xe0) {
    case 0xa0:
    case 0xe0:
      return 'tone';
    case 0x40:
    case 0xc0:
      return 'poly4';
    case 0x20:
    case 0x60:
      return 'poly5';
    default:
      return 'poly17';
  }
}

/** Expands a data stream into the register writes it performs, in order. */
export function expandPokeyStream(
  chunks: readonly PokeyChunk[],
  nmiHz: number = NMI_HZ,
): PokeyStep[] {
  const steps: PokeyStep[] = [];
  let ticks = 0;
  for (const chunk of chunks) {
    if ((chunk.value & 0xff) === 0) break;
    for (let i = 0; i < chunk.repetitions; i += 1) {
      steps.push({ value: (chunk.value + i * chunk.increment) & 0xff, time: ticks / nmiHz });
      ticks += chunk.duration;
    }
  }
  return steps;
}

/** Total length of a data stream in seconds, including its final hold. */
export function pokeyStreamDuration(chunks: readonly PokeyChunk[], nmiHz: number = NMI_HZ): number {
  let ticks = 0;
  for (const chunk of chunks) {
    if ((chunk.value & 0xff) === 0) break;
    ticks += chunk.duration * chunk.repetitions;
  }
  return ticks / nmiHz;
}

/** Convenience builder for a stream that holds one value for a while. */
export function hold(value: number, durationTicks: number, repetitions = 1): PokeyChunk {
  return { value, duration: durationTicks, increment: 0, repetitions };
}
