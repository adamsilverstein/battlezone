/**
 * Turns game events and the per-frame audio snapshot into sound.
 *
 * The original's mixer is four POKEY channels plus a handful of discrete
 * circuits, each of which can only make one sound at a time, so this module
 * models the same fixed set of slots: starting a sound on a slot cuts off
 * whatever was there. That reproduces the reference's stomping behaviour (the
 * radar ping cutting off the new-enemy alert, the saucer siren pausing for
 * anything else on channel 1) and caps the number of simultaneous voices at one
 * per slot by construction.
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
import { createSynth, type Synth, type Voice } from './synth';
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
import { startMissileBuzz, type MissileBuzzVoice } from './sounds/missileBuzz';
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

/** Missiles spawn at the far distance ($5fff), which is where the buzz starts. */
const FAR_SPAWN_DISTANCE = 0x5fff;

/**
 * AUDC3/AUDC4 come from the missile's distance high byte: shifted right 3,
 * masked to 0-15 and inverted, so nearer is louder, and silent once bit 7 of the
 * high byte is set, meaning too far to hear (reference section 5, "Missile
 * buzz"). At the far spawn distance that lands on volume 4; at zero distance, 15.
 */
function buzzVolume(distance: number | null): number {
  if (distance === null) return 0;
  const high = Math.floor(Math.max(0, distance) / 256);
  if ((high & 0x80) !== 0) return 0;
  return 15 - ((high >> 3) & 0x0f);
}

/**
 * One slot per one-shot circuit: POKEY channels 1 and 2 and the two discrete
 * one-shots. The continuous voices - the engine, the saucer siren and the
 * missile buzz on POKEY channels 3 and 4 - are held on their own.
 */
type Slot = 'pokey1' | 'pokey2' | 'cannon' | 'explosion';

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
  let muted = false;

  const slots = new Map<Slot, Voice>();
  let engine: EngineVoice | null = null;
  let hover: SaucerHoverVoice | null = null;
  let buzz: MissileBuzzVoice | null = null;

  /** The synth, or null when muted, locked or the context has gone away. */
  function ready(): Synth | null {
    if (!synth || !ctx || muted) return null;
    return ctx.state === 'closed' ? null : synth;
  }

  function now(): number {
    return ctx ? ctx.currentTime : 0;
  }

  function isBusy(slot: Slot, at: number): boolean {
    const voice = slots.get(slot);
    return voice !== undefined && voice.endTime > at;
  }

  /**
   * Starts a sound on its slot (or slots, for the two-channel fanfare), cutting
   * off whatever those slots were playing.
   */
  function play(
    slot: Slot | readonly Slot[],
    make: (synth: Synth, at: number) => Voice,
    at?: number,
  ): Voice | null {
    const active = ready();
    if (!active) return null;
    const start = at ?? now();
    const claimed = typeof slot === 'string' ? [slot] : slot;
    try {
      for (const claim of claimed) slots.get(claim)?.stop(start);
      const voice = make(active, start);
      for (const claim of claimed) slots.set(claim, voice);
      // The saucer siren is the lowest priority on channel 1 and pauses while
      // anything else uses the channel.
      if (claimed.includes('pokey1') && hover && Number.isFinite(voice.endTime)) {
        hover.suppress(start, voice.endTime);
      }
      return voice;
    } catch {
      // The context is closed or out of resources; stay silent.
      return null;
    }
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

  function stopHover(at: number): void {
    stopVoice(hover, at);
    hover = null;
  }

  function stopBuzz(at: number): void {
    stopVoice(buzz, at);
    buzz = null;
  }

  function stopAll(at: number): void {
    for (const voice of slots.values()) stopVoice(voice, at);
    slots.clear();
    stopEngine(at);
    stopHover(at);
    stopBuzz(at);
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

  /** The collision warble, with the "merp" queued behind it on channel 2. */
  function playCollision(): void {
    const at = now();
    if (isBusy('pokey1', at)) return;
    const warble = play('pokey1', playCollisionWarble, at);
    if (warble) play('pokey2', playMerp, warble.endTime);
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
          // The fanfare is two voices at once, so it holds both channels.
          play(['pokey1', 'pokey2'], playFanfare);
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

        if (snapshot.saucerActive) hover ??= startSaucerHover(active, at);
        else stopHover(at);
      } catch {
        // Never let audio break a frame.
      }
    },

    // Attract mode's hard mute is the state machine's call; nothing here infers it.
    setMuted(m: boolean): void {
      muted = m;
      if (!ctx || !master) return;
      if (m) stopAll(now());
      try {
        master.gain.value = m ? 0 : MASTER_LEVEL;
      } catch {
        // The context has gone; nothing left to mute.
      }
    },
  };
}
