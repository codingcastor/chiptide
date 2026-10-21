import type { Macro } from '@chiptide/driver';

export interface Adsr {
  /** Seconds. */
  attack?: number;
  /** Seconds. */
  decay?: number;
  /** Level 0-1. */
  sustain?: number;
  /** Seconds. */
  release?: number;
}

const MAX_FRAMES = 240;

/**
 * Converts Strudel's ADSR controls into a volume macro sampled at the frame
 * rate, so `.attack(0.05).release(0.3)` works as on any Strudel synth.
 */
export function adsrMacro(adsr: Adsr, fps: number): Macro {
  const frames = (seconds = 0) => Math.min(MAX_FRAMES, Math.max(0, Math.round(seconds * fps)));
  // Without an explicit sustain, a decay goes down to silence, like Strudel's synths.
  const sustain = Math.max(0, Math.min(1, adsr.sustain ?? (adsr.decay !== undefined ? 0 : 1)));
  const level = Math.round(sustain * 15);
  const values: number[] = [];

  const attack = frames(adsr.attack);
  for (let i = 1; i <= attack; i++) values.push(Math.round((15 * i) / (attack + 1)));
  values.push(15);

  const decay = frames(adsr.decay);
  for (let i = 1; i <= decay; i++) values.push(Math.round(15 + ((level - 15) * i) / decay));

  const loop = values.length;
  values.push(level);
  const release = values.length;
  const releaseFrames = frames(adsr.release);
  for (let i = 1; i <= releaseFrames; i++) values.push(Math.round(level * (1 - i / releaseFrames)));
  if (values[values.length - 1] !== 0) values.push(0);
  return { values, loop, release };
}
