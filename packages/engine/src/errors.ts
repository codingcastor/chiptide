// User-facing errors: French messages with a position in the code when we can find one.

import { mini } from '@strudel/mini';

export interface CodeRange {
  /** Offsets in the code. */
  from: number;
  to: number;
  /** 1-based line and column of `from`. */
  line: number;
  column: number;
}

export class ChiptideError extends Error {
  constructor(
    message: string,
    readonly range?: CodeRange,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ChiptideError';
  }
}

export function rangeAt(code: string, from: number, to = from + 1): CodeRange {
  const before = code.slice(0, from);
  const line = before.split('\n').length;
  const column = from - before.lastIndexOf('\n');
  return { from, to: Math.max(to, from + 1), line, column };
}

function offsetOf(code: string, line: number, column: number): number {
  const lines = code.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
  return offset + column;
}

/** Levenshtein distance, for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const c of long) if (c === short[i]) i++;
  return i === short.length;
}

/** The closest candidate, if it is close enough to be a likely typo. */
export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  const lower = name.toLowerCase();
  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    // On ties, prefer names with the same first letter, then names that
    // contain every typed letter in order (a forgotten letter is the usual typo).
    const d = distance(lower, c) + (c[0] === lower[0] ? 0 : 0.5) - (isSubsequence(lower, c) ? 0.25 : 0);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= Math.max(1, Math.floor(name.length / 3)) + 0.5 ? best : undefined;
}

/** " Vouliez-vous dire « x » ?" or an empty string. */
export function suggestion(name: string, candidates: Iterable<string>): string {
  const match = closest(name, candidates);
  return match ? ` Vouliez-vous dire « ${match} » ?` : '';
}

interface StringLiteral {
  from: number;
  to: number;
  text: string;
}

/** Double-quoted and backtick strings (mini-notation), skipping comments and single-quoted strings. */
function miniStrings(code: string): StringLiteral[] {
  const out: StringLiteral[] = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
    } else if (c === '"' || c === '`' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c && !(c !== '`' && code[j] === '\n')) {
        if (code[j] === '\\') j++;
        j++;
      }
      if (c !== "'") out.push({ from: i + 1, to: j, text: code.slice(i + 1, j) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

function translateSyntax(message: string): string {
  const unexpected = /^Unexpected token/.test(message);
  if (unexpected) return 'Erreur de syntaxe : symbole inattendu';
  if (/Unterminated string/.test(message)) return 'Erreur de syntaxe : chaîne non fermée';
  if (/Unterminated template/.test(message)) return 'Erreur de syntaxe : chaîne non fermée';
  if (/Unexpected character/.test(message)) return 'Erreur de syntaxe : caractère inattendu';
  return `Erreur de syntaxe : ${message.replace(/\s*\(\d+:\d+\)$/, '')}`;
}

/**
 * Turns an error thrown while evaluating `code` into a ChiptideError with a
 * French message and, when possible, the range of code at fault.
 */
export function explainError(error: unknown, code: string, knownNames: Iterable<string>): ChiptideError {
  if (error instanceof ChiptideError) return error;
  const e = error as { message?: string; loc?: { line: number; column: number }; pos?: number };
  const message = String(e?.message ?? error);

  // Syntax errors from the JavaScript parser carry a position.
  if (e?.loc && typeof e.loc.line === 'number') {
    const from = typeof e.pos === 'number' ? e.pos : offsetOf(code, e.loc.line, e.loc.column);
    return new ChiptideError(translateSyntax(message), rangeAt(code, from), error);
  }

  // Mini-notation errors only know their position inside the string: find the string.
  if (message.startsWith('[mini]')) {
    for (const literal of miniStrings(code)) {
      try {
        mini(literal.text);
      } catch {
        return new ChiptideError(
          `Erreur de mini-notation dans "${literal.text}"`,
          rangeAt(code, literal.from, literal.to),
          error,
        );
      }
    }
    return new ChiptideError('Erreur de mini-notation', undefined, error);
  }

  const notDefined = /^(\w+) is not defined$/.exec(message);
  if (notDefined) {
    const name = notDefined[1];
    const at = new RegExp(`\\b${name}\\b`).exec(code);
    return new ChiptideError(
      `« ${name} » n'existe pas.${suggestion(name, knownNames)}`,
      at ? rangeAt(code, at.index, at.index + name.length) : undefined,
      error,
    );
  }

  const notFunction = /(?:\.|^)(\w+) is not a function/.exec(message);
  if (notFunction) {
    const name = notFunction[1];
    const at = new RegExp(`\\.${name}\\b`).exec(code);
    return new ChiptideError(
      `La fonction .${name}() n'existe pas.${suggestion(name, knownNames)}`,
      at ? rangeAt(code, at.index + 1, at.index + 1 + name.length) : undefined,
      error,
    );
  }

  return new ChiptideError(message, undefined, error);
}
