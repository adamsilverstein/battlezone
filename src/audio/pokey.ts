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
export type PokeyDistortion = 'tone' | 'poly4' | 'poly17';

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

/** AUDC is `NNNFVVVV`: the low nibble is volume 0-15. */
export function audcVolume(audc: number): number {
  return audc & 0x0f;
}

/** Maps a POKEY volume (0-15) onto a linear gain (0-1). */
export function volumeToGain(volume: number): number {
  return Math.max(0, Math.min(15, volume)) / 15;
}

/**
 * Maps the AUDC high nibble onto a synthesizable waveform.
 *
 * Per the POKEY datasheet the high bits select $A/$E pure tone, $C 4-bit poly,
 * $8 17-bit poly, and $0/$2/$4/$6 a 5-bit poly gating a second poly. We have no
 * 5-bit-gated noise source, so those combinations collapse onto the finer poly
 * they gate ($0/$4 -> 17-bit, $2/$6 -> 4-bit); Battlezone only ever writes $A_
 * and $C_, so the approximation is never actually heard.
 */
export function audcDistortion(audc: number): PokeyDistortion {
  switch (audc & 0xe0) {
    case 0xa0:
    case 0xe0:
      return 'tone';
    case 0xc0:
      return 'poly4';
    case 0x80:
      return 'poly17';
    case 0x20:
    case 0x60:
      return 'poly4';
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
