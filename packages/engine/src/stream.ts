import type { Hap, Pattern } from '@strudel/core';
import type { NoteEvent } from '@chiptide/driver';
import { hapToEvent } from './events';
import type { SampleBank } from './samples';

export interface StreamOptions {
  fps: number;
  cps?: number;
  samples?: SampleBank;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Walks a pattern frame by frame. Each call to `next()` returns, for each of
 * the following frames, the notes whose onset falls in that frame.
 */
export class PatternStream {
  readonly fps: number;
  private pattern: Pattern | null = null;
  private _cps: number;
  /** Cycle position of the next frame. */
  private cycle = 0;
  private samples?: SampleBank;
  private readonly onWarning: (message: string) => void;
  private readonly onError: (error: Error) => void;

  constructor(options: StreamOptions) {
    this.fps = options.fps;
    this._cps = options.cps ?? 0.5;
    this.samples = options.samples;
    this.onWarning = options.onWarning ?? (() => {});
    this.onError = options.onError ?? ((e) => console.error(e));
  }

  get cps(): number {
    return this._cps;
  }

  /** Changes the tempo, in cycles per second, from the next frame on. */
  setCps(cps: number): void {
    if (!(cps > 0)) throw new Error(`Invalid tempo: ${cps} cycles per second`);
    this._cps = cps;
  }

  setPattern(pattern: Pattern | null): void {
    this.pattern = pattern;
  }

  setSamples(samples: SampleBank | undefined): void {
    this.samples = samples;
  }

  get position(): number {
    return this.cycle;
  }

  /** Restarts from cycle `cycle`. */
  seek(cycle: number): void {
    this.cycle = cycle;
  }

  next(frames: number): NoteEvent[][] {
    const out: NoteEvent[][] = Array.from({ length: frames }, () => []);
    const begin = this.cycle;
    const perFrame = this._cps / this.fps;
    const end = begin + frames * perFrame;
    this.cycle = end;
    if (!this.pattern || frames <= 0) return out;

    let haps: Hap[];
    try {
      haps = this.pattern.queryArc(begin, end);
    } catch (error) {
      this.onError(error as Error);
      this.pattern = null;
      return out;
    }

    const ctx = { cps: this._cps, fps: this.fps, samples: this.samples, warn: this.onWarning };
    for (const hap of haps) {
      if (!hap.whole || !hap.hasOnset()) continue;
      const onset = hap.whole.begin.valueOf();
      if (onset < begin || onset >= end) continue;
      const frame = Math.min(frames - 1, Math.floor((onset - begin) / perFrame + 1e-6));
      const event = hapToEvent(hap, ctx);
      if (event) out[frame].push(event);
    }
    return out;
  }
}
