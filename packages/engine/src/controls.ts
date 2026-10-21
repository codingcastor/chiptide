// NES-specific pattern controls, registered on top of Strudel's.

import { Pattern, isPattern, registerControl } from '@strudel/core';
import { macro, type Macro } from '@chiptide/driver';
import { ChiptideError } from './errors';

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
  ...registerControl('rate'),
};

export type MacroInput = readonly (number | string)[] | string | Macro;

/** Macro controls take one sequence for the whole note, so they are not patterned. */
export const MACRO_CONTROLS = {
  env: 'volume',
  dutyenv: 'duty',
  arpenv: 'arpeggio',
  pitchenv: 'pitch',
} as const;

export type MacroControl = keyof typeof MACRO_CONTROLS;

const DUTY_PERCENT: Record<number, number> = { 12.5: 0, 12: 0, 25: 1, 50: 2, 75: 3 };

/** Checks and normalises macro values for the kind of macro. */
function checkValues(kind: MacroControl, m: Macro, name: string): Macro {
  const values = m.values.map((v) => {
    switch (kind) {
      case 'env':
        if (!Number.isInteger(v) || v < 0 || v > 15) {
          throw new ChiptideError(`${name} : les volumes vont de 0 à 15 (reçu ${v}).`);
        }
        return v;
      case 'dutyenv':
        if (Number.isInteger(v) && v >= 0 && v <= 3) return v;
        if (v in DUTY_PERCENT) return DUTY_PERCENT[v];
        throw new ChiptideError(`${name} : utilisez 0 à 3 ou 12.5, 25, 50, 75 (reçu ${v}).`);
      case 'arpenv':
        if (!Number.isInteger(v) || Math.abs(v) > 96) {
          throw new ChiptideError(`${name} : les arpèges sont en demi-tons entiers (reçu ${v}).`);
        }
        return v;
      case 'pitchenv':
        if (Math.abs(v) > 96) throw new ChiptideError(`${name} : décalage trop grand (${v} demi-tons).`);
        return v;
    }
  });
  return { ...m, values };
}

/**
 * Parses a macro from an array (`[15, 12, '|', 8, '/', 0]`) or a
 * single-quoted string (`'15 12 | 8 / 0'`). `|` starts the loop, `/` marks
 * the release point.
 */
export function toMacro(input: unknown, kind: MacroControl, name: string = kind): Macro {
  if (isPattern(input)) {
    throw new ChiptideError(
      `${name} : écrivez un tableau comme [15, 12, '|', 8] ou une chaîne entre apostrophes comme '15 12 | 8'. ` +
        'Entre guillemets doubles, la chaîne est lue comme un pattern de mini-notation.',
    );
  }
  let parsed: Macro;
  try {
    if (typeof input === 'number') parsed = macro([input]);
    else if (typeof input === 'string')
      parsed = macro(
        input
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean),
      );
    else if (Array.isArray(input)) parsed = macro(input as (number | string)[]);
    else if (input && typeof input === 'object' && Array.isArray((input as Macro).values))
      parsed = input as Macro;
    else throw new Error(`impossible de lire une macro depuis ${String(input)}`);
  } catch (e) {
    throw new ChiptideError(`${name} : ${(e as Error).message}`);
  }
  return checkValues(kind, parsed, name);
}

for (const name of Object.keys(MACRO_CONTROLS) as MacroControl[]) {
  (Pattern.prototype as any)[name] = function (this: Pattern, input: unknown) {
    const value = toMacro(input, name, `.${name}()`);
    return this.withValue((v: unknown) =>
      v && typeof v === 'object' ? { ...(v as object), [name]: value } : { value: v, [name]: value },
    );
  };
}
