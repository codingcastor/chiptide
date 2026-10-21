import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works from any sub-path (GitHub Pages, etc.).
  base: './',
  server: { fs: { allow: ['../..'] } },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
