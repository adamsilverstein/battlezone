/**
 * Shared simulation types. These are the contract between the world,
 * renderer, audio and game state machine; see the design spec section 4.2.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export type EnemyKind = 'tank' | 'supertank' | 'missile' | 'saucer';
/** The ROM's four obstacle shapes; each name is also the key of its model in data/models.ts. */
export type ObstacleKind = 'pyramid' | 'pyramidWide' | 'box' | 'boxShort';

/** Ground-plane position. +Z is "forward" at heading 0. */
export interface Vec2 {
  x: number;
  z: number;
}

export interface Player {
  pos: Vec2;
  /** Heading in radians, 0 = +Z, increasing clockwise when viewed from above. */
  heading: number;
  /** Treads engaged this tick (engine sound rises). */
  moving: boolean;
  turning: boolean;
  alive: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  heading: number;
  /** For missile: height above ground; for saucer: hover height. Tanks: 0. */
  y: number;
  alive: boolean;
  /** AI-specific state name, for tests and debugging. */
  state: string;
  /** Ticks remaining in the current state. */
  timer: number;
}

export interface Shell {
  id: number;
  owner: 'player' | 'enemy';
  pos: Vec2;
  y: number;
  heading: number;
  ticksLeft: number;
}

export interface Obstacle {
  kind: ObstacleKind;
  pos: Vec2;
  /** Yaw in radians, same convention as Player.heading (the ROM layout gives each obstacle an orientation). */
  heading: number;
  radius: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Debris {
  /** Key into data/models. */
  model: string;
  pos: Vec2;
  y: number;
  vel: Vec3;
  rot: Vec3;
  spin: Vec3;
  ticksLeft: number;
}

export interface World {
  tick: number;
  player: Player;
  enemies: Enemy[];
  shells: Shell[];
  obstacles: Obstacle[];
  debris: Debris[];
  /** Radar sweep angle in radians. */
  radarAngle: number;
  enemyInRange: boolean;
  /** Reticle switches to the "locked" picture. */
  targetInSights: boolean;
  score: number;
  lives: number;
  nextBonusAt: number | null;
}

export type GameEvent =
  | { type: 'playerFired' }
  | { type: 'enemyFired' }
  | { type: 'shellHitObstacle' }
  | { type: 'shellExpired' }
  | { type: 'enemyDestroyed'; kind: EnemyKind; points: number }
  | { type: 'playerDestroyed'; by: EnemyKind }
  | { type: 'enemySpawned'; kind: EnemyKind }
  | { type: 'missileLaunched' }
  | { type: 'saucerAppeared' }
  | { type: 'saucerLeft' }
  /** Fired once when the alert starts. */
  | { type: 'enemyInRange' }
  | { type: 'extraLife' }
  /** Nine-note 1812 Overture: at the 100,000-point bonus and at high-score entry. */
  | { type: 'fanfare' }
  /** Radar blip refreshed at full intensity (once per sweep pass over the enemy). */
  | { type: 'radarPing' }
  /** Player drove into an obstacle. */
  | { type: 'motionBlocked' };

export type GamePhase =
  | 'attractTitle'
  | 'attractHighScores'
  | 'attractDemo'
  | 'playing'
  | 'playerDead'
  | 'gameOver'
  | 'highScoreEntry';

export interface HighScoreEntry {
  initials: string;
  score: number;
}

export interface GameState {
  phase: GamePhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  world: World;
  highScores: HighScoreEntry[];
  entry?: { initials: string; cursor: number; score: number };
  /** Overlay text such as 'GAME OVER'. */
  message?: string;
}

/** Continuous state the audio system needs every frame. */
export interface AudioSnapshot {
  /** True while playing (idle rumble). */
  engineRunning: boolean;
  /** Treads engaged: rumble pitch rises. */
  moving: boolean;
  /** An enemy unit is within alert range (drives the ENEMY IN RANGE text; the original has no dedicated in-range beep). */
  enemyInRange: boolean;
  /** Missile whine while a missile is alive. */
  missileActive: boolean;
  /** Saucer warble while a saucer is alive. */
  saucerActive: boolean;
  /** Distance from player to the live missile in world units, or null when none; scales the buzz. */
  missileDistance: number | null;
}
