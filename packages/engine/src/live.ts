import type { ChannelLevels, FromWorklet, Region, RegisterWrite, ToWorklet } from '@chiptide/apu';
import type { ChannelState } from '@chiptide/driver';
import type { Location } from './events';
import { Session } from './session';

/** What the listener hears at a given frame. */
export interface FrameInfo {
  frame: number;
  /** Pattern position, in cycles. */
  cycle: number;
  levels: ChannelLevels;
  channels: readonly ChannelState[];
  /** APU registers $4000-$4017 after this frame's writes. */
  registers: Uint8Array;
  /** Register writes of this frame. */
  writes: readonly RegisterWrite[];
  /** Code ranges of the notes sounding. */
  locations: Location[];
  /** Per-channel outputs during the frame, when probing is on. */
  probe?: Uint8Array[];
}

interface ScheduledFrame {
  writes: RegisterWrite[];
  channels: ChannelState[];
  cycle: number;
}

export interface LivePlayerOptions {
  /** URL of the bundled AudioWorklet module (`@chiptide/apu/worklet`). */
  workletUrl: string;
  region?: Region;
  /** Frames computed ahead of the audio thread. More is safer, less is snappier. */
  lookahead?: number;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
  /** Called after each rendered frame, for visualisation. */
  onFrame?: (info: FrameInfo) => void;
}

/** Plays live code in the browser through the emulated APU. */
export class LivePlayer {
  readonly session: Session;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private scheduled = 0;
  private rendered = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly lookahead: number;
  playing = false;
  /** Frames whose writes reached the worklet too late (they played one frame late). */
  lateFrames = 0;
  private frames = new Map<number, ScheduledFrame>();
  private registers = new Uint8Array(0x18);
  private probePoints = 0;

  constructor(private readonly options: LivePlayerOptions) {
    this.lookahead = options.lookahead ?? 8;
    this.session = new Session({
      region: options.region,
      onWarning: options.onWarning,
      onError: options.onError,
    });
  }

  private async setup(): Promise<AudioWorkletNode> {
    if (this.node) return this.node;
    const context = new AudioContext({ latencyHint: 'interactive' });
    await context.audioWorklet.addModule(this.options.workletUrl);
    const node = new AudioWorkletNode(context, 'chiptide', { outputChannelCount: [2] });
    const gain = new GainNode(context, { gain: this.volume });
    node.connect(gain).connect(context.destination);
    this.gain = gain;
    node.port.onmessage = (event: MessageEvent<FromWorklet>) => this.receive(event.data);
    this.context = context;
    this.node = node;
    this.post({ type: 'init', region: this.session.region });
    const { address, data } = this.session.memory();
    this.post({ type: 'memory', address, data });
    this.post({ type: 'probe', points: this.probePoints });
    return node;
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  /** Output node (after the volume), to attach an analyser. */
  get output(): AudioNode | null {
    return this.gain;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  /** Records each channel's output `points` times per frame for oscilloscopes (0 to stop). */
  setProbe(points: number): void {
    this.probePoints = points;
    this.post({ type: 'probe', points });
  }

  private post(msg: ToWorklet): void {
    this.node?.port.postMessage(msg);
  }

  private receive(msg: FromWorklet): void {
    if (msg.type !== 'frame' || !this.playing) return;
    this.rendered = msg.index + 1;
    this.lateFrames = msg.late;
    this.schedule();
    const scheduled = this.frames.get(msg.index);
    this.frames.delete(msg.index);
    for (const key of this.frames.keys()) if (key < msg.index) this.frames.delete(key);
    const writes = scheduled?.writes ?? [];
    for (const w of writes)
      if (w.address >= 0x4000 && w.address < 0x4018) this.registers[w.address - 0x4000] = w.value;
    this.options.onFrame?.({
      frame: msg.index,
      cycle: scheduled?.cycle ?? 0,
      levels: msg.levels,
      channels: scheduled?.channels ?? [],
      registers: this.registers,
      writes,
      locations: this.session.activeLocations(msg.index),
      probe: msg.probe,
    });
  }

  private schedule(): void {
    if (!this.playing) return;
    const count = this.rendered + this.lookahead - this.scheduled;
    if (count <= 0) return;
    const frames: { index: number; writes: RegisterWrite[] }[] = [];
    for (let i = 0; i < count; i++) {
      const cycle = this.session.cycle;
      const [writes] = this.session.nextFrames(1);
      const index = this.scheduled + i;
      this.frames.set(index, { writes, cycle, channels: this.session.channels.map((c) => ({ ...c })) });
      frames.push({ index, writes });
    }
    this.scheduled += count;
    this.post({ type: 'frames', frames });
  }

  /** Evaluates code; starts playback if needed. Throws on syntax or evaluation errors. */
  async evaluate(code: string): Promise<void> {
    await this.setup();
    await this.session.evaluate(code);
    if (!this.playing) await this.start();
  }

  async start(): Promise<void> {
    await this.setup();
    await this.context!.resume();
    if (this.playing) return;
    this.scheduled = this.rendered = 0;
    this.frames.clear();
    this.registers.fill(0);
    this.playing = true;
    this.schedule();
    this.post({ type: 'start', frame: 0 });
    // Backup clock in case worklet messages are delayed.
    this.timer = setInterval(() => this.schedule(), 20);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.session.rewind();
    this.post({ type: 'stop' });
  }
}
