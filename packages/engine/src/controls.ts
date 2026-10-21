// NES-specific pattern controls, registered on top of Strudel's.

import { Pattern, isPattern, registerControl } from '@strudel/core';
import { macro, type Macro } from '@chiptide/driver';

/** Plain controls: patternable values copied into each hap. */
export const controls = {
  ...registerControl('ch'),
  ...registerControl('duty'),
  ...registerControl('vol'),
  ...registerControl('slide'),
  ...registerControl('glide'),
  ...registerControl('sweep'),
  ...registerControl('sweeprate'),
  ...registerControl('metal'),
  ...registerControl('inst'),
  ...registerControl('chordarp'),
  ...registerControl('arpspeed'),
};

export type MacroInput = readonly (number | string)[] | string | Macro;

/**
 * Parses a macro from an array (`[15, 12, '|', 8, '/', 0]`) or a
 * single-quoted string (`'15 12 | 8 / 0'`). `|` starts the loop, `/` marks
 * the release point.
 */
export function toMacro(input: unknown, name = 'macro'): Macro {
  if (isPattern(input)) {
    throw new Error(
      `${name}: use an array like [15, 12, '|', 8] or a single-quoted string like '15 12 | 8'. ` +
        'Double-quoted strings are mini-notation patterns.',
    );
  }
  if (typeof input === 'number') return macro([input]);
  if (typeof input === 'string')
    return macro(
      input
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean),
    );
  if (Array.isArray(input)) return macro(input as (number | string)[]);
  if (input && typeof input === 'object' && Array.isArray((input as Macro).values)) return input as Macro;
  throw new Error(`${name}: cannot read a macro from ${String(input)}`);
}

/** Macro controls take one sequence for the whole note, so they are not patterned. */
export const MACRO_CONTROLS = {
  env: 'volume',
  dutyenv: 'duty',
  arpenv: 'arpeggio',
  pitchenv: 'pitch',
} as const;

for (const name of Object.keys(MACRO_CONTROLS)) {
  (Pattern.prototype as any)[name] = function (this: Pattern, input: unknown) {
    const value = toMacro(input, name);
    return this.withValue((v: unknown) =>
      v && typeof v === 'object' ? { ...(v as object), [name]: value } : { value: v, [name]: value },
    );
  };
}
