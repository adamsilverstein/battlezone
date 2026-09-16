# Battlezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task is executed by a fresh Opus agent in its own worktree and reviewed before merge.

**Goal:** A fully playable, faithful browser recreation of Atari's 1980 arcade Battlezone with gamepad support, sound, attract mode and high score entry.

**Architecture:** Deterministic fixed-step simulation (`World.update`) that returns `GameEvent`s; a vector renderer (Canvas 2D lines) draws the world and HUD from state; an audio system synthesizes sounds from events; a top-level state machine drives attract, play, death, game over and high score entry. Original shapes, font and constants are extracted from the Atari source into `src/data`.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Playwright (one smoke test), ESLint + Prettier, Canvas 2D, Web Audio API, Gamepad API, GitHub Actions + Pages. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-battlezone-design.md` (read it first; section 4.2 defines the shared types every task must use verbatim).

## Global Constraints

- Node 20, `npm run lint && npm run typecheck && npm test && npm run build` must pass on every commit that lands on main.
- No runtime npm dependencies. No frameworks. No image or audio assets: everything is lines and synthesized sound.
- No features beyond the 1980 arcade game (spec section 1). When in doubt, check `docs/reference/original-game.md` and `docs/reference/atari-source-notes.md`.
- Use the exact type names from spec section 4.2 (`InputState`, `World`, `Enemy`, `Shell`, `GameEvent`, `GameState`, `AudioSnapshot`, ...).
- Gameplay numbers come from `src/data/constants.ts`; if a needed value is missing there, add it with a comment saying whether it is from the source or an estimate. Never hard-code magic numbers in behaviour files.
- Simulation code never touches DOM, `Math.random`, `Date` or `performance`. It receives `Rng` and tick counts.
- Files stay focused (about 300 lines max); split by behaviour.
- Every task adds Vitest tests for its logic and keeps existing tests green.
- Work in a git worktree under `~/repositories/worktrees/battlezone-<task>` on branch `feat/<task>` created from the latest `main`. Commit atomically with imperative messages explaining why. Push and open a PR against `main` with a short description and an "AI Use" section.

## Dependency graph

```
T1 data extraction (done separately)
   └─► T2 engine + vector display + camera + static scene
          ├─► T3 input (parallel with T2, no dependency)
          ├─► T4 audio (parallel with T2, depends only on types)
          └─► T5 world: player, obstacles, shells
                 ├─► T6 enemies + explosions + scoring
                 └─► T7 scene objects + HUD rendering (parallel with T6)
                        └─► T8 game state machine, attract, death, game over, high scores
                               └─► T9 integration, smoke test, deploy, README
```

T3 and T4 start as soon as the shared types (T2 step 1) are on main.

---

### Task 2: Engine core, vector display, text, camera, static scene

**Files:**
- Create: `src/game/types.ts`, `src/input/types.ts` (exact contents of spec 4.2, plus `AudioSnapshot`)
- Create: `src/engine/loop.ts`, `src/engine/math.ts`, `src/engine/rng.ts`
- Create: `src/render/vectorDisplay.ts`, `src/render/text.ts`, `src/render/camera.ts`, `src/render/scene.ts`, `src/render/renderer.ts`
- Modify: `src/main.ts` to boot the loop and draw the static battlefield (horizon, mountains, volcano, moon) with a fixed camera that slowly rotates, so the result is visibly checkable.
- Test: `test/engine/math.test.ts`, `test/engine/rng.test.ts`, `test/engine/loop.test.ts`, `test/render/vectorDisplay.test.ts`, `test/render/text.test.ts`, `test/render/camera.test.ts`, `test/render/scene.test.ts`

**Interfaces:**
- Consumes: `src/data/*` (T1).
- Produces:
  ```ts
  // engine/loop.ts
  export function createLoop(opts: { tickHz: number; update: (tick: number) => void; render: (alpha: number) => void; raf?: (cb: (t: number) => void) => number; now?: () => number }): { start(): void; stop(): void; running: boolean }
  // engine/math.ts
  export const TAU: number; export function wrapAngle(a: number): number /* (-PI, PI] */; export function angleTo(from: Vec2, to: Vec2): number; export function dist(a: Vec2, b: Vec2): number; export function rotateY(p: Vec3, a: number): Vec3; export function lerp(a: number, b: number, t: number): number; export function clamp(v: number, lo: number, hi: number): number;
  export interface Vec3 { x: number; y: number; z: number }
  // engine/rng.ts
  export function createRng(seed: number): Rng
  // render/vectorDisplay.ts
  export interface VectorDisplay { beginFrame(): void; line(x0: number, y0: number, x1: number, y1: number, intensity?: number): void; polyline(points: readonly (readonly [number, number])[], intensity?: number): void; endFrame(): void; readonly width: number; readonly height: number }
  export function createCanvasDisplay(canvas: HTMLCanvasElement, opts?: { overlay?: boolean }): VectorDisplay
  export function createRecordingDisplay(): VectorDisplay & { lines: Array<{ x0: number; y0: number; x1: number; y1: number; intensity: number }>; clear(): void }
  // render/text.ts
  export function drawText(d: VectorDisplay, text: string, x: number, y: number, scale: number, opts?: { align?: 'left' | 'center' | 'right'; intensity?: number }): number /* width drawn */
  export function measureText(text: string, scale: number): number
  // render/camera.ts
  export interface Camera { pos: Vec2; heading: number; eyeHeight: number }
  export function projectPoint(cam: Camera, p: Vec3): { x: number; y: number; depth: number } | null
  export function projectSegment(cam: Camera, a: Vec3, b: Vec3): { x0: number; y0: number; x1: number; y1: number } | null  // clips at the near plane
  export function drawModel(d: VectorDisplay, cam: Camera, model: WireModel, pos: Vec3, rot: Vec3, intensity?: number): void
  // render/scene.ts
  export function drawHorizon(d: VectorDisplay, cam: Camera, tick: number): void  // horizon line, mountains, volcano + eruption dots, moon
  // render/renderer.ts
  export function createRenderer(d: VectorDisplay): { render(state: GameState, alpha: number): void }  // T7/T8 extend this. alpha in [0,1) is the fraction of the current tick elapsed; the renderer snapshots player/entity transforms whenever state.world.tick changes and interpolates (visual only, spec 4).
  ```

**Requirements:**
- Display coordinate space = the ROM's screen units: X in [-512, 512], Y in [-384, 384], origin centre, +Y up (constants.ts); canvas letterboxes at 4:3, DPR-aware, resizes with the window. The 3D view is clipped at Y = +192 (scene draws use a clip rect; HUD is not clipped). Glow pass then bright pass. Overlay colours: red band for the HUD strip, green elsewhere, controlled by `overlay` option (default from `constants.OVERLAY_ENABLED`).
- `createLoop` is deterministic and injectable (`raf`, `now`) so tests can step it; it caps catch-up ticks to avoid spiral of death. `tickHz` is the original's 15.625; `render(alpha)` receives the fraction of the pending tick so the renderer can interpolate.
- Camera: +Z forward at heading 0, heading increases clockwise from above; focal length and eye height from constants; near-plane clipping of segments, cull beyond draw distance.
- Horizon: mountains scroll with heading using the wrap width from `mountains.ts`; the volcano ejects dots on a repeating arc; the moon is a crescent at its fixed bearing. All stay at infinite distance (pure heading offset, no parallax).
- Tests: wrapAngle bounds; rng determinism; loop ticks exactly N times for elapsed time and caps catch-up; recording display captures lines; text renders every glyph in the font and measures width; projection of a point directly ahead lands at screen centre-ish, behind camera returns null, segment crossing near plane is clipped not dropped; horizon draws mountain lines and the count is stable across headings.

**Acceptance:** `npm run dev` shows the wireframe horizon, volcano erupting and moon, slowly panning. All checks green.

---

### Task 3: Input (gamepad + keyboard)

**Files:**
- Create: `src/input/gamepad.ts`, `src/input/keyboard.ts`, `src/input/input.ts`
- Test: `test/input/gamepad.test.ts`, `test/input/keyboard.test.ts`, `test/input/input.test.ts`

**Interfaces:**
- Consumes: `InputState` from `src/input/types.ts`.
- Produces:
  ```ts
  export interface RawInput { leftTread: number; rightTread: number; fire: boolean; start: boolean }   // analog -1..1 before quantisation
  export function readGamepad(pads: readonly (Gamepad | null)[], opts?: { deadZone?: number }): RawInput | null   // pure: takes navigator.getGamepads() output
  export function createKeyboard(target: EventTarget): { read(): RawInput; dispose(): void }
  export function createInput(opts: { getGamepads: () => readonly (Gamepad | null)[]; keyboard: { read(): RawInput } }): { poll(): InputState }   // merges, quantises, computes edges
  export function quantiseTread(v: number, deadZone: number): -1 | 0 | 1
  ```

**Requirements:**
- Mapping per spec section 7 (standard gamepad layout: axes 1 and 3 for treads with inverted Y, buttons 0 and 7 fire, button 9 start, d-pad 12/13/14/15 composite). Keyboard per spec: W/S, ArrowUp/ArrowDown or I/K, ArrowLeft/ArrowRight pivot, Space fire, Enter start.
- Composite inputs (d-pad, arrow left/right) map to tread pairs: up = both +1, down = both -1, left = left -1 right +1, right = left +1 right -1.
- `poll()` computes `firePressed` / `startPressed` edges and `anyActivity`.
- Handle `gamepadconnected` naturally by re-reading `getGamepads()` each poll; ignore null pads; prefer the first pad with any non-zero input.

**Acceptance:** tests cover mapping, dead zone, quantisation, edge detection and multiple pads.

---

### Task 4: Audio synthesis

**Files:**
- Create: `src/audio/synth.ts`, `src/audio/audioSystem.ts`, `src/audio/sounds/*.ts` (one per sound), `src/audio/index.ts`
- Test: `test/audio/synth.test.ts`, `test/audio/audioSystem.test.ts` (with a fake AudioContext)

**Interfaces:**
- Consumes: `GameEvent`, `AudioSnapshot` (spec 4.2).
- Produces:
  ```ts
  export interface AudioSystem { unlock(): Promise<void>; handle(event: GameEvent): void; update(snapshot: AudioSnapshot): void; setMuted(m: boolean): void }
  export function createAudioSystem(ctxFactory?: () => AudioContext): AudioSystem
  ```

**Requirements:**
- Sounds per spec 5.6 and the POKEY / discrete-circuit descriptions in `docs/reference/original-game.md` section 5 (AUDF/AUDC streams, the 8 effects, the detuned missile buzz, engine rev up/down, loud/soft cannon and explosion) plus `docs/reference/atari-source-notes.md` if present. Use oscillators, noise buffers (white/pink via filtered noise), biquad filters and gain envelopes. No samples.
- Continuous sounds (engine, alert beep loop, missile whine, saucer warble) start/stop from `update(snapshot)`; one-shots from `handle(event)`.
- `unlock()` resumes the context on first user gesture; before unlock, calls are no-ops.
- Cap simultaneous voices; never throw if the context is closed.

**Acceptance:** fake-context tests show the correct nodes are created for each event and continuous sounds toggle with the snapshot. Manual listen via `npm run dev` with a small dev-only key trigger is fine but must not ship in the game UI.

---

### Task 5: World, player tank, obstacles, shells

**Files:**
- Create: `src/game/world.ts`, `src/game/player.ts`, `src/game/obstacles.ts`, `src/game/shells.ts`
- Test: `test/game/player.test.ts`, `test/game/obstacles.test.ts`, `test/game/shells.test.ts`, `test/game/world.test.ts`

**Interfaces:**
- Consumes: types (T2), `engine/math`, `engine/rng`, `data/constants`.
- Produces:
  ```ts
  export function createWorld(rng: Rng, opts?: { lives?: number }): World
  export function updateWorld(world: World, input: InputState, rng: Rng): GameEvent[]   // one tick; mutates world
  export function updatePlayer(world: World, input: InputState): GameEvent[]
  export function firePlayerShell(world: World): GameEvent[]
  export function updateShells(world: World): GameEvent[]      // movement, expiry, obstacle hits; enemy hits are handled in T6 via hooks
  export function placeObstacles(rng: Rng): Obstacle[]
  export function circleHitsObstacle(pos: Vec2, radius: number, obstacles: readonly Obstacle[]): Obstacle | null
  export function resetPlayer(world: World): void
  ```
- `updateWorld` order: player → shells → (enemies hook: `world` has an `enemyUpdaters` list T6 fills; call in order) → radar sweep → range flags. Define the hook as `export const systems: Array<(world: World, input: InputState, rng: Rng) => GameEvent[]>` in world.ts so T6/T7 can register without editing this file.

**Requirements:**
- Tread kinematics per spec 5.1 with speeds and turn rates from constants; digital treads; pivot in place with opposite treads.
- Motion blocked by obstacles: attempt move, if circle intersects an obstacle revert and emit `motionBlocked` once per contact (not every tick).
- One player shell at a time; shell moves at shell speed, lifetime from constants; hits obstacle → `shellHitObstacle`, expires → `shellExpired`.
- Obstacle layout from constants (fixed table if the original uses one, otherwise seeded placement with minimum spacing and a clear zone around the origin).
- Radar sweep angle advances by `TAU / (RADAR_SWEEP_TICKS)` per tick.
- Playfield wrapping if the original wraps (check notes); otherwise unbounded.

**Acceptance:** tests: both treads forward moves along heading; opposite treads pivot without moving; blocked by obstacle; single shell rule; shell expiry; deterministic world with same seed.

---

### Task 6: Enemies, explosions, scoring

**Files:**
- Create: `src/game/enemies/tank.ts`, `src/game/enemies/supertank.ts`, `src/game/enemies/missile.ts`, `src/game/enemies/saucer.ts`, `src/game/enemies/index.ts`, `src/game/spawn.ts`, `src/game/explosions.ts`, `src/game/score.ts`, `src/game/collision.ts`
- Modify: `src/game/world.ts` only to register systems.
- Test: one test file per enemy plus `test/game/spawn.test.ts`, `test/game/explosions.test.ts`, `test/game/score.test.ts`, `test/game/collision.test.ts`

**Interfaces:**
- Consumes: T5 world API, constants, notes on AI.
- Produces:
  ```ts
  export function updateEnemies(world: World, input: InputState, rng: Rng): GameEvent[]
  export function updateSpawner(world: World, rng: Rng): GameEvent[]
  export function fireEnemyShell(world: World, enemy: Enemy): GameEvent[]
  export function resolveShellHits(world: World): GameEvent[]   // shells vs enemies, saucer, player
  export function spawnExplosion(world: World, enemy: Enemy, rng: Rng): void
  export function updateDebris(world: World): void
  export function addScore(world: World, points: number): GameEvent[]   // handles bonus tanks
  export function isEnemyInRange(world: World): boolean
  export function isTargetInSights(world: World): boolean
  ```

**Requirements:**
- AI behaviours per spec 5.2 and the state machine documented in `docs/reference/atari-source-notes.md` (tank: approach / circle / align / fire / retreat; supertank: faster, dodge on player fire; missile: straight-in with zigzag and hop over obstacles; saucer: wander, timeout leave). Each enemy stores its `state` string and `timer`.
- Enemy fire timing and accuracy from constants; enemy shells are blocked by obstacles; a player shell can destroy an enemy shell if the original allows (check notes; if not, don't).
- Spawning: distance/bearing rules and delays from constants; difficulty ramp by score (enemy mix); missile threshold; saucer cadence.
- Explosion: enemy splits into debris models with upward velocity and spin, gravity, lifetime; turret piece distinct. Missile and saucer have their own smaller debris.
- Scoring per kind; bonus tanks at thresholds → `extraLife`; `world.lives` increments.
- `enemyInRange` set when a tank-type enemy is within alert range; emit `enemyInRange` on rising edge. `targetInSights` when an enemy's projected bearing is within the reticle half-angle and within range.
- Player death: when an enemy shell or missile hits the player, set `player.alive=false`, emit `playerDestroyed`; T8 handles the sequence.

**Acceptance:** seeded tests show the tank turns toward the player and fires when aligned; supertank dodges after `playerFired`; missile hops when an obstacle is ahead; saucer leaves after its timer; hits award correct points; bonus tank awarded at threshold exactly once.

---

### Task 7: Scene objects and HUD rendering

**Files:**
- Create: `src/render/hud.ts`, `src/render/objects.ts` (enemies, shells, debris, obstacles), `src/render/crack.ts`
- Modify: `src/render/renderer.ts` to draw horizon → obstacles/enemies/shells/debris → HUD, from `GameState`.
- Test: `test/render/hud.test.ts`, `test/render/objects.test.ts`, `test/render/crack.test.ts`

**Interfaces:**
- Consumes: T2 display/camera/text, T5/T6 world types.
- Produces:
  ```ts
  export function drawWorldObjects(d: VectorDisplay, cam: Camera, world: World): void
  export function drawHud(d: VectorDisplay, world: World, opts: { showEnemyInRange: boolean; blinkTick: number }): void
  export function drawRadar(d: VectorDisplay, world: World): void
  export function drawReticle(d: VectorDisplay, locked: boolean): void
  export function drawCrack(d: VectorDisplay, progress: number /* 0..1 */): void
  ```

**Requirements:**
- Layout matches the screenshots: radar top centre with V wedge, sweep line and blips; reserve tank icons then SCORE / HIGH SCORE right of radar; ENEMY IN RANGE top left; reticle centre; positions from `pictures.ts` / constants.
- Enemies drawn with `drawModel` using heading; missile and saucer at their `y`; shells as the projectile model or a short line; debris yawing only (no pitch/roll, per spec 5.3); obstacles from their models. Objects interpolate between ticks using the renderer's transform snapshots (spec 4). Intensity fades with distance as the reference describes.
- Screen crack: the original crack picture revealed progressively (by line count) as `progress` grows.
- Score digits rendered with the vector font, zero-padded as the original.

**Acceptance:** recording-display tests assert the radar circle, blip positions for a known enemy, reticle switch, score text and crack line count.

---

### Task 8: Game state machine, attract mode, death, game over, high scores

**Files:**
- Create: `src/game/game.ts`, `src/game/attract.ts`, `src/game/highScores.ts`, `src/render/screens.ts` (title, high score table, initials entry, GAME OVER)
- Modify: `src/render/renderer.ts` to switch on `phase`; `src/main.ts` to wire input, audio, game and renderer.
- Test: `test/game/game.test.ts`, `test/game/attract.test.ts`, `test/game/highScores.test.ts`, `test/render/screens.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  ```ts
  export function createGame(opts: { rng: Rng; highScores: HighScoreEntry[] }): { state: GameState; update(input: InputState): GameEvent[]; audioSnapshot(): AudioSnapshot }
  export function attractInput(world: World, tick: number, rng: Rng): InputState   // demo autopilot
  export function loadHighScores(storage: Pick<Storage, 'getItem' | 'setItem'>): HighScoreEntry[]
  export function saveHighScores(storage: Pick<Storage, 'getItem' | 'setItem'>, entries: HighScoreEntry[]): void
  export function qualifies(entries: HighScoreEntry[], score: number): boolean
  export function insertHighScore(entries: HighScoreEntry[], entry: HighScoreEntry): HighScoreEntry[]
  export function updateInitialsEntry(entry: { initials: string; cursor: number }, input: InputState): { initials: string; cursor: number; done: boolean }
  ```

**Requirements:**
- Phases and timings per spec 5.5 and the notes (attract cycle durations, death crack duration, game over hold). Start accepted from any attract phase.
- Death: freeze world, crack progress over its duration, then respawn via `resetPlayer` if lives remain, else `gameOver`.
- High scores: ten entries, defaults from constants, localStorage persistence, initials entry with the original's scheme (treads/up-down change letter, fire confirms; three letters), then table display, then attract.
- Attract demo uses the real world with `attractInput` autopilot so it looks like play.
- HIGH SCORE display shows the top table score.

**Acceptance:** tests step through a full game lifecycle with a scripted `InputState` sequence: attract → start → play → death ×N → game over → entry → table → attract.

---

### Task 9: Integration, smoke test, docs, deploy

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`; update `package.json` scripts and CI to run it.
- Modify: `README.md` (how to play, controls table, dev commands, faithfulness notes), `docs/` as needed.
- Tune constants only where the running game visibly differs from the reference screenshots or notes, each change with a comment.

**Requirements:**
- Playwright smoke test: load built site, assert canvas has drawn, press Enter, assert phase becomes playing (expose a `window.__battlezone.phase` getter guarded by `import.meta.env.DEV || TEST` for the test).
- Verify with a real gamepad if available; otherwise verify the mapping code paths with the browser's Gamepad API test page.
- Confirm GitHub Pages deploys and the URL is in the README.

**Acceptance:** full game playable end to end from the Pages URL, CI green, README complete.
