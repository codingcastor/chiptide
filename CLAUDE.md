# Chiptide

Live coding NES music: Strudel patterns → 60 Hz sound driver → APU register writes → emulated 2A03.

- `packages/apu`: APU emulation (event-driven, band-limited via `BlipBuffer`), `FrameRenderer`, AudioWorklet.
- `packages/driver`: `Driver.frame(events)` returns the register writes of one frame. No Strudel dependency.
- `packages/engine`: Strudel integration (`evaluateCode`, NES controls, `Session`, `LivePlayer`, `renderCode`).
- `apps/web`: playground (Vite + CodeMirror). `examples/*.js` are loaded into it.
- `packages/engine/src/docs.ts` is the catalogue of functions: it feeds the help panel, autocompletion and
  `docs/reference.md` (regenerate with `pnpm docs`). Tests require every control to be documented and every
  example to play without warnings.

Conventions

- User-facing text (README, docs, UI, examples, warnings and error messages) is in French; code, comments and
  commit messages in English. Errors shown to users are `ChiptideError`s, with a code range when known.
- Live playback and offline rendering must both go through `Session` + `FrameRenderer` so they stay identical.
- `examples/` is excluded from Prettier: it would turn mini-notation double quotes into single quotes.
- In evaluated code, double-quoted strings are mini-notation. Macros take arrays or single-quoted strings.
- `@kabelsalat/web` (dependency of `@strudel/core`) needs the alias in `vitest.config.ts` under Node.

Checks: `pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
Render to WAV: `pnpm render examples/intro.js out.wav 30`.
