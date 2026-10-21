export type ChannelId = 'pulse1' | 'pulse2' | 'triangle' | 'noise' | 'dmc';

/** Where a note goes. `pulse` lets the driver pick a free pulse channel. */
export type ChannelTarget = ChannelId | 'pulse';

export const CHANNELS: readonly ChannelId[] = ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'];

/**
 * A per-frame sequence of values, like FamiTracker's instrument macros.
 * The `loop` section repeats while the note is held. On release the macro
 * jumps to `release` (when set) and plays to its end. Indices are -1 when unused.
 */
export interface Macro {
  values: number[];
  loop: number;
  release: number;
}

export interface Instrument {
  /** Volume per frame, 0-15. */
  volume?: Macro;
  /** Duty per frame, 0-3. Ignored by the triangle; on noise, 1 selects the short ("metal") mode. */
  duty?: Macro;
  /** Semitone offset per frame (absolute, like FamiTracker's default arpeggio mode). */
  arpeggio?: Macro;
  /** Pitch offset per frame in semitones. */
  pitch?: Macro;
}

export type ArpMode = 'up' | 'down' | 'updown' | 'downup';

export interface DpcmSample {
  /** CPU address, $C000-$FFC0, multiple of 64. */
  address: number;
  /** Length in bytes, 1-4081, of the form 16n + 1. */
  length: number;
  /** Playback rate index 0-15. */
  rate: number;
  loop?: boolean;
  /** Initial 7-bit output level. */
  level?: number;
}

export interface NoteEvent {
  channel: ChannelTarget;
  /** Frames the note is held before it is released. */
  duration: number;
  /**
   * MIDI note number, fractions allowed. On the noise channel it is the
   * noise pitch 0-15 (15 brightest), on the DMC it is unused.
   */
  note: number;
  /** Note volume 0-15, scaled with the volume macro (default 15). */
  volume?: number;
  /** Pulse duty 0-3 (default 2, 50%). */
  duty?: number;
  instrument?: Instrument;
  /** Vibrato rate in Hz. */
  vibrato?: number;
  /** Vibrato depth in semitones (default 0.5). */
  vibratoDepth?: number;
  /** Pitch slide in semitones per frame. */
  slide?: number;
  /** Portamento from the channel's previous note, in frames. */
  glide?: number;
  /** Hardware sweep (pulse only). */
  sweep?: { shift: number; period: number; up: boolean };
  /** Noise short mode, the metallic 93-step sequence. */
  metal?: boolean;
  /** Play simultaneous notes on one channel as an arpeggio. */
  chordArp?: ArpMode;
  /** Frames per arpeggio step (default 1). */
  arpSpeed?: number;
  sample?: DpcmSample;
}

export interface ChannelState {
  channel: ChannelId;
  active: boolean;
  /** Pitch currently played, in MIDI notes (noise: 0-15). */
  pitch: number;
  volume: number;
  /** Raw timer period written to the APU. */
  period: number;
}
