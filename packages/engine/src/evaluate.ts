import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { Pattern, isPattern, silence, stack } from '@strudel/core';
import { controls } from './controls';
import { instrument, resetInstruments } from './instruments';

export interface Evaluation {
  pattern: Pattern;
  /** Tempo set by the code with setcps()/setcpm(), if any. */
  cps?: number;
}

let collected = new Map<string, Pattern>();
let anonymous = 0;
let pendingCps: number | undefined;

// `$: pattern` is transpiled to `pattern.p('$')`. A leading or trailing `_` mutes it.
(Pattern.prototype as any).p = function (this: Pattern, id: string) {
  if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) return silence;
  const key = id === '$' ? `$${anonymous++}` : String(id);
  collected.set(key, this);
  return this;
};

// Visual helpers from Strudel's REPL do nothing here yet.
for (const name of ['pianoroll', 'punchcard', 'scope', 'spiral', 'spectrum', 'wordfall', 'color']) {
  const noop = function (this: Pattern) {
    return this;
  };
  (Pattern.prototype as any)[name] ??= noop;
  (Pattern.prototype as any)[`_${name}`] ??= noop;
}

const scope = {
  ...controls,
  instrument,
  setcps: (cps: number) => {
    pendingCps = cps;
  },
  setcpm: (cpm: number) => {
    pendingCps = cpm / 60;
  },
  hush: () => {
    collected.clear();
    return silence;
  },
};

let ready: Promise<unknown> | null = null;

/** Loads the Strudel functions into the global scope used by evaluated code. */
export function prepareScope(): Promise<unknown> {
  ready ??= core.evalScope(core, mini, tonal, scope);
  return ready;
}

/** Evaluates live code and returns the pattern it plays. */
export async function evaluateCode(code: string): Promise<Evaluation> {
  await prepareScope();
  collected = new Map();
  anonymous = 0;
  pendingCps = undefined;
  resetInstruments();
  const { pattern } = await core.evaluate(code, transpiler);
  let result: Pattern;
  if (collected.size > 0) result = stack(...collected.values());
  else if (isPattern(pattern)) result = pattern;
  else if (pattern === undefined) result = silence;
  else throw new Error('The code must end with a pattern, for example note("c4 e4 g4")');
  return { pattern: result, cps: pendingCps };
}
