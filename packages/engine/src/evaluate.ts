import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { Pattern, isPattern, silence, stack } from '@strudel/core';
import { controls } from './controls';
import { ChiptideError, explainError } from './errors';
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
    if (!(cps > 0)) throw new ChiptideError(`setcps() attend un tempo positif, reçu ${cps}.`);
    pendingCps = cps;
  },
  setcpm: (cpm: number) => {
    if (!(cpm > 0)) throw new ChiptideError(`setcpm() attend un tempo positif, reçu ${cpm}.`);
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

/** Names usable in code, for "did you mean" suggestions. */
export function knownNames(): string[] {
  const methods = Object.getOwnPropertyNames(Pattern.prototype).filter((n) => !n.startsWith('_'));
  return [
    ...new Set([
      ...Object.keys(core),
      ...Object.keys(mini),
      ...Object.keys(tonal),
      ...Object.keys(scope),
      ...methods,
    ]),
  ];
}

/** Evaluates live code and returns the pattern it plays. Errors are ChiptideErrors in French. */
export async function evaluateCode(code: string): Promise<Evaluation> {
  await prepareScope();
  collected = new Map();
  anonymous = 0;
  pendingCps = undefined;
  resetInstruments();
  let pattern: unknown;
  try {
    ({ pattern } = await core.evaluate(code, transpiler));
  } catch (error) {
    throw explainError(error, code, knownNames());
  }
  let result: Pattern;
  if (collected.size > 0) result = stack(...collected.values());
  else if (isPattern(pattern)) result = pattern;
  else if (pattern === undefined) result = silence;
  else throw new ChiptideError('Le code doit se terminer par un pattern, par exemple note("c4 e4 g4").');
  return { pattern: result, cps: pendingCps };
}
