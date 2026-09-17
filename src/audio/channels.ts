/**
 * The original's mixer, modelled as slots.
 *
 * POKEY channels 1 and 2 and each discrete one-shot circuit can only make one
 * sound at a time, so starting a sound on a slot cuts off whatever that slot was
 * playing. That is what produces the reference's stomping behaviour - the radar
 * ping cutting off the new-enemy alert boops, both being channel 2 with no
 * priority handling - and it caps the number of simultaneous voices at one per
 * slot with no separate voice pool.
 */

import type { Synth, Voice } from './synth';

/**
 * One slot per one-shot circuit: POKEY channels 1 and 2 and the two discrete
 * one-shots. The continuous voices - the engine, the saucer siren and the missile
 * buzz on POKEY channels 3 and 4 - are owned by the audio system instead.
 */
export type Slot = 'pokey1' | 'pokey2' | 'cannon' | 'explosion';

export interface Channels {
  /**
   * Starts a voice on one slot, or several for a sound that spans channels, and
   * returns it. Null when the synth refused, e.g. a closed context.
   */
  play(
    slot: Slot | readonly Slot[],
    make: (synth: Synth, at: number) => Voice,
    at: number,
  ): Voice | null;
  /** Context time this slot stops sounding, or 0 when it is free. */
  busyUntil(slot: Slot): number;
  stopAll(at: number): void;
}

export function createChannels(synth: Synth): Channels {
  const slots = new Map<Slot, Voice>();

  function stopVoice(voice: Voice | undefined, at: number): void {
    try {
      voice?.stop(at);
    } catch {
      // Nothing to do: the context has gone.
    }
  }

  return {
    play(slot, make, at) {
      const claimed = typeof slot === 'string' ? [slot] : slot;
      try {
        for (const claim of claimed) stopVoice(slots.get(claim), at);
        const voice = make(synth, at);
        for (const claim of claimed) slots.set(claim, voice);
        return voice;
      } catch {
        // The context is closed or out of resources; stay silent.
        return null;
      }
    },

    busyUntil(slot) {
      const voice = slots.get(slot);
      if (!voice || !Number.isFinite(voice.endTime)) return 0;
      return voice.endTime;
    },

    stopAll(at) {
      for (const voice of slots.values()) stopVoice(voice, at);
      slots.clear();
    },
  };
}
