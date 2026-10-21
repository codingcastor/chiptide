/// <reference lib="webworker" />
// AudioWorklet processor that plays register writes through the emulated APU.

import { FrameRenderer, type RegisterWrite } from './frames';
import type { FromWorklet, ToWorklet } from './protocol';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

// Silence every channel without touching the frame counter.
const SILENCE: RegisterWrite[] = [{ address: 0x4015, value: 0 }];

class ChiptideProcessor extends AudioWorkletProcessor {
  private renderer = new FrameRenderer({ sampleRate, region: 'ntsc' });
  private pending = new Map<number, RegisterWrite[]>();
  private playing = false;
  private nextFrame = 0;
  private late = 0;
  private silenceNext = false;
  private queue = new Float32Array(4096);
  private queued = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<ToWorklet>) => this.receive(event.data);
  }

  private receive(msg: ToWorklet): void {
    switch (msg.type) {
      case 'init':
        this.renderer = new FrameRenderer({ sampleRate, region: msg.region });
        this.pending.clear();
        break;
      case 'frames':
        for (const f of msg.frames) {
          if (f.index >= this.nextFrame || !this.playing) this.pending.set(f.index, f.writes);
          else this.late++;
        }
        break;
      case 'start':
        this.nextFrame = msg.frame;
        this.playing = true;
        break;
      case 'stop':
        this.playing = false;
        this.pending.clear();
        this.silenceNext = true;
        break;
      case 'memory':
        this.renderer.apu.memory.set(msg.data, msg.address);
        break;
    }
  }

  private renderNextFrame(): void {
    let writes: RegisterWrite[] = [];
    if (this.silenceNext) {
      writes = SILENCE;
      this.silenceNext = false;
    } else if (this.playing) {
      writes = this.pending.get(this.nextFrame) ?? [];
      this.pending.delete(this.nextFrame);
    }
    const samples = this.renderer.renderFrame(writes);
    if (this.queued + samples.length > this.queue.length) {
      const bigger = new Float32Array(this.queue.length * 2);
      bigger.set(this.queue.subarray(0, this.queued));
      this.queue = bigger;
    }
    this.queue.set(samples, this.queued);
    this.queued += samples.length;
    if (this.playing) {
      const msg: FromWorklet = {
        type: 'frame',
        index: this.nextFrame,
        levels: this.renderer.apu.levels(),
        late: this.late,
      };
      this.port.postMessage(msg);
      this.nextFrame++;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const n = output[0].length;
    while (this.queued < n) this.renderNextFrame();
    for (const channel of output) channel.set(this.queue.subarray(0, n));
    this.queue.copyWithin(0, n, this.queued);
    this.queued -= n;
    return true;
  }
}

registerProcessor('chiptide', ChiptideProcessor);
