# Battlezone (1980) recreation - design spec

Date: 2026-09-16

## 1. Goal

Build a browser recreation of Atari's original 1980 arcade Battlezone that
matches the arcade game as closely as practical: the same first-person
wireframe battlefield, the same enemies and behaviours, the same HUD (radar,
reticle, score, reserve tanks, ENEMY IN RANGE), the same attract mode, death
sequence, game over, high score table and initials entry, and synthesized
versions of the original sounds. It is playable with a Bluetooth or USB
gamepad using the cabinet's two-stick tread control scheme, with a keyboard
fallback for development and testing.

Non-goals (explicitly excluded, "stick to the original"):

- No features from later versions or ports (no Atari 2600 / Atari ST / PC
  extras, no 1998 Activision content, no power-ups, levels, menus, difficulty
  selectors, mouse look, textures or colour beyond the arcade overlay).
- No online leaderboards, accounts, analytics or ads. High scores persist in
  the browser's localStorage only, like the cabinet's battery-free RAM
  (which lost scores on power off; we keep them, which is the one deviation).
- No mobile touch controls.

## 2. Source material

- Original 6502 assembly source (Atari, Ed Rotberg 1979-80):
  https://github.com/historicalsource/battlezone . Vector shapes, the font,
  the mountain range, gameplay constants and sound routines are extracted
  from it into `src/data/*` (see section 6). Notes on how the original works
  are in `docs/reference/atari-source-notes.md`.
- Gameplay and presentation facts with citations:
  `docs/reference/original-game.md`.
- MobyGames arcade screenshots (the reference given by the project owner):
  https://www.mobygames.com/game/360/battlezone/screenshots/
- A hobby JavaScript port (https://github.com/061375/Battlezone) was looked
  at for its radar/HUD layering approach only; its meshes and MP3 assets are
  not faithful and are not reused.

## 3. Tech stack (decision)

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | Several agents build modules in parallel; shared typed interfaces keep them compatible. |
| Build / dev server | Vite | Zero-config ES modules, instant reload, static build for GitHub Pages. |
| Rendering | HTML5 Canvas 2D, lines only | The original is a vector display; every visible thing is a line. Canvas 2D `stroke()` with a glow pass is enough and keeps the code small. WebGL is not needed at this line count. |
| Audio | Web Audio API, synthesized in code | The original used a POKEY chip plus discrete noise circuits. Synthesizing from oscillators, noise buffers and filters is more faithful than sampled MP3s and needs no assets. |
| Controller | Gamepad API | Native browser API, works with Bluetooth and USB pads (Xbox, PlayStation, 8BitDo, etc.). |
| Tests | Vitest (unit), Playwright (one smoke test) | Simulation logic is pure and deterministic, so it is unit tested without a browser. One Playwright test boots the built page and asserts the game reaches attract mode without console errors. |
| Lint / format | ESLint (typescript-eslint) + Prettier | Enforced in CI. |
| CI / deploy | GitHub Actions: lint, typecheck, test, build on every PR; deploy to GitHub Pages on main | The playable game is public at the Pages URL. |
| Runtime dependencies | None | The whole game is hand-written; no engine or framework. |

Node 20 (`.nvmrc`). All game code lives under `src/`, tests under `test/`.

## 4. Architecture

Deterministic simulation, separate from rendering and I/O:

```
 Gamepad/Keyboard ──► InputState ──┐
                                   ▼
        ┌──────────────── Game (state machine) ────────────────┐
        │  attract → playing → playerDead → gameOver → hiScore  │
        │                 │                                     │
        │                 ▼                                     │
        │          World.update(dt, input, rng) → GameEvent[]   │
        └─────────────┬──────────────────────────┬─────────────┘
                      ▼                          ▼
              Renderer (Scene + HUD)        AudioSystem
                      ▼
               VectorDisplay (canvas)
```

- **Fixed timestep.** The simulation advances in fixed ticks
  (`TICK_HZ`, taken from the original's frame rate in `constants.ts`).
  Rendering runs on `requestAnimationFrame` and draws the latest world
  state. No interpolation; the original did not interpolate either.
- **Determinism.** `World.update` takes a seeded random source
  (`Rng`), never calls `Math.random`, `Date` or DOM APIs. This makes AI,
  spawning and collisions unit testable and makes attract-mode demo play
  reproducible.
- **Events, not callbacks.** Each update returns a list of `GameEvent`
  values. Audio, HUD flashes and the state machine react to events. The
  world never knows about sound or canvas.
- **One responsibility per file.** Files should stay under roughly 300
  lines; split by behaviour (enemy tank AI, missile AI, radar drawing), not
  by layer.

### 4.1 Module map

```
src/
  main.ts                 boot: canvas, input, audio, game, loop
  engine/
    loop.ts               fixed-step tick + rAF render loop
    math.ts               vec2/vec3 helpers, angle wrap, lerp, distance
    rng.ts                seeded PRNG (mulberry32) implementing Rng
  data/                   extracted original data (see section 6)
    types.ts  models.ts  mountains.ts  font.ts  pictures.ts  constants.ts
  render/
    vectorDisplay.ts      "beam" API on a canvas: moveTo/lineTo in original
                          vector coordinates, intensity, glow, letterboxing,
                          arcade colour overlay
    text.ts               draws strings with data/font.ts glyphs
    camera.ts             world → view → screen projection, near clipping
    scene.ts              horizon, mountains, volcano, moon, world objects,
                          shells, debris, screen crack
    hud.ts                radar, reticle, score, high score, reserve tanks,
                          ENEMY IN RANGE, messages
    renderer.ts           composes scene + hud for a given GameState
  game/
    types.ts              World, entities, GameEvent, InputState, Rng
    world.ts              owns entity lists; update() orchestrates systems
    player.ts             tread kinematics, heading, obstacle blocking
    shells.ts             player and enemy shells: flight, range, collision
    obstacles.ts          pyramid/cube field: placement, collision helpers
    spawn.ts              when and where enemies, missiles, saucers appear
    enemies/
      tank.ts             slow tank AI
      supertank.ts        supertank AI
      missile.ts          guided missile ("buzz bomb") AI incl. hop
      saucer.ts           saucer wander
    explosions.ts         debris pieces, timers, eruption particles
    score.ts              scoring, bonus tanks
    highScores.ts         table, insert, initials entry logic, persistence
    game.ts               top-level state machine (attract/play/death/over)
    attract.ts            attract-mode sequencing and demo autopilot
  input/
    types.ts              InputState
    gamepad.ts            Gamepad API → InputState
    keyboard.ts           keyboard → InputState
    input.ts              merges sources, edge detection for fire/start
  audio/
    audioSystem.ts        consumes GameEvents + continuous state
    synth.ts              oscillator/noise/envelope building blocks
    sounds/*.ts           one file per sound
```

### 4.2 Shared interfaces (contract between agents)

These types live in `src/game/types.ts` and `src/input/types.ts` and are
the interface every task must use. Names are fixed.

```ts
// input/types.ts
export interface InputState {
  /** Left tread stick: -1 back, 0 neutral, +1 forward (digital like the cabinet). */
  leftTread: -1 | 0 | 1;
  /** Right tread stick: -1 back, 0 neutral, +1 forward. */
  rightTread: -1 | 0 | 1;
  /** Fire button held. */
  fire: boolean;
  /** Fire pressed this tick (edge). */
  firePressed: boolean;
  /** Start (1-player) pressed this tick (edge). */
  startPressed: boolean;
  /** Any input activity this tick, used to wake attract mode. */
  anyActivity: boolean;
}

// game/types.ts
export interface Rng { next(): number /* [0,1) */; int(maxExclusive: number): number; }

export type EnemyKind = 'tank' | 'supertank' | 'missile' | 'saucer';
export type ObstacleKind = 'pyramid' | 'cube' | 'tallCube' | 'wideCube';

export interface Vec2 { x: number; z: number }

export interface Player {
  pos: Vec2;
  /** Heading in radians, 0 = +Z, increasing clockwise when viewed from above. */
  heading: number;
  moving: boolean;          // for engine sound
  turning: boolean;
  alive: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  heading: number;
  /** For missile: height above ground; for saucer: hover height. */
  y: number;
  alive: boolean;
  state: string;            // AI-specific state name, for tests and debugging
  timer: number;            // ticks remaining in current state
}

export interface Shell {
  id: number;
  owner: 'player' | 'enemy';
  pos: Vec2;
  y: number;
  heading: number;
  ticksLeft: number;
}

export interface Obstacle { kind: ObstacleKind; pos: Vec2; radius: number }

export interface Debris {
  model: string;            // key into data/models
  pos: Vec2; y: number; vel: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number }; spin: { x: number; y: number; z: number };
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
  targetInSights: boolean;  // reticle switches to the "locked" picture
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
  | { type: 'enemyInRange' }          // fired once when the alert starts
  | { type: 'extraLife' }
  | { type: 'motionBlocked' };        // player drove into an obstacle

export type GamePhase =
  | 'attractTitle' | 'attractHighScores' | 'attractDemo'
  | 'playing' | 'playerDead' | 'gameOver' | 'highScoreEntry';

export interface GameState {
  phase: GamePhase;
  phaseTicks: number;       // ticks spent in the current phase
  world: World;
  highScores: HighScoreEntry[];
  entry?: { initials: string; cursor: number; score: number };
  message?: string;         // e.g. 'GAME OVER' overlay text
}

export interface HighScoreEntry { initials: string; score: number }
```

The audio system additionally receives a per-frame snapshot:

```ts
export interface AudioSnapshot {
  engineRunning: boolean;   // true while playing (idle rumble)
  moving: boolean;          // treads engaged: rumble pitch rises
  enemyInRange: boolean;    // repeating alert beep while true
  missileActive: boolean;   // missile whine while a missile is alive
  saucerActive: boolean;    // saucer warble while a saucer is alive
}
```

## 5. Gameplay behaviour (what "faithful" means here)

Numbers come from `src/data/constants.ts`, which cites the original source
line for each value. This section describes behaviour; do not invent
values that the constants module already defines.

### 5.1 Player tank

- Two treads. Both forward: drive straight. Both back: reverse. One forward,
  one neutral: gentle turn while moving. One forward, one back: pivot in
  place. The cabinet sticks are digital 2-way, so analog sticks are
  quantised with a dead zone.
- Driving into an obstacle stops the tank (the original blocks motion; the
  tank does not slide). Obstacles are indestructible.
- One player shell in flight at a time. Fire is ignored while a shell is
  live. The shell travels straight along the heading at shell speed until
  it hits something or its lifetime expires.
- The player has no visible body; the view is the periscope.

### 5.2 Enemies

- **Slow tank** (1,000 points). Spawns at a distance, approaches, tries to
  line up on the player, fires when roughly aimed and within range. It
  turns to keep facing the player and can be out-turned. Shells from either
  side are blocked by obstacles.
- **Supertank** (3,000). Appears once the score passes the threshold in
  constants. Faster, turns quicker, fires more readily, and dodges: when
  the player fires, it may sidestep.
- **Missile** (2,000, "buzz bomb" in the source). Launched from the horizon
  toward the player after the score threshold, flies low and fast, zigzags
  as it approaches, and hops over obstacles in its path. Must be shot
  before it arrives or it destroys the player.
- **Saucer** (5,000). Wanders the battlefield, does not attack, does not
  show on radar, makes its own sound. Leaves after a while. Enemy tank
  shells can also destroy it (no points then).
- At most one tank-type enemy (tank / supertank / missile) is alive at a
  time; a saucer may overlap. After an enemy is destroyed the next one
  spawns after the delay in constants. Difficulty ramps by score as the
  original does (enemy type mix and aggression; see source notes).

### 5.3 Battlefield

- Flat infinite plane. The horizon shows the mountain range, an erupting
  volcano (dots ejected in arcs) and a crescent moon, all scrolling with
  the player's heading and never getting closer.
- A fixed layout of pyramids and cubes (from constants/obstacle table)
  around the origin, wrapping in the original's playfield space.
- Debris: destroyed tanks break into pieces that fly up, tumble and fall
  (the "Blew 'em to bits" screenshot). The turret piece is distinct.

### 5.4 HUD (all drawn as vectors)

- Top centre: radar circle with a rotating sweep line, a V-shaped wedge
  above marking the field of view, and blips for tank-type enemies. Radar
  range and sweep period from constants.
- Top right: reserve tank icons, then SCORE nnnn and HIGH SCORE nnnn text.
- Top left: ENEMY IN RANGE, shown while an enemy is within the alert range.
- Centre: reticle. Normal picture, switching to the "target" picture when
  an enemy is lined up in the sights.
- Colours: the arcade cabinet had a colour overlay: red band across the
  HUD strip, green below. The display module draws with that overlay by
  default (constant `OVERLAY_ENABLED`), otherwise plain white phosphor.

### 5.5 Game flow

1. **Attract mode** cycles: title (BATTLEZONE logo, "© ATARI 1980"), the
   high score table (HIGH SCORES, ten entries, "BONUS TANK AT 15000 AND
   100000" line), and demo play by an autopilot on the real world code.
   Start is accepted at any point in the cycle.
2. **Play**: score 0, reserve tanks from constants, obstacles laid out,
   first enemy spawned after the initial delay.
3. **Player death**: screen "cracks" (the crack picture grows across the
   view over a few ticks, the world freezes), then the view clears and
   the next tank is placed. The mutual-destruction case (both die at once)
   still scores the kill.
4. **Game over**: GAME OVER text; if the score makes the table, the
   initials-entry screen follows (three initials chosen with the treads
   sticks/up-down, fire to confirm each, per the original's scheme), then
   the high score table, then back to attract.
5. **Bonus tanks** at the thresholds in constants (15,000 and 100,000 by
   default); an extra-life event plays its sound.

### 5.6 Sound

Every sound in the original, resynthesized: engine idle rumble that rises
with motion, player fire, enemy fire, shell hitting an obstacle, enemy
explosion (big low noise burst), player destroyed, ENEMY IN RANGE alert
beep, missile launch and in-flight whine, saucer warble, saucer hit, extra
life, and the high score / attract jingle if the original has one. Audio
starts on the first user gesture (browser autoplay policy), so the attract
mode is silent until a key or button is pressed, which matches a quiet
arcade.

## 6. Extracted original data (`src/data`)

| File | Content |
| --- | --- |
| `types.ts` | `WireModel`, `Picture2D`, `Glyph` |
| `models.ts` | 3D wireframes: tank, supertank, missile, saucer, pyramid and cube variants, debris pieces, projectile |
| `mountains.ts` | horizon range polyline, wrap width, volcano and moon positions |
| `font.ts` | vector font glyphs A-Z 0-9 and punctuation |
| `pictures.ts` | logo, reticle (normal, target), radar parts, reserve tank icon, screen crack |
| `constants.ts` | all gameplay numbers with source citations |

Coordinates stay in original vector units; the camera and display scale
them. Nothing in `src/data` contains behaviour.

## 7. Controls

| Action | Gamepad | Keyboard |
| --- | --- | --- |
| Left tread | Left stick up/down | W / S |
| Right tread | Right stick up/down | Up / Down arrows (or I / K) |
| Both treads (convenience, same as cabinet "both sticks") | D-pad up/down; left/right = pivot | Left / Right arrows = pivot |
| Fire | A / Cross, or right trigger | Space |
| Start | Start / Options | Enter |

Gamepad mapping uses the "standard" Gamepad API layout, so any pad the
browser recognises works without configuration.

## 8. Rendering details

- Logical display space is the original's vector coordinate space (from
  constants); the canvas letterboxes it at the original 4:3 aspect and
  scales lines with device pixel ratio.
- Lines are drawn twice: a wide low-alpha pass for phosphor glow, then a
  thin bright pass. Brightness follows the vector intensity.
- Perspective: objects are placed relative to the player, rotated by the
  negative heading, then projected with the original's focal length. Lines
  crossing the near plane are clipped in view space, not dropped.
- Distant objects are drawn regardless of size (the original had no LOD)
  but culled beyond the original's draw distance.

## 9. Testing strategy

- Pure logic (math, camera, player kinematics, each AI, shells,
  collisions, spawn, score, high score table, state machine, attract
  autopilot) has Vitest unit tests with a seeded `Rng`.
- Rendering is tested with a recording `VectorDisplay` fake: tests assert
  that expected line segments and text were emitted for a known state.
- Audio: the synth is tested for building a graph without throwing using a
  minimal fake `AudioContext`; sound design is verified by ear.
- Input: gamepad and keyboard adapters are tested with fake `Gamepad`
  objects and synthetic key events.
- One Playwright smoke test loads the built site, confirms the canvas has
  drawn (non-black pixels), presses Enter and confirms the phase changes.

## 10. Delivery

Work happens in git worktrees under `~/repositories/worktrees`, one branch
per task, merged through pull requests on
https://github.com/adamsilverstein/battlezone after review. `main` always
builds and deploys to GitHub Pages.
