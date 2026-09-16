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
 * Three things in the reference's audible checklist cannot be driven from the
 * current contract in `src/game/types.ts`:
 *
 * - The nine-note 1812 Overture fanfare (POKEY $80) fires at 100,000 points and
 *   at high-score entry. No `GameEvent` reports either, so `sounds/fanfare.ts`
 *   is implemented and tested but nothing triggers it yet.
 * - The radar ping fires as the sweep passes an enemy blip. The snapshot has no
 *   radar angle, so we ping on the sweep period while `enemyInRange` holds.
 * - The missile buzz is attenuated by the missile's distance. The snapshot has
 *   no distance, so the buzz sits at a fixed mid volume.
 *
 * Attract mode is hard-muted in the original. `engineRunning` is false outside
 * play, which stops every continuous sound, but one-shots still sound so the
 * death explosion is heard; the game state machine is expected to call
 * `setMuted(true)` for the attract phases.
 */

import type { AudioSnapshot, GameEvent } from '../game/types';
import { createSynth, type Synth, type Voice } from './synth';
import { playCannon } from './sounds/cannon';
import { playCollisionWarble } from './sounds/collisionWarble';
import { playEnemyAlert } from './sounds/enemyAlert';
import { playExplosion } from './sounds/explosion';
import { playExtraLife } from './sounds/extraLife';
import { playMerp } from './sounds/merp';
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

/**
 * The radar sweep turns $0b per game frame, one revolution in 23 game frames at
 * 15.625 Hz, and the ping fires as the sweep passes an enemy blip (reference
 * section 1, "Radar"). The audio snapshot has no radar angle, so we ping on that
 * period for as long as an enemy is in range.
 */
const RADAR_SWEEP_SECONDS = 23 / 15.625;

/**
 * The original scales the buzz by the missile's distance (nearer is louder).
 * `AudioSnapshot` carries no distance, so the buzz sits at mid volume until it
 * does.
 */
const MISSILE_VOLUME = 9;

/** One slot per sound circuit in the original. */
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
  let nextPingTime = 0;

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

  /** Starts a sound on its slot, cutting off whatever the slot was playing. */
  function play(slot: Slot, make: (synth: Synth, at: number) => Voice, at?: number): Voice | null {
    const active = ready();
    if (!active) return null;
    const start = at ?? now();
    try {
      slots.get(slot)?.stop(start);
      const voice = make(active, start);
      slots.set(slot, voice);
      // The saucer siren is the lowest priority on channel 1 and pauses while
      // anything else uses the channel.
      if (slot === 'pokey1' && hover && Number.isFinite(voice.endTime)) {
        hover.suppress(start, voice.endTime);
      }
      return voice;
    } catch {
      // The context is closed or out of resources; stay silent.
      return null;
    }
  }

  function stopVoice(voice: Voice | null, at: number): null {
    try {
      voice?.stop(at);
    } catch {
      // Nothing to do: the context has gone.
    }
    return null;
  }

  function stopAll(at: number): void {
    for (const voice of slots.values()) stopVoice(voice, at);
    slots.clear();
    engine = stopVoice(engine, at) as EngineVoice | null;
    hover = stopVoice(hover, at) as SaucerHoverVoice | null;
    buzz = stopVoice(buzz, at) as MissileBuzzVoice | null;
    nextPingTime = 0;
  }

  function startBuzz(at: number): void {
    const active = ready();
    if (!active || buzz) return;
    try {
      buzz = startMissileBuzz(active, at, MISSILE_VOLUME);
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
          buzz = stopVoice(buzz, now()) as MissileBuzzVoice | null;
          break;
        case 'missileLaunched':
          startBuzz(now());
          break;
        case 'enemyInRange':
          play('pokey2', playEnemyAlert);
          break;
        case 'extraLife':
          play('pokey2', playExtraLife);
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
          engine = stopVoice(engine, at) as EngineVoice | null;
        }

        if (snapshot.enemyInRange) {
          if (at >= nextPingTime) {
            play('pokey2', playRadarPing, at);
            nextPingTime = at + RADAR_SWEEP_SECONDS;
          }
        } else {
          nextPingTime = 0;
        }

        if (snapshot.missileActive) startBuzz(at);
        else buzz = stopVoice(buzz, at) as MissileBuzzVoice | null;

        if (snapshot.saucerActive) hover ??= startSaucerHover(active, at);
        else hover = stopVoice(hover, at) as SaucerHoverVoice | null;
      } catch {
        // Never let audio break a frame.
      }
    },

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
