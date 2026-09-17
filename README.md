# Battlezone (1980) - TypeScript recreation

A browser recreation of Atari's 1980 vector arcade game Battlezone, rebuilt from
the original 6502 source and Andy McFadden's disassembly of the shipping ROMs:
first-person tank combat on a wireframe battlefield, with the radar, the
periscope gunsight, enemy tanks, supertanks, guided missiles, the saucer, the
volcano on the horizon, the cracked windshield when you are hit, the attract
cycle and the high score table.

Play it: <https://adamsilverstein.github.io/battlezone/>

No runtime dependencies, no build-time assets: the shapes, the font, the
mountain range, the constants and the sounds are all generated from the ROM
source into `src/data/`, and the whole game is TypeScript against the canvas and
Web Audio.

## How to play

Press Start, then drive. The two sticks are the two treads, as they are on the
cabinet: push both forward to drive ahead, pull both back to reverse, push one
and pull the other to pivot in place. Line an enemy up in the gunsight - the
sight flares open and brightens when something is dead ahead - and fire. The
radar at the top of the screen sweeps round about every 1.5 seconds and flashes a
blip for the nearest tank or missile; the saucer never appears on it.

| Action              | Gamepad                     | Keyboard                  |
| ------------------- | --------------------------- | ------------------------- |
| Left tread          | Left stick up / down        | W / S                     |
| Right tread         | Right stick up / down       | I / K                     |
| Drive forward / back| D-pad up / down             | Up / Down arrow           |
| Pivot left / right  | D-pad left / right          | Left / Right arrow        |
| Fire                | A (cross), or right trigger | Space                     |
| Start               | Start                       | Enter                     |

The gamepad uses the W3C standard layout, so any pad the browser recognises
works without configuration: axes 1 and 3 are the stick Y axes, buttons 0 and 7
fire, button 9 starts and buttons 12-15 are the d-pad. A pad the browser cannot
map is still read, in case it is the only one plugged in. Keyboard and pad are
merged every tick, so either can drive at any time.

Scoring: 1000 for a tank, 2000 for a missile, 3000 for a supertank, 5000 for the
saucer, and a bonus tank at 15,000 and another at 100,000. Three tanks a game.

### Attract mode and high scores

Left alone, the game cycles the way the cabinet did: the high score table, then
the flying BATTLEZONE logo over a demo game, then the demo on its own, then back
to the table. Press Start from any of them - the cabinet here is on free play.
Sound is muted for all of it, as it is in the ROM.

A score that beats the table gets the initials editor: the right-hand control
changes the letter, fire selects it. The table lives in `localStorage`, standing
in for the cabinet's battery-backed RAM, and falls back to the ROM's own default
table when the browser has no storage to give.

## How faithful is it

Taken from the ROM, not invented: every vector shape and the character set, the
mountain range and the volcano, the obstacle layout table, the tank and
supertank speeds and turn rates, the shell speed and lifetime, the octagonal
distance function and every collision radius, the reticle lock window, the radar
sweep step and blip decay, the difficulty ladder, the scores, the messages and
their screen positions, the intensity nibbles each shape is drawn at, and the
POKEY register writes the sounds are built from. `docs/reference/` records where
each number came from, down to the line of `BZONE.MAC.txt`.

Estimated, because the surviving source does not say: the saucer's hover height,
the reserve-tank icon spacing, the exact visible screen bounds, the `PRESS START`
flash phase, and the length of the `GAME OVER` hold (the original has no such
phase - game over simply is attract mode there).

Deliberate deviations, each one commented where it lives:

- The supertank breaks off its approach when the player fires. Nothing in the
  ROM reacts to the player's shell; the design spec asks for the dodge
  (`SUPERTANK_DODGE_TICKS`).
- A saucer the player ignores drifts away after a timeout. The original's
  saucer stays until it is shot (`SAUCER_VISIT_TICKS`).
- The flying logo's approach is this recreation's own projection, so the letters
  are much larger than the ROM's for the first moments of the title phase.
- High scores persist between sessions; the cabinet lost them at power off.
- The missile's spatter frames and debris chunk models are picked by a rule of
  our own where the ROM's object numbering does not carry over.

The colours are the cabinet's plastic overlay, not the game: red over the top
fifth where the score and radar sit, green over the battlefield. The original
monitor was black and white.

## Development

```sh
nvm use          # Node from .nvmrc
npm install
npm run dev      # vite dev server on http://localhost:5173/
npm test         # unit tests (vitest)
npm run test:e2e # browser smoke test (playwright, builds and previews the site)
npm run lint     # eslint and prettier
npm run typecheck
npm run build    # typecheck, then a production bundle into dist/
npm run preview  # serve dist/
```

The first `npm run test:e2e` needs a browser: `npx playwright install --with-deps
chromium`. It builds with `vite build --mode test`, which is a production bundle
that also exposes `window.__battlezone` - a read-only view of the phase and the
tick counter for the test to assert on. The production build has no such hook.

`GITHUB_PAGES=true npm run build` produces the bundle Pages serves, with asset
paths under `/battlezone/`. Pushing to `main` deploys it.

## Architecture

The simulation is pure: `src/game/` advances a `World` one 15.625 Hz tick from an
`InputState` and an injected `Rng` and returns the events that happened, touching
neither the DOM nor the clock, so a game replays exactly from its seed. `src/render/`
turns a `GameState` into line segments on a `VectorDisplay`, interpolating between
the last two ticks so the 15.625 Hz world renders smoothly at 60 Hz; `src/audio/`
turns the same events into POKEY-shaped voices on a Web Audio graph; `src/input/`
merges gamepad and keyboard into the cabinet's two digital treads; `src/data/` is
the ROM, generated by the scripts in `tools/`. `src/main.ts` is the only module
that touches the page: it supplies the canvas, the audio context, the storage and
the fixed-step loop. See `docs/superpowers/specs/` for the design spec and
`docs/reference/` for the research notes behind every constant.

## Credits

Battlezone was designed by Ed Rotberg and published by Atari in 1980. This
recreation is built from the original assembly source in the
[historicalsource/battlezone](https://github.com/historicalsource/battlezone)
repository and from Andy McFadden's annotated disassembly of the rev 2 ROMs at
[6502disassembly.com](https://6502disassembly.com/va-battlezone/). Battlezone is
a trademark of its respective owner; this is a study of a piece of 1980 software,
and the code here is MIT licensed.
