/**
 * 1812 Overture fanfare - POKEY effect $80, played on channels 1 and 2 at
 * 100,000 points and at high-score entry.
 *
 * Reference section 5: AUDF1 plays "$d9, $a2, $90, $80, $90, $a2, $90, $80(x2),
 * $a2(x4)" and AUDF2 "$6c, $51, $48, $40, $48, $51, $48, $40(x2), $51(x4)" at 48
 * ticks each, with AUDC1/AUDC2 = $a7 for 13 steps. The two voices are an octave
 * apart, and the divider maths detunes them very slightly, which is the harmony
 * the reference describes.
 */

import { hold, type PokeyChunk } from '../pokey';
import type { Synth, Voice } from '../synth';

const NOTE_TICKS = 48;
const VOICE1 = [0xd9, 0xa2, 0x90, 0x80, 0x90, 0xa2, 0x90, 0x80, 0x80, 0xa2, 0xa2, 0xa2, 0xa2];
const VOICE2 = [0x6c, 0x51, 0x48, 0x40, 0x48, 0x51, 0x48, 0x40, 0x40, 0x51, 0x51, 0x51, 0x51];
const AUDC: PokeyChunk[] = [hold(0xa7, NOTE_TICKS, VOICE1.length)];

function notes(values: readonly number[]): PokeyChunk[] {
  return values.map((value) => hold(value, NOTE_TICKS));
}

/** Plays both halves of the fanfare; stopping it stops both channels. */
export function playFanfare(synth: Synth, at: number): Voice {
  const channel1 = synth.pokeyVoice({ audf: notes(VOICE1), audc: AUDC, at });
  const channel2 = synth.pokeyVoice({ audf: notes(VOICE2), audc: AUDC, at });
  return {
    endTime: Math.max(channel1.endTime, channel2.endTime),
    stop(when?: number) {
      channel1.stop(when);
      channel2.stop(when);
    },
  };
}
