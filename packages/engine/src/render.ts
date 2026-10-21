import { FrameRenderer, type RegisterWrite, type Region } from '@chiptide/apu';
import { Session } from './session';

export interface RenderOptions {
  /** Length in seconds. Defaults to 8 cycles of the pattern. */
  seconds?: number;
  cycles?: number;
  sampleRate?: number;
  region?: Region;
  onWarning?: (message: string) => void;
}

export interface RenderResult {
  samples: Float32Array;
  sampleRate: number;
  /** Register writes of each frame, as the APU received them. */
  frames: RegisterWrite[][];
  warnings: string[];
}

/** Renders live code to audio, exactly as the live player would play it. */
export async function renderCode(code: string, options: RenderOptions = {}): Promise<RenderResult> {
  const warnings: string[] = [];
  let failure: Error | undefined;
  const session = new Session({
    region: options.region,
    onWarning: (w) => {
      warnings.push(w);
      options.onWarning?.(w);
    },
    onError: (e) => {
      failure = e;
    },
  });
  await session.evaluate(code);
  const sampleRate = options.sampleRate ?? 48000;
  const seconds = options.seconds ?? (options.cycles ?? 8) / session.cps;
  const frames = session.nextFrames(Math.ceil(seconds * session.fps));
  if (failure) throw failure;

  const renderer = new FrameRenderer({ sampleRate, region: session.region });
  const { address, data } = session.memory();
  renderer.apu.memory.set(data, address);
  return { samples: renderer.renderFrames(frames), sampleRate, frames, warnings };
}

/** Encodes mono samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}
