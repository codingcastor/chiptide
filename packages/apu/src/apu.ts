import { BlipBuffer, OutputFilter } from './blip';
import { Dmc, Noise, Pulse, Triangle, type MemoryReader } from './channels';
import { PULSE_MIX, REGIONS, TND_MIX, type FrameStep, type Region, type RegionTiming } from './tables';

export interface ApuOptions {
  sampleRate: number;
  region?: Region;
  /** Apply the console's analog output filters (default true). */
  filters?: boolean;
  /** Reads CPU memory for DPCM samples. Defaults to the APU's own 64 KiB memory. */
  read?: MemoryReader;
  /** Largest number of samples kept between two reads (default 8192). */
  bufferSize?: number;
}

export interface ChannelLevels {
  pulse1: number;
  pulse2: number;
  triangle: number;
  noise: number;
  dmc: number;
}

/**
 * The 2A03 audio processing unit.
 *
 * Time only moves forward through `run()`. Register writes apply at the
 * current time, so callers interleave `write()` and `run()` to place writes
 * at specific cycles, then `read()` the resulting samples.
 */
export class Apu {
  readonly region: Region;
  readonly timing: RegionTiming;
  readonly sampleRate: number;
  readonly clockRate: number;
  /** CPU memory, used for DPCM samples ($C000-$FFFF in practice). */
  readonly memory = new Uint8Array(0x10000);

  readonly pulse1 = new Pulse(true);
  readonly pulse2 = new Pulse(false);
  readonly triangle = new Triangle();
  readonly noise: Noise;
  readonly dmc: Dmc;

  private readonly blip: BlipBuffer;
  private readonly filter: OutputFilter | null;

  /** Absolute time in CPU cycles. */
  private time = 0;
  /** Time at which the current blip frame started. */
  private blipStart = 0;
  /** Fractional cycles left over from `run()`. */
  private remainder = 0;
  private level = 0;

  private frameMode: 4 | 5 = 4;
  private frameStep = 0;
  private frameStart = 0;
  private frameNext = 0;

  constructor(options: ApuOptions) {
    this.region = options.region ?? 'ntsc';
    this.timing = REGIONS[this.region];
    this.sampleRate = options.sampleRate;
    this.clockRate = this.timing.cpuClock;
    this.noise = new Noise(this.timing.noisePeriods);
    this.dmc = new Dmc(this.timing.dmcRates, options.read ?? ((address) => this.memory[address]));
    this.blip = new BlipBuffer(this.clockRate, this.sampleRate, options.bufferSize ?? 8192);
    this.filter = options.filters === false ? null : new OutputFilter(this.sampleRate);
    this.reset();
  }

  reset(): void {
    for (const ch of [this.pulse1, this.pulse2, this.triangle, this.noise, this.dmc]) {
      ch.reset();
      ch.nextClock = this.time + 1;
    }
    this.frameMode = 4;
    this.frameStep = 0;
    this.frameStart = this.time;
    this.frameNext = this.time + this.sequence[0].cycle;
    // The triangle rests at step 0 (level 15). Treat the reset state as the
    // baseline instead of emitting a step, which would pop.
    this.level = this.mix();
  }

  private get sequence(): FrameStep[] {
    return this.timing.frameSequence[this.frameMode];
  }

  /** Writes an APU register ($4000-$4017) at the current time. */
  write(address: number, value: number): void {
    value &= 0xff;
    if (address >= 0x4000 && address <= 0x4003) this.pulse1.write(address - 0x4000, value);
    else if (address <= 0x4007) this.pulse2.write(address - 0x4004, value);
    else if (address <= 0x400b) this.triangle.write(address - 0x4008, value);
    else if (address <= 0x400f) this.noise.write(address - 0x400c, value);
    else if (address <= 0x4013) this.dmc.write(address - 0x4010, value);
    else if (address === 0x4015) {
      this.pulse1.length.setEnabled((value & 1) !== 0);
      this.pulse2.length.setEnabled((value & 2) !== 0);
      this.triangle.length.setEnabled((value & 4) !== 0);
      this.noise.length.setEnabled((value & 8) !== 0);
      this.dmc.setEnabled((value & 16) !== 0);
    } else if (address === 0x4017) {
      this.frameMode = value & 0x80 ? 5 : 4;
      this.frameStep = 0;
      this.frameStart = this.time;
      this.frameNext = this.time + this.sequence[0].cycle;
      if (this.frameMode === 5) this.clockFrame(true, true);
    }
    this.updateLevel();
  }

  /** Advances by `cycles` CPU cycles. Fractions carry over to the next call. */
  run(cycles: number): void {
    const total = cycles + this.remainder;
    const whole = Math.floor(total);
    this.remainder = total - whole;
    const end = this.time + whole;
    const { pulse1: p1, pulse2: p2, triangle: tri, noise, dmc } = this;

    for (;;) {
      let t = this.frameNext;
      if (p1.nextClock < t) t = p1.nextClock;
      if (p2.nextClock < t) t = p2.nextClock;
      if (tri.nextClock < t) t = tri.nextClock;
      if (noise.nextClock < t) t = noise.nextClock;
      if (dmc.nextClock < t) t = dmc.nextClock;
      if (t > end) break;
      this.time = t;
      if (this.frameNext === t) this.stepFrameCounter();
      if (p1.nextClock === t) p1.clockTimer();
      if (p2.nextClock === t) p2.clockTimer();
      if (tri.nextClock === t) tri.clockTimer();
      if (noise.nextClock === t) noise.clockTimer();
      if (dmc.nextClock === t) dmc.clockTimer();
      this.updateLevel();
    }

    this.time = end;
    this.blip.endFrame(end - this.blipStart);
    this.blipStart = end;
  }

  private stepFrameCounter(): void {
    const sequence = this.sequence;
    const step = sequence[this.frameStep];
    this.clockFrame(step.quarter, step.half);
    this.frameStep++;
    if (this.frameStep === sequence.length) {
      this.frameStep = 0;
      this.frameStart += step.cycle;
    }
    this.frameNext = this.frameStart + sequence[this.frameStep].cycle;
  }

  private clockFrame(quarter: boolean, half: boolean): void {
    if (quarter) {
      this.pulse1.clockQuarter();
      this.pulse2.clockQuarter();
      this.triangle.clockQuarter();
      this.noise.clockQuarter();
    }
    if (half) {
      this.pulse1.clockHalf();
      this.pulse2.clockHalf();
      this.triangle.clockHalf();
      this.noise.clockHalf();
    }
  }

  private mix(): number {
    return (
      PULSE_MIX[this.pulse1.output() + this.pulse2.output()] +
      TND_MIX[3 * this.triangle.output() + 2 * this.noise.output() + this.dmc.output()]
    );
  }

  private updateLevel(): void {
    const level = this.mix();
    if (level !== this.level) {
      this.blip.addDelta(this.time - this.blipStart, level - this.level);
      this.level = level;
    }
  }

  /** Number of samples ready to `read()`. */
  get samplesAvailable(): number {
    return this.blip.samplesAvailable;
  }

  /** Cycles to `run()` before `samples` samples are available. */
  cyclesNeeded(samples: number): number {
    return this.blip.clocksNeeded(samples);
  }

  /** Reads up to `count` samples and returns how many were read. */
  read(out: Float32Array, offset = 0, count = out.length - offset): number {
    const n = this.blip.read(out, offset, count);
    this.filter?.process(out, offset, n);
    return n;
  }

  /** Runs exactly as long as needed and fills `out` completely. */
  render(out: Float32Array, offset = 0, count = out.length - offset): void {
    let done = 0;
    while (done < count) {
      const chunk = Math.min(count - done, this.blip.capacity >> 1);
      this.run(this.cyclesNeeded(chunk));
      done += this.read(out, offset + done, chunk);
    }
  }

  /** Current 4-bit (7-bit for DMC) output of each channel, for visualisation. */
  levels(): ChannelLevels {
    return {
      pulse1: this.pulse1.output(),
      pulse2: this.pulse2.output(),
      triangle: this.triangle.output(),
      noise: this.noise.output(),
      dmc: this.dmc.output(),
    };
  }

  get cycle(): number {
    return this.time;
  }
}
