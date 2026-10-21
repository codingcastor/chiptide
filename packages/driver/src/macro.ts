import type { Macro } from './types';

export const LOOP = '|';
export const RELEASE = '/';

/**
 * Builds a macro from a list of values with optional markers:
 * `|` starts the loop and `/` marks the release point, as in FamiTracker.
 * Example: [15, 12, '|', 10, 9, '/', 6, 3, 0]
 */
export function macro(items: readonly (number | string)[]): Macro {
  const values: number[] = [];
  let loop = -1;
  let release = -1;
  for (const item of items) {
    if (item === LOOP) loop = values.length;
    else if (item === RELEASE) release = values.length;
    else {
      const value = Number(item);
      if (!Number.isFinite(value)) throw new Error(`Valeur de macro invalide : ${String(item)}`);
      values.push(value);
    }
  }
  if (values.length === 0) throw new Error('Une macro doit contenir au moins une valeur');
  if (loop >= values.length) loop = -1;
  if (release >= values.length) release = -1;
  return { values, loop, release };
}

export class MacroCursor {
  private position = 0;
  private released = false;

  constructor(readonly macro: Macro) {}

  get value(): number {
    return this.macro.values[this.position];
  }

  /** True once a non-looping macro has reached its last value. */
  get finished(): boolean {
    return this.position === this.macro.values.length - 1 && (this.macro.loop < 0 || this.released);
  }

  advance(): void {
    const { values, loop, release } = this.macro;
    const next = this.position + 1;
    // Loop while held: back to `loop` at the release point, or at the end.
    const loopEnd = release >= 0 ? release : values.length;
    if (!this.released && loop >= 0 && next >= loopEnd) {
      this.position = loop;
    } else if (!this.released && release >= 0 && next >= release) {
      this.position = Math.max(0, release - 1);
    } else {
      this.position = Math.min(next, values.length - 1);
    }
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    if (this.macro.release >= 0) this.position = this.macro.release;
  }
}
