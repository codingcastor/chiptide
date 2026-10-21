import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// @kabelsalat/web (a dependency of @strudel/core) only exposes its ESM build
// through the "module" field, which Node ignores. Point at it explicitly and
// let Vite transform the Strudel packages so the alias applies to them.
const kabelsalat = fileURLToPath(
  new URL('./node_modules/.pnpm/node_modules/@kabelsalat/web/dist/index.mjs', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: { '@kabelsalat/web': kabelsalat },
  },
  ssr: {
    noExternal: [/@strudel\//],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    server: { deps: { inline: [/@strudel\//] } },
  },
});
