/**
 * Turns game events and the per-frame audio snapshot into sound.
 *
 * One-shot sounds go through `channels.ts`, which models the original's
 * one-sound-at-a-time circuits; this module owns the continuous voices (engine,
 * saucer siren, missile buzz) and the event and snapshot mapping.
 *
 * Nothing here touches the DOM: the only outside world is the injected
 * AudioContext factory.
 *
 * Every sound in the reference's audible checklist has a trigger: the world
 * reports the radar blip refresh and the 100,000-point / high-score fanfare as
 * events, and carries the live missile's distance in the snapshot.
 *
 * `AudioSnapshot.enemyInRange` deliberately drives no sound of its own. The
 * reference is explicit that the ROM has no dedicated in-range beep: what players
 * remember as one is the three-boop `enemyInRange` alert plus the recurring
 * `radarPing`.
 *
 * Attract mode is hard-muted in the original. `engineRunning` is false outside
 * play, which stops every continuous sound, but one-shots still sound so the
 * death explosion is heard; the game state machine hard-mutes the attract
 * phases through `setMuted`.
 */

import type { AudioSnapshot, GameEvent } from '../game/types';
import { createChannels, type Channels, type Slot } from './channels';
import { anchorAutomation, createSynth, type Synth, type Voice } from './synth';
import { playCannon } from './sounds/cannon';
import { playCollisionWarble } from './sounds/collisionWarble';
import { playEnemyAlert } from './sounds/enemyAlert';
import { playExplosion } from './sounds/explosion';
import { playExtraLife } from './sounds/extraLife';
import { playMerp } from './sounds/merp';
import { playFanfare } from './sounds/fanfare';
import { playRadarPing } from './sounds/radarPing';
import { playSaucerHit } from './sounds/saucerHit';
import { startEngine, type EngineVoice } from './sounds/engine';
import {
  FAR_SPAWN_DISTANCE,
  buzzVolume,
  startMissileBuzz,
  type MissileBuzzVoice,
} from './sounds/missileBuzz';
import { startSaucerHover, type SaucerHoverVoice } from './sounds/saucerHover';

export interface AudioSystem {
  /** Resumes the context on the first user gesture. Inert before that. */
  unlock(): Promise<void>;
  handle(event: GameEvent): void;
  update(snapshot: AudioSnapshot): void;
  /** The original's hard mute, used for attract mode. */
  setMuted(m: boolean): void;
}

/** Headroom so several voices at once do not clip. */
const MASTER_LEVEL = 0.7;

/** Short fade on mute and unmute, so the mute itself cannot click. */
export const MUTE_RAMP_SECONDS = 0.015;

function defaultContextFactory(): AudioContext {
  const globals = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = globals.AudioContext ?? globals.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not available');
  return new Ctor();
}

export function createAudioSystem(
  ctxFactory: () => AudioContext = defaultContextFactory,
): AudioSystem {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let synth: Synth | null = null;
  let channels: Channels | null = null;
  let muted = false;

  let engine: EngineVoice | null = null;
  let hover: SaucerHoverVoice | null = null;
  let buzz: MissileBuzzVoice | null = null;
  /** End of the current collision warble, so grinding a block cannot retrigger it. */
  let warbleEndsAt = 0;

  /** The synth, or null when muted, locked or the context has gone away. */
  function ready(): Synth | null {
    if (!synth || !ctx || muted) return null;
    return ctx.state === 'closed' ? null : synth;
  }

  function now(): number {
    return ctx ? ctx.currentTime : 0;
  }

  /** Starts a sound on its slot, pausing the siren when it takes channel 1. */
  function play(
    slot: Slot | readonly Slot[],
    make: (synth: Synth, at: number) => Voice,
    at?: number,
  ): Voice | null {
    if (!ready() || !channels) return null;
    const start = at ?? now();
    const voice = channels.play(slot, make, start);
    // The saucer siren is the lowest priority on channel 1 and pauses while
    // anything else uses the channel.
    const takesChannel1 = typeof slot === 'string' ? slot === 'pokey1' : slot.includes('pokey1');
    if (voice && takesChannel1 && hover && Number.isFinite(voice.endTime)) {
      hover.suppress(start, voice.endTime);
    }
    return voice;
  }

  function stopVoice(voice: Voice | null, at: number): void {
    try {
      voice?.stop(at);
    } catch {
      // Nothing to do: the context has gone.
    }
  }

  function stopEngine(at: number): void {
    stopVoice(engine, at);
    engine = null;
  }

  /** A siren that appears mid-effect starts down, since channel 1 is taken. */
  function startHover(active: Synth, at: number): void {
    if (hover) return;
    hover = startSaucerHover(active, at);
    const busyUntil = channels?.busyUntil('pokey1') ?? 0;
    if (busyUntil > at) hover.suppress(at, busyUntil);
  }

  function stopHover(at: number): void {
    stopVoice(hover, at);
    hover = null;
  }

  function stopBuzz(at: number): void {
    stopVoice(buzz, at);
    buzz = null;
  }

  function stopAll(at: number): void {
    channels?.stopAll(at);
    stopEngine(at);
    stopHover(at);
    stopBuzz(at);
    warbleEndsAt = 0;
  }

  function startBuzz(at: number, volume: number): void {
    const active = ready();
    if (!active || buzz) return;
    try {
      buzz = startMissileBuzz(active, at, volume);
    } catch {
      buzz = null;
    }
  }

  /**
   * The collision warble, with the "merp" queued behind it on channel 1. The
   * world reports `motionBlocked` for as long as the tank is against a block, so
   * the warble waits for the previous one to finish rather than restarting every
   * tick. Anything else holding channel 1 is fair game to interrupt: the ROM has
   * no priority handling there beyond the saucer.
   */
  function playCollision(): void {
    const at = now();
    if (at < warbleEndsAt) return;
    const warble = play('pokey1', playCollisionWarble, at);
    if (!warble) return;
    warbleEndsAt = warble.endTime;
    // The reference's channel table and the effect's AUDF1/AUDC1 data both put
    // the merp on channel 1, right behind the warble it answers.
    play('pokey1', playMerp, warble.endTime);
  }

  /**
   * The fanfare is two voices at once, so it holds both POKEY channels, and the
   * reference has a loud ~1 s explosion follow it once it finishes - the 100K and
   * high-score boom.
   */
  function playFanfareAndBoom(): void {
    const fanfare = play(['pokey1', 'pokey2'], playFanfare);
    if (!fanfare) return;
    play('explosion', (s, at) => playExplosion(s, at, true), fanfare.endTime);
  }

  return {
    async unlock(): Promise<void> {
      if (!ctx) {
        try {
          const created = ctxFactory();
          const gain = created.createGain();
          gain.gain.value = muted ? 0 : MASTER_LEVEL;
          gain.connect(created.destination);
          ctx = created;
          master = gain;
          synth = createSynth(created, gain);
          channels = createChannels(synth);
        } catch {
          ctx = null;
          master = null;
          synth = null;
          return;
        }
      }
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        // Autoplay policy or a closed context: the next gesture can try again.
      }
    },

    handle(event: GameEvent): void {
      if (!ready()) return;
      switch (event.type) {
        case 'playerFired':
          play('cannon', (s, at) => playCannon(s, at, true));
          break;
        case 'enemyFired':
          play('cannon', (s, at) => playCannon(s, at, false));
          break;
        case 'shellHitObstacle':
          play('explosion', (s, at) => playExplosion(s, at, false));
          break;
        case 'enemyDestroyed':
          // A dying saucer chirps on channel 1; every other vehicle gets the
          // victim's loud explosion, which drowns the killer's soft one.
          if (event.kind === 'saucer') play('pokey1', playSaucerHit);
          else play('explosion', (s, at) => playExplosion(s, at, true));
          break;
        case 'playerDestroyed':
          play('explosion', (s, at) => playExplosion(s, at, true));
          // The buzz is silenced the moment the missile connects.
          stopBuzz(now());
          break;
        case 'missileLaunched':
          // The frequencies are fixed at creation; update() takes the volume
          // from the missile's distance from the next frame on.
          startBuzz(now(), buzzVolume(FAR_SPAWN_DISTANCE));
          break;
        case 'enemyInRange':
          play('pokey2', playEnemyAlert);
          break;
        case 'extraLife':
          play('pokey2', playExtraLife);
          break;
        case 'radarPing':
          play('pokey2', playRadarPing);
          break;
        case 'fanfare':
          playFanfareAndBoom();
          break;
        case 'motionBlocked':
          playCollision();
          break;
        // The original makes no sound for these.
        case 'shellExpired':
        case 'enemySpawned':
        case 'saucerAppeared':
        case 'saucerLeft':
          break;
      }
    },

    update(snapshot: AudioSnapshot): void {
      const active = ready();
      if (!active) return;
      const at = now();
      try {
        if (snapshot.engineRunning) {
          engine ??= startEngine(active, at);
          engine.setRev(snapshot.moving, at);
        } else {
          stopEngine(at);
        }

        if (snapshot.missileActive) {
          const volume = buzzVolume(snapshot.missileDistance);
          startBuzz(at, volume);
          buzz?.setVolume(volume, at);
        } else {
          stopBuzz(at);
        }

        if (snapshot.saucerActive) startHover(active, at);
        else stopHover(at);
      } catch {
        // Never let audio break a frame.
      }
    },

    // Attract mode's hard mute is the state machine's call; nothing here infers it.
    setMuted(m: boolean): void {
      muted = m;
      if (!ctx || !master) return;
      const at = now();
      // Fade rather than flip, and let the voices ring out over the fade.
      if (m) stopAll(at + MUTE_RAMP_SECONDS);
      try {
        anchorAutomation(master.gain, at);
        master.gain.linearRampToValueAtTime(m ? 0 : MASTER_LEVEL, at + MUTE_RAMP_SECONDS);
      } catch {
        // The context has gone; nothing left to mute.
      }
    },
  };
}
