/**
 * Band-limited step synthesis, after Blargg's blip_buf.
 *
 * The APU output is a staircase that only changes at discrete CPU cycles.
 * Instead of sampling it (which aliases badly), every change is added to the
 * buffer as a band-limited impulse of the same size, and reading integrates
 * the impulses back into a band-limited staircase.
 */

const TAPS = 16;
const PHASES = 64;
const HALF = TAPS / 2;
/** Cutoff as a fraction of the output sample rate. */
const CUTOFF = 0.45;

function buildKernel(): Float32Array[] {
  const kernel: Float32Array[] = [];
  for (let phase = 0; phase <= PHASES; phase++) {
    const frac = phase / PHASES;
    const taps = new Float32Array(TAPS);
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      const x = k - HALF + 1 - frac;
      const sinc = x === 0 ? 1 : Math.sin(2 * Math.PI * CUTOFF * x) / (2 * Math.PI * CUTOFF * x);
      // Blackman window over [-HALF, HALF].
      const w = 0.42 + 0.5 * Math.cos((Math.PI * x) / HALF) + 0.08 * Math.cos((2 * Math.PI * x) / HALF);
      taps[k] = Math.abs(x) >= HALF ? 0 : sinc * w;
      sum += taps[k];
    }
    // Each impulse must integrate to exactly the delta it represents.
    for (let k = 0; k < TAPS; k++) taps[k] /= sum;
    kernel.push(taps);
  }
  return kernel;
}

const KERNEL = buildKernel();

export class BlipBuffer {
  /** Output samples per input clock. */
  private readonly factor: number;
  private readonly buffer: Float64Array;
  /** Sample position, from the start of the buffer, where the current frame begins. */
  private offset = 0;
  private available = 0;
  private integrator = 0;

  constructor(
    clockRate: number,
    sampleRate: number,
    readonly capacity: number,
  ) {
    this.factor = sampleRate / clockRate;
    this.buffer = new Float64Array(capacity + TAPS + 1);
  }

  /** Adds a change of `delta` happening `clock` clocks after the start of the current frame. */
  addDelta(clock: number, delta: number): void {
    const pos = this.offset + clock * this.factor;
    const index = Math.floor(pos);
    const taps = KERNEL[Math.floor((pos - index) * PHASES)];
    const buf = this.buffer;
    for (let k = 0; k < TAPS; k++) buf[index + k] += delta * taps[k];
  }

  /** Ends the current frame after `clocks` clocks, making its samples readable. */
  endFrame(clocks: number): void {
    this.offset += clocks * this.factor;
    this.available = Math.floor(this.offset);
    if (this.available > this.capacity) throw new Error('BlipBuffer overflow: read samples more often');
  }

  /** How many clocks must run before `samples` samples can be read. */
  clocksNeeded(samples: number): number {
    const needed = samples - this.offset;
    return needed <= 0 ? 0 : Math.ceil(needed / this.factor + 1e-9);
  }

  get samplesAvailable(): number {
    return this.available;
  }

  /** Reads up to `count` samples into `out` and returns how many were read. */
  read(out: Float32Array, offset = 0, count = out.length - offset): number {
    const n = Math.min(count, this.available);
    const buf = this.buffer;
    let sum = this.integrator;
    for (let i = 0; i < n; i++) {
      sum += buf[i];
      out[offset + i] = sum;
    }
    this.integrator = sum;
    buf.copyWithin(0, n);
    buf.fill(0, buf.length - n);
    this.offset -= n;
    this.available -= n;
    return n;
  }

  clear(): void {
    this.buffer.fill(0);
    this.offset = this.available = this.integrator = 0;
  }

  /** Delay, in output samples, that the impulse kernel adds. */
  static readonly latency = HALF - 1;
}

/** The NES output stage: high-pass at 90 Hz and 440 Hz, low-pass at 14 kHz. */
export class OutputFilter {
  private readonly hp90: number;
  private readonly hp440: number;
  private readonly lp14k: number;
  private x90 = 0;
  private y90 = 0;
  private x440 = 0;
  private y440 = 0;
  private yLp = 0;

  constructor(sampleRate: number) {
    const dt = 1 / sampleRate;
    const rc = (f: number) => 1 / (2 * Math.PI * f);
    this.hp90 = rc(90) / (rc(90) + dt);
    this.hp440 = rc(440) / (rc(440) + dt);
    this.lp14k = dt / (rc(14000) + dt);
  }

  process(samples: Float32Array, offset: number, count: number): void {
    for (let i = offset; i < offset + count; i++) {
      const x = samples[i];
      this.y90 = this.hp90 * (this.y90 + x - this.x90);
      this.x90 = x;
      this.y440 = this.hp440 * (this.y440 + this.y90 - this.x440);
      this.x440 = this.y90;
      this.yLp += this.lp14k * (this.y440 - this.yLp);
      samples[i] = this.yLp;
    }
  }

  reset(): void {
    this.x90 = this.y90 = this.x440 = this.y440 = this.yLp = 0;
  }
}
