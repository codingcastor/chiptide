import type { ChannelLevels, FromWorklet, Region, ToWorklet } from '@chiptide/apu';
import type { ChannelState } from '@chiptide/driver';
import { Session } from './session';

export interface LivePlayerOptions {
  /** URL of the bundled AudioWorklet module (`@chiptide/apu/worklet`). */
  workletUrl: string;
  region?: Region;
  /** Frames computed ahead of the audio thread. More is safer, less is snappier. */
  lookahead?: number;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
  /** Called after each rendered frame, for visualisation. */
  onFrame?: (info: {
    frame: number;
    cycle: number;
    levels: ChannelLevels;
    channels: readonly ChannelState[];
  }) => void;
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
  /** Frames the worklet had to render before their writes arrived. */
  lateFrames = 0;

  constructor(private readonly options: LivePlayerOptions) {
    this.lookahead = options.lookahead ?? 6;
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

  private post(msg: ToWorklet): void {
    this.node?.port.postMessage(msg);
  }

  private receive(msg: FromWorklet): void {
    if (msg.type !== 'frame' || !this.playing) return;
    this.rendered = msg.index + 1;
    this.lateFrames = msg.late;
    this.schedule();
    this.options.onFrame?.({
      frame: msg.index,
      cycle: this.session.cycle - ((this.scheduled - this.rendered) * this.session.cps) / this.session.fps,
      levels: msg.levels,
      channels: this.session.channels,
    });
  }

  private schedule(): void {
    const count = this.rendered + this.lookahead - this.scheduled;
    if (count <= 0) return;
    const frames = this.session.nextFrames(count).map((writes, i) => ({ index: this.scheduled + i, writes }));
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
