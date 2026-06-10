import { defineConfig } from 'vite';

// Relative base so the build works at any path (GitHub Pages project sites
// are served from /<repo>/, not the domain root).
export default defineConfig({
  base: './',
});
