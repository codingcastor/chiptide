import { REGIONS, type Region } from '@chiptide/apu';
import type { DpcmSample } from '@chiptide/driver';

export const DPCM_START = 0xc000;
export const DPCM_END = 0x10000;

/**
 * Encodes PCM audio (-1..1) as 1-bit delta modulation: each bit moves the
 * DMC output level up or down by 2, choosing whichever tracks the signal.
 */
export function encodeDpcm(
  pcm: Float32Array,
  sourceRate: number,
  rateIndex = 15,
  region: Region = 'ntsc',
  initialLevel = 64,
): Uint8Array {
  const bitRate = REGIONS[region].cpuClock / REGIONS[region].dmcRates[rateIndex];
  const bits = Math.ceil((pcm.length / sourceRate) * bitRate);
  // Lengths are 16n + 1 bytes.
  const length = Math.ceil((Math.ceil(bits / 8) - 1) / 16) * 16 + 1;
  const out = new Uint8Array(length);
  let level = initialLevel;
  for (let bit = 0; bit < length * 8; bit++) {
    const i = Math.floor((bit / bitRate) * sourceRate);
    let up: boolean;
    if (i < pcm.length) {
      const target = Math.max(0, Math.min(127, Math.round(64 + pcm[i] * 63)));
      up = target > level;
    } else {
      up = (bit & 1) === 0; // pad with alternating bits: a flat line
    }
    if (up) {
      out[bit >> 3] |= 1 << (bit & 7);
      if (level <= 125) level += 2;
    } else if (level >= 2) {
      level -= 2;
    }
  }
  return out;
}

export interface SampleBank {
  has(name: string): boolean;
  get(name: string, index?: number): DpcmSample | undefined;
}

/** Lays DPCM samples out in CPU memory ($C000-$FFFF, 64-byte aligned). */
export class DpcmBank implements SampleBank {
  private samples = new Map<string, DpcmSample[]>();
  private next = DPCM_START;
  readonly memory = new Uint8Array(DPCM_END - DPCM_START);

  add(
    name: string,
    data: Uint8Array,
    options: { rate?: number; loop?: boolean; level?: number } = {},
  ): DpcmSample {
    const length = Math.min(4081, data.length);
    if (this.next + length > DPCM_END) throw new Error(`DPCM memory is full (16 KiB): cannot add "${name}"`);
    const sample: DpcmSample = {
      address: this.next,
      length,
      rate: options.rate ?? 15,
      loop: options.loop,
      level: options.level ?? 64,
    };
    this.memory.set(data.subarray(0, length), this.next - DPCM_START);
    this.next = Math.ceil((this.next + length) / 64) * 64;
    const list = this.samples.get(name);
    if (list) list.push(sample);
    else this.samples.set(name, [sample]);
    return sample;
  }

  has(name: string): boolean {
    return this.samples.has(name);
  }

  get(name: string, index = 0): DpcmSample | undefined {
    const list = this.samples.get(name);
    return list?.[((index % list.length) + list.length) % list.length];
  }

  names(): string[] {
    return [...this.samples.keys()];
  }

  get bytesUsed(): number {
    return this.next - DPCM_START;
  }
}

/** A small synthesized kit, so DPCM works out of the box. */
export function defaultBank(region: Region = 'ntsc'): DpcmBank {
  const bank = new DpcmBank();
  const rate = 33144;
  const synth = (seconds: number, f: (t: number) => number) =>
    Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => f(i / rate));
  let seed = 1;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

  const kick = synth(
    0.18,
    (t) => Math.sin(2 * Math.PI * (55 * t + 900 * t * Math.exp(-t * 30) * 0.05)) * Math.exp(-t * 14),
  );
  const snare = synth(
    0.16,
    (t) => (0.5 * Math.sin(2 * Math.PI * 190 * t) + 0.7 * random()) * Math.exp(-t * 22),
  );
  const tom = synth(0.2, (t) => Math.sin(2 * Math.PI * (130 - 200 * t) * t) * Math.exp(-t * 12));
  bank.add('kick', encodeDpcm(kick, rate, 15, region));
  bank.add('snare', encodeDpcm(snare, rate, 15, region));
  bank.add('tom', encodeDpcm(tom, rate, 15, region));
  return bank;
}
