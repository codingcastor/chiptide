import type { ChannelLevels } from './apu';
import type { RegisterWrite } from './frames';
import type { Region } from './tables';

/** Messages from the main thread to the worklet. */
export type ToWorklet =
  | { type: 'init'; region: Region }
  /** Register writes for upcoming frames, keyed by absolute frame index. */
  | { type: 'frames'; frames: { index: number; writes: RegisterWrite[] }[] }
  /** Starts consuming frames from `frame`. */
  | { type: 'start'; frame: number }
  /** Silences the APU and stops consuming frames. */
  | { type: 'stop' }
  /** Copies DPCM sample data into CPU memory. */
  | { type: 'memory'; address: number; data: Uint8Array }
  /** Records per-channel outputs `points` times per frame (0 disables), sent with each frame. */
  | { type: 'probe'; points: number };

/** Messages from the worklet to the main thread. */
export type FromWorklet = {
  type: 'frame';
  /** Index of the frame just rendered. */
  index: number;
  levels: ChannelLevels;
  /** Frames whose writes arrived after the frame was rendered (they play one frame late). */
  late: number;
  /** Per-channel outputs during the frame when probing: pulse 1, pulse 2, triangle, noise, DMC. */
  probe?: Uint8Array[];
};
