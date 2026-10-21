// Minimal typings for the Strudel packages we use (they ship plain JavaScript).

declare module '@strudel/core' {
  export interface Fraction {
    valueOf(): number;
  }
  export interface TimeSpan {
    begin: Fraction;
    end: Fraction;
  }
  export interface Hap<T = any> {
    whole?: TimeSpan;
    part: TimeSpan;
    value: T;
    context: { locations?: { start: number; end: number }[] };
    hasOnset(): boolean;
  }
  export class Pattern<T = any> {
    queryArc(begin: number, end: number): Hap<T>[];
    withValue<U>(f: (value: T) => U): Pattern<U>;
    [method: string]: any;
  }
  export function isPattern(value: unknown): value is Pattern;
  export function stack(...patterns: unknown[]): Pattern;
  export const silence: Pattern;
  export function registerControl(names: string | string[], ...aliases: string[]): Record<string, any>;
  export function evalScope(...modules: unknown[]): Promise<unknown[]>;
  export function evaluate(
    code: string,
    transpiler?: (code: string, options?: unknown) => { output: string },
  ): Promise<{ pattern: unknown; meta: unknown }>;
  export function noteToMidi(note: string): number;
}

declare module '@strudel/mini';
declare module '@strudel/tonal';
declare module '@strudel/transpiler' {
  export function transpiler(code: string, options?: unknown): { output: string };
}
