// Hardware constants of the 2A03 APU. Sources: https://www.nesdev.org/wiki/APU

export type Region = 'ntsc' | 'pal';

export interface RegionTiming {
  /** CPU clock in Hz. The APU registers are clocked from it. */
  cpuClock: number;
  /** CPU cycles per video frame. Sound drivers run once per frame. */
  frameCycles: number;
  /** Frame counter sequence, in CPU cycles, for the 4-step and 5-step modes. */
  frameSequence: { 4: FrameStep[]; 5: FrameStep[] };
  noisePeriods: readonly number[];
  dmcRates: readonly number[];
}

export interface FrameStep {
  cycle: number;
  quarter: boolean;
  half: boolean;
}

const steps = (entries: [number, boolean, boolean][]): FrameStep[] =>
  entries.map(([cycle, quarter, half]) => ({ cycle, quarter, half }));

export const REGIONS: Record<Region, RegionTiming> = {
  ntsc: {
    cpuClock: 21477272 / 12,
    frameCycles: 29780.5,
    frameSequence: {
      4: steps([
        [7457, true, false],
        [14913, true, true],
        [22371, true, false],
        [29829, true, true],
        [29830, false, false],
      ]),
      5: steps([
        [7457, true, false],
        [14913, true, true],
        [22371, true, false],
        [29829, false, false],
        [37281, true, true],
        [37282, false, false],
      ]),
    },
    noisePeriods: [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068],
    dmcRates: [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54],
  },
  pal: {
    cpuClock: 26601712 / 16,
    frameCycles: 33247.5,
    frameSequence: {
      4: steps([
        [8313, true, false],
        [16627, true, true],
        [24939, true, false],
        [33252, true, true],
        [33254, false, false],
      ]),
      5: steps([
        [8313, true, false],
        [16627, true, true],
        [24939, true, false],
        [33253, false, false],
        [41565, true, true],
        [41566, false, false],
      ]),
    },
    noisePeriods: [4, 8, 14, 30, 60, 88, 118, 148, 188, 236, 354, 472, 708, 944, 1890, 3778],
    dmcRates: [398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50],
  },
};

/** Frames per second for a region (60.0988 Hz NTSC, 50.007 Hz PAL). */
export const frameRate = (region: Region): number => REGIONS[region].cpuClock / REGIONS[region].frameCycles;

export const LENGTH_TABLE: readonly number[] = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72,
  26, 16, 28, 32, 30,
];

/** Pulse waveforms for duty settings 0-3 (12.5%, 25%, 50%, 25% negated). */
export const DUTY_TABLE: readonly (readonly number[])[] = [
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 1, 1],
];

export const TRIANGLE_TABLE: readonly number[] = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

// Non-linear mixer, using the lookup-table approximation from the NESdev wiki.
export const PULSE_MIX: Float64Array = new Float64Array(31).map((_, n) =>
  n === 0 ? 0 : 95.52 / (8128 / n + 100),
);
export const TND_MIX: Float64Array = new Float64Array(203).map((_, n) =>
  n === 0 ? 0 : 163.67 / (24329 / n + 100),
);
