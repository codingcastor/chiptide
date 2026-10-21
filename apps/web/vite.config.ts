import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works from any sub-path (GitHub Pages, etc.).
  base: './',
  server: { fs: { allow: ['../..'] } },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Separate chunks so the browser caches the libraries across releases.
        manualChunks: (id) => {
          if (/[\\/]@(codemirror|lezer)[\\/]/.test(id)) return 'codemirror';
          if (/[\\/](@strudel|@tonaljs|@kabelsalat|chord-voicings|fraction\.js)[\\/]/.test(id))
            return 'strudel';
        },
      },
    },
  },
});
