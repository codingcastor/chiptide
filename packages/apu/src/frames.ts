import { Apu, type ApuOptions } from './apu';

export interface RegisterWrite {
  address: number;
  value: number;
}

/**
 * Plays an APU one video frame at a time, the way a sound driver on the
 * console does: the frame's register writes happen at its start, then the
 * APU runs for one frame (29780.5 cycles on NTSC).
 *
 * Live playback and offline rendering both go through this class, so they
 * produce the same samples.
 */
export class FrameRenderer {
  readonly apu: Apu;
  private scratch: Float32Array;

  constructor(options: ApuOptions | Apu) {
    this.apu = options instanceof Apu ? options : new Apu(options);
    this.scratch = new Float32Array(Math.ceil(this.samplesPerFrame) + 2);
  }

  get frameRate(): number {
    return this.apu.clockRate / this.apu.timing.frameCycles;
  }

  get samplesPerFrame(): number {
    return this.apu.sampleRate / this.frameRate;
  }

  /**
   * Renders one frame. The returned array is reused by the next call, so
   * copy it if you keep it.
   */
  renderFrame(writes: readonly RegisterWrite[]): Float32Array {
    for (const w of writes) this.apu.write(w.address, w.value);
    this.apu.run(this.apu.timing.frameCycles);
    const n = this.apu.samplesAvailable;
    if (n > this.scratch.length) this.scratch = new Float32Array(n);
    this.apu.read(this.scratch, 0, n);
    return this.scratch.subarray(0, n);
  }

  /** Renders a list of frames into one buffer. */
  renderFrames(frames: readonly (readonly RegisterWrite[])[]): Float32Array {
    const out = new Float32Array(Math.ceil(frames.length * this.samplesPerFrame) + 2);
    let length = 0;
    for (const writes of frames) {
      const samples = this.renderFrame(writes);
      out.set(samples, length);
      length += samples.length;
    }
    return out.subarray(0, length);
  }
}
