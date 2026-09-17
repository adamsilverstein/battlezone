/**
 * The browser smoke test's harness.
 *
 * The game is served the way GitHub Pages serves it - a production bundle behind
 * `vite preview` - with one difference: the build runs in `test` mode, so
 * `import.meta.env.MODE === 'test'` and `main.ts` exposes `window.__battlezone`.
 * That getter is the only way a test can ask which phase the state machine is in,
 * and mode is baked in at build time, so `vite preview --mode test` would be too
 * late; `npm run build:e2e` is the build that carries it.
 *
 * Everything else - minification, the module graph, the asset paths - is the
 * production build, because the point of this test is the shipped artefact.
 */

import { defineConfig, devices } from '@playwright/test';

/** Vite's preview default; pinned so the config and the server agree. */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  // One game at a time: every spec drives the same fixed-step loop and reads
  // pixels back off it, and a loaded machine starves the loop of frames.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The list reporter for the log, and the HTML one so a failing CI run has a
  // report to upload; `open: 'never'` keeps it from trying to launch a browser.
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: `npm run build:e2e && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    // Always a fresh server, even locally: the suite needs the `--mode test`
    // build for its `window.__battlezone` hook, and adopting whatever happens to
    // be on the port - an ordinary `npm run preview`, say - fails much further
    // down, as a missing hook rather than as the wrong server.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
