import { defineConfig } from 'vite';

// GitHub Pages serves the site from /battlezone/, local dev from /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/battlezone/' : '/',
  build: { target: 'es2022', sourcemap: true },
});
