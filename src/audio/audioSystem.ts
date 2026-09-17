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
  /**
   * Resumes the context on a user gesture, and reports whether it is now running.
   * A browser can refuse the first gesture - a keydown that is part of a chord, a
   * page that is not yet visible - so a caller has to wait for a true here rather
   * than for the first call.
   *
   * It is also the way back from an audio device that has failed mid-game, so it
   * is meant to be called on every gesture for the life of the page, not only
   * until the first one succeeds. A gesture while sound is already running costs
   * a single property read.
   */
  unlock(): Promise<boolean>;
  handle(event: GameEvent): void;
  update(snapshot: AudioSnapshot): void;
  /** The original's hard mute, used for attract mode. */
  setMuted(m: boolean): void;
}

/** Headroom so several voices at once do not clip. */
const MASTER_LEVEL = 0.55;

/**
 * The output stage, which stands where the cabinet's amplifier stood.
 *
 * A lone tank idling in an empty field peaks around 0.67 of full scale, which is
 * where a mix wants to sit. The trouble is everything at once - engine, saucer
 * siren, missile buzz, a shot and the explosion answering it - which stacks to
 * around 3.3 times the loudest single voice and asks the browser for 2.3 of full
 * scale. The browser answers by hard-clipping every sample over 1, flat tops and
 * all, which is the harshest sound a digital mixer can make and was a third of
 * the samples in a busy minute.
 *
 * Trimming the master instead would fix the stack by making the ordinary game
 * too quiet, so the loud moments are held back only while they last: a limiter
 * that ignores anything under LIMIT_THRESHOLD_DB and leans on what is over it,
 * fast enough to catch an explosion's attack and slow enough not to pump on the
 * engine. The soft clip behind it is the safety net, a smooth curve where the
 * browser's own ceiling is a corner, so a transient that outruns the limiter's
 * attack bends instead of shattering.
 */
const LIMIT_THRESHOLD_DB = -8;
const LIMIT_KNEE_DB = 6;
const LIMIT_RATIO = 6;
const LIMIT_ATTACK_SECONDS = 0.004;
const LIMIT_RELEASE_SECONDS = 0.2;

/** Where the soft clip stops being a straight line, in linear amplitude. */
const SOFT_CLIP_LINEAR = 0.7;
const SOFT_CLIP_SAMPLES = 2048;

/**
 * A curve that passes everything under SOFT_CLIP_LINEAR through untouched and
 * bends the rest towards 1 along a tanh, meeting the straight part with the same
 * slope so the join itself adds nothing.
 */
export function softClipCurve(samples = SOFT_CLIP_SAMPLES): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const knee = 1 - SOFT_CLIP_LINEAR;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    curve[i] =
      magnitude <= SOFT_CLIP_LINEAR
        ? x
        : Math.sign(x) *
          (SOFT_CLIP_LINEAR + knee * Math.tanh((magnitude - SOFT_CLIP_LINEAR) / knee));
  }
  return curve;
}

/**
 * Wires the master gain to the destination through the output stage, and answers
 * with the node the mix should arrive at.
 *
 * A context that cannot build either node - an older browser, a test double -
 * still gets its sound, straight through, since a missing limiter is quieter
 * trouble than no audio at all.
 */
function connectOutputStage(created: AudioContext, gain: GainNode): void {
  let tail: AudioNode = gain;
  try {
    const limiter = created.createDynamicsCompressor();
    limiter.threshold.value = LIMIT_THRESHOLD_DB;
    limiter.knee.value = LIMIT_KNEE_DB;
    limiter.ratio.value = LIMIT_RATIO;
    limiter.attack.value = LIMIT_ATTACK_SECONDS;
    limiter.release.value = LIMIT_RELEASE_SECONDS;
    tail.connect(limiter);
    tail = limiter;
  } catch {
    // No compressor here; the soft clip alone still keeps the peaks honest.
  }
  try {
    const shaper = created.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '4x';
    tail.connect(shaper);
    tail = shaper;
  } catch {
    // No shaper either: the browser's own ceiling is all that is left.
  }
  tail.connect(created.destination);
}

/** Short fade on mute and unmute, so the mute itself cannot click. */
export const MUTE_RAMP_SECONDS = 0.015;

/**
 * How many times a context the audio device has killed is replaced before the
 * game stops asking for sound.
 *
 * A device that fails once usually fails again the same way - a machine with no
 * working output device, a sandboxed browser, an audio service that will not
 * start - and every attempt costs the player another browser error in the
 * console, so the budget is small. A genuinely transient failure, the common one
 * being an output device that was unplugged or switched, is back on the first
 * replacement.
 */
export const MAX_DEVICE_RECOVERIES = 2;

/**
 * How much audio a context has to have rendered before its death is treated as
 * something worth recovering from.
 *
 * A context that dies with its clock still near zero never had a device at all -
 * a machine with no output, a browser that will not open one - and building
 * another only makes the browser log the same error again. A context that had
 * been playing for a while lost a device that was really there, which is the
 * case worth a second go.
 */
export const MIN_WORKING_SECONDS = 1;

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

  /** Set when the context has told us the audio device or the renderer gave up. */
  let deviceFailed = false;
  /** How many contexts the device has taken from us so far. */
  let deviceLosses = 0;
  /** Set when a failure looked permanent, so no replacement is worth building. */
  let deviceHopeless = false;

  /** The synth, or null when muted, locked or the context has gone away. */
  function ready(): Synth | null {
    // A context the device has killed renders nothing ever again, and its clock
    // has stopped: every node and automation event aimed at it would be stamped
    // with that one instant and pile up there for nobody. A context that is
    // merely suspended is still worth building into - it has a clock that will
    // move again, and an OfflineAudioContext is suspended for the whole of the
    // scheduling it exists to receive.
    if (!synth || !ctx || muted || deviceFailed) return null;
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
   * A browser answers an audio device or renderer failure by firing `error` on
   * the context and leaving it suspended with its clock stopped - Chrome also
   * logs "The AudioContext encountered an error from the audio device or the
   * WebAudio renderer". Nothing revives that context: `resume()` resolves and it
   * still renders nothing, so the only way back is to build a new one.
   */
  function watchForDeviceFailure(created: AudioContext): void {
    try {
      created.addEventListener('error', () => {
        deviceFailed = true;
        // The clock is the only honest report of whether this context was ever
        // working: it only advances while audio is really being rendered.
        if (created.currentTime < MIN_WORKING_SECONDS) deviceHopeless = true;
      });
    } catch {
      // A context with no event target to listen on; it just cannot be watched.
    }
  }

  /** Lets go of a context the device has killed, its whole graph with it. */
  function discardContext(): void {
    const dying = ctx;
    ctx = null;
    master = null;
    synth = null;
    channels = null;
    // The voices belong to the dead graph; there is nothing left to stop.
    engine = null;
    hover = null;
    buzz = null;
    warbleEndsAt = 0;
    deviceFailed = false;
    deviceLosses += 1;
    try {
      void dying?.close().catch(() => {
        // Already closing, or closed underneath us.
      });
    } catch {
      // A context too broken to close: dropping the reference is enough.
    }
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
    async unlock(): Promise<boolean> {
      // The overwhelmingly common case: sound is running and this is just one of
      // the hundreds of gestures a player makes during a game.
      if (ctx && !deviceFailed && ctx.state === 'running') return true;
      if (ctx && deviceFailed) discardContext();
      if (!ctx && (deviceHopeless || deviceLosses > MAX_DEVICE_RECOVERIES)) return false;
      if (!ctx) {
        try {
          const created = ctxFactory();
          const gain = created.createGain();
          gain.gain.value = muted ? 0 : MASTER_LEVEL;
          connectOutputStage(created, gain);
          ctx = created;
          master = gain;
          synth = createSynth(created, gain);
          channels = createChannels(synth);
          watchForDeviceFailure(created);
        } catch {
          ctx = null;
          master = null;
          synth = null;
          channels = null;
          return false;
        }
      }
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        // Autoplay policy or a closed context: the next gesture can try again.
      }
      return ctx.state === 'running';
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
      // Re-muting an already muted system would start a fresh fade and stop the
      // voices again every tick, so an unchanged value is not an event.
      if (m === muted) return;
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
