import { REGIONS, type Region } from '@chiptide/apu';

export const midiToFrequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export const frequencyToMidi = (frequency: number): number => 69 + 12 * Math.log2(frequency / 440);

/** Pulse timer period for a pitch: f = CPU / (16 * (t + 1)). */
export function pulsePeriod(midi: number, region: Region): number {
  const t = Math.round(REGIONS[region].cpuClock / (16 * midiToFrequency(midi)) - 1);
  return Math.max(0, Math.min(0x7ff, t));
}

/** Triangle timer period for a pitch: f = CPU / (32 * (t + 1)). */
export function trianglePeriod(midi: number, region: Region): number {
  const t = Math.round(REGIONS[region].cpuClock / (32 * midiToFrequency(midi)) - 1);
  return Math.max(0, Math.min(0x7ff, t));
}

/** Noise pitch 0-15 (15 brightest) to the period index written to $400E. */
export const noisePeriodIndex = (pitch: number): number => 15 - Math.max(0, Math.min(15, Math.round(pitch)));

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Note name such as "A4" for a MIDI number. */
export function noteName(midi: number): string {
  const n = Math.round(midi);
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** Unclamped pulse period, to detect notes out of range. */
export const rawPulsePeriod = (midi: number, region: Region): number =>
  Math.round(REGIONS[region].cpuClock / (16 * midiToFrequency(midi)) - 1);

export const rawTrianglePeriod = (midi: number, region: Region): number =>
  Math.round(REGIONS[region].cpuClock / (32 * midiToFrequency(midi)) - 1);
