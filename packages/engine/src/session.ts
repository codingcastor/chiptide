import { frameRate, type Region, type RegisterWrite } from '@chiptide/apu';
import { Driver, type ChannelState } from '@chiptide/driver';
import type { Pattern } from '@strudel/core';
import { evaluateCode } from './evaluate';
import { defaultBank, type DpcmBank, DPCM_START } from './samples';
import { PatternStream } from './stream';

export interface SessionOptions {
  region?: Region;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Pattern stream + driver: produces the register writes of each frame.
 * Shared by the live player and the offline renderer.
 */
export class Session {
  readonly region: Region;
  readonly fps: number;
  readonly samples: DpcmBank;
  private driver: Driver;
  private stream: PatternStream;
  private warned = new Set<string>();
  private needsInit = true;
  private readonly warn: (message: string) => void;

  constructor(options: SessionOptions = {}) {
    this.region = options.region ?? 'ntsc';
    this.fps = frameRate(this.region);
    this.samples = defaultBank(this.region);
    // Report each distinct warning once per evaluation.
    this.warn = (message) => {
      if (this.warned.has(message)) return;
      this.warned.add(message);
      options.onWarning?.(message);
    };
    this.driver = new Driver({ region: this.region, onWarning: this.warn });
    this.stream = new PatternStream({
      fps: this.fps,
      samples: this.samples,
      onWarning: this.warn,
      onError: options.onError,
    });
  }

  /** Evaluates code and plays its pattern from the next frame. */
  async evaluate(code: string): Promise<Pattern> {
    const { pattern, cps } = await evaluateCode(code);
    this.warned.clear();
    this.stream.setPattern(pattern);
    if (cps !== undefined) this.stream.setCps(cps);
    return pattern;
  }

  setPattern(pattern: Pattern | null): void {
    this.stream.setPattern(pattern);
  }

  get cps(): number {
    return this.stream.cps;
  }

  setCps(cps: number): void {
    this.stream.setCps(cps);
  }

  /** Current cycle position. */
  get cycle(): number {
    return this.stream.position;
  }

  get channels(): readonly ChannelState[] {
    return this.driver.channelStates;
  }

  /** DPCM sample data to copy into CPU memory before playing. */
  memory(): { address: number; data: Uint8Array } {
    return { address: DPCM_START, data: this.samples.memory };
  }

  /** Register writes for the next `count` frames. */
  nextFrames(count: number): RegisterWrite[][] {
    return this.stream.next(count).map((events) => {
      if (!this.needsInit) return this.driver.frame(events);
      this.needsInit = false;
      const init = this.driver.init();
      return [...init, ...this.driver.frame(events)];
    });
  }

  /** Back to cycle 0 with every channel silent. */
  rewind(): RegisterWrite[] {
    this.stream.seek(0);
    // Stopping clears $4015, so the next frame starts with the power-up writes again.
    this.needsInit = true;
    return this.driver.silence();
  }
}
