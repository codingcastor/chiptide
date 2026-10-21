import { frameRate, type Region, type RegisterWrite } from '@chiptide/apu';
import { MacroCursor } from './macro';
import {
  noisePeriodIndex,
  noteName,
  pulsePeriod,
  rawPulsePeriod,
  rawTrianglePeriod,
  trianglePeriod,
} from './pitch';
import { CHANNELS, type ArpMode, type ChannelId, type ChannelState, type NoteEvent } from './types';

export interface DriverOptions {
  region?: Region;
  /** Called with human-readable warnings, such as dropped notes. */
  onWarning?: (message: string) => void;
}

interface Voice {
  event: NoteEvent;
  /** Notes cycled through by a chord arpeggio, in playing order. */
  notes: number[];
  age: number;
  released: boolean;
  /** Retrigger the waveform on the first frame (writes the high period byte). */
  retrigger: boolean;
  glideFrom: number | null;
  volume: MacroCursor | null;
  duty: MacroCursor | null;
  arpeggio: MacroCursor | null;
  pitch: MacroCursor | null;
}

/** Register base address of each channel. */
const BASE: Record<ChannelId, number> = {
  pulse1: 0x4000,
  pulse2: 0x4004,
  triangle: 0x4008,
  noise: 0x400c,
  dmc: 0x4010,
};

const ENABLE_MASK = 0x0f;

/** FamiTracker-style volume scaling: never rounds a non-zero product down to silence. */
export const scaleVolume = (a: number, b: number): number =>
  a <= 0 || b <= 0 ? 0 : Math.max(1, Math.round((Math.min(15, a) * Math.min(15, b)) / 15));

function arpOrder(notes: number[], mode: ArpMode): number[] {
  const up = [...new Set(notes)].sort((a, b) => a - b);
  const down = [...up].reverse();
  switch (mode) {
    case 'up':
      return up;
    case 'down':
      return down;
    case 'updown':
      return up.length > 2 ? [...up, ...down.slice(1, -1)] : up;
    case 'downup':
      return down.length > 2 ? [...down, ...up.slice(1, -1)] : down;
  }
}

/**
 * A frame-based sound driver. Call `frame()` once per video frame with the
 * notes starting on that frame; it returns the APU register writes for the
 * frame, like the music engine of a NES game would perform them.
 */
export class Driver {
  readonly region: Region;
  readonly fps: number;
  private readonly onWarning: (message: string) => void;
  private voices: Record<ChannelId, Voice | null> = {
    pulse1: null,
    pulse2: null,
    triangle: null,
    noise: null,
    dmc: null,
  };
  /** Last pitch played per channel, for portamento. */
  private lastPitch: Partial<Record<ChannelId, number>> = {};
  /** Last value written to each register, to skip redundant writes. */
  private registers = new Map<number, number>();
  private states: Record<ChannelId, ChannelState>;
  private writes: RegisterWrite[] = [];
  frameIndex = 0;

  constructor(options: DriverOptions = {}) {
    this.region = options.region ?? 'ntsc';
    this.fps = frameRate(this.region);
    this.onWarning = options.onWarning ?? (() => {});
    this.states = Object.fromEntries(
      CHANNELS.map((channel) => [channel, { channel, active: false, pitch: 0, volume: 0, period: 0 }]),
    ) as Record<ChannelId, ChannelState>;
  }

  /** Power-up writes. Play them before the first frame. */
  init(): RegisterWrite[] {
    this.registers.clear();
    this.writes = [];
    this.write(0x4015, ENABLE_MASK);
    this.write(0x4017, 0x40); // 4-step sequence, no IRQ
    this.write(0x4000, 0x30);
    this.write(0x4004, 0x30);
    // Negate mode keeps the idle sweep unit from muting low notes.
    this.write(0x4001, 0x08);
    this.write(0x4005, 0x08);
    this.write(0x4008, 0x80);
    this.write(0x400c, 0x30);
    return this.flush();
  }

  /** Releases every voice immediately and mutes all channels. */
  silence(): RegisterWrite[] {
    for (const channel of CHANNELS) this.voices[channel] = null;
    this.write(0x4015, ENABLE_MASK);
    for (const channel of CHANNELS) this.mute(channel);
    return this.flush();
  }

  get channelStates(): readonly ChannelState[] {
    return CHANNELS.map((channel) => this.states[channel]);
  }

  /** Advances one frame. `events` are the notes starting on this frame. */
  frame(events: readonly NoteEvent[]): RegisterWrite[] {
    this.allocate(events);
    for (const channel of CHANNELS) this.update(channel);
    this.frameIndex++;
    return this.flush();
  }

  private flush(): RegisterWrite[] {
    const writes = this.writes;
    this.writes = [];
    return writes;
  }

  private write(address: number, value: number, force = false): void {
    if (!force && this.registers.get(address) === value) return;
    this.registers.set(address, value);
    this.writes.push({ address, value });
  }

  // ---------------------------------------------------------------- allocation

  private allocate(events: readonly NoteEvent[]): void {
    if (events.length === 0) return;
    const byChannel = new Map<ChannelId, NoteEvent[]>();
    const add = (channel: ChannelId, event: NoteEvent) => {
      const list = byChannel.get(channel);
      if (list) list.push(event);
      else byChannel.set(channel, [event]);
    };

    const auto: NoteEvent[] = [];
    for (const event of events) {
      if (event.channel === 'pulse') auto.push(event);
      else add(event.channel, event);
    }

    // Auto pulse notes: chord arpeggios stay together, other notes spread over
    // the free pulse channels, preferring silent ones, then released ones.
    const arpAuto = auto.filter((e) => e.chordArp);
    const plainAuto = auto.filter((e) => !e.chordArp).sort((a, b) => b.note - a.note);
    const candidates = (['pulse1', 'pulse2'] as const)
      .filter((ch) => !byChannel.has(ch))
      .sort((a, b) => this.busyness(a) - this.busyness(b));
    if (arpAuto.length > 0) {
      const channel = candidates.shift() ?? 'pulse1';
      for (const e of arpAuto) add(channel, e);
    }
    for (const event of plainAuto) {
      const channel = candidates.shift();
      if (channel) add(channel, event);
      else
        this.warn(
          'Plus de deux notes de pulse en même temps : les plus graves sont ignorées. Utilisez .chordarp() pour les accords.',
        );
    }

    for (const [channel, list] of byChannel) this.start(channel, list);
  }

  /** 0 when the channel is free, 1 when its note is releasing, 2 when held. */
  private busyness(channel: ChannelId): number {
    const voice = this.voices[channel];
    if (!voice) return 0;
    return voice.released ? 1 : 2;
  }

  private start(channel: ChannelId, events: NoteEvent[]): void {
    let event = events[0];
    let notes = [event.note];
    const arp = events.find((e) => e.chordArp);
    if (arp && events.length > 1) {
      event = arp;
      notes = arpOrder(
        events.map((e) => e.note),
        arp.chordArp!,
      );
    } else if (events.length > 1) {
      // Melodies keep the top note; drums keep the lowest (kick over hi-hat).
      const lowest = channel === 'noise';
      event = events.reduce((a, b) => ((lowest ? b.note < a.note : b.note > a.note) ? b : a));
      notes = [event.note];
      this.warn(
        lowest
          ? 'Plusieurs sons de bruit en même temps : seul le plus grave est joué.'
          : `Plusieurs notes en même temps sur ${channel} : seule la plus aiguë est jouée. Utilisez .chordarp() pour les accords.`,
      );
    }

    const instrument = event.instrument ?? {};
    const previous = this.lastPitch[channel];
    const glide = (event.glide ?? 0) > 0 && previous !== undefined;
    this.voices[channel] = {
      event,
      notes,
      age: 0,
      released: false,
      retrigger: !glide,
      glideFrom: glide ? previous! : null,
      volume: instrument.volume ? new MacroCursor(instrument.volume) : null,
      duty: instrument.duty ? new MacroCursor(instrument.duty) : null,
      arpeggio: instrument.arpeggio ? new MacroCursor(instrument.arpeggio) : null,
      pitch: instrument.pitch ? new MacroCursor(instrument.pitch) : null,
    };
    if (channel === 'dmc') this.startSample(event);
  }

  // ---------------------------------------------------------------- per frame

  private update(channel: ChannelId): void {
    const voice = this.voices[channel];
    const state = this.states[channel];
    if (!voice) {
      state.active = false;
      state.volume = 0;
      this.mute(channel);
      return;
    }
    const { event } = voice;

    if (!voice.released && voice.age >= event.duration) {
      voice.released = true;
      for (const cursor of [voice.volume, voice.duty, voice.arpeggio, voice.pitch]) cursor?.release();
      if (channel === 'dmc' && event.sample?.loop) this.write(0x4015, ENABLE_MASK, true);
    }

    if (channel === 'dmc') {
      state.active = !voice.released;
      if (voice.released) this.voices.dmc = null;
      voice.age++;
      return;
    }

    const envelope = voice.volume ? voice.volume.value : voice.released ? 0 : 15;
    const volume = scaleVolume(envelope, event.volume ?? 15);
    const duty = voice.duty ? voice.duty.value : (event.duty ?? 2);
    const pitch = this.pitchOf(voice);

    switch (channel) {
      case 'pulse1':
      case 'pulse2':
        this.updatePulse(channel, voice, volume, duty, pitch);
        break;
      case 'triangle':
        this.updateTriangle(voice, volume, pitch);
        break;
      case 'noise':
        this.updateNoise(voice, volume, duty, pitch);
        break;
    }
    state.active = volume > 0;
    state.volume = volume;
    state.pitch = pitch;
    this.lastPitch[channel] = pitch;

    // After release, loops stop and the volume macro plays out: the note ends
    // when it reaches silence or the macro's last value.
    const silent = volume === 0 && voice.volume !== null && voice.volume.finished;
    const done = silent || (voice.released && (volume === 0 || !voice.volume || voice.volume.finished));
    for (const cursor of [voice.volume, voice.duty, voice.arpeggio, voice.pitch]) cursor?.advance();
    voice.retrigger = false;
    voice.age++;
    if (done) this.voices[channel] = null;
  }

  private pitchOf(voice: Voice): number {
    const { event, age } = voice;
    const speed = Math.max(1, Math.round(event.arpSpeed ?? 1));
    let base = voice.notes[Math.floor(age / speed) % voice.notes.length];
    const glide = event.glide ?? 0;
    if (voice.glideFrom !== null && age < glide) {
      base = voice.glideFrom + ((base - voice.glideFrom) * age) / glide;
    }
    let pitch = base + (voice.arpeggio?.value ?? 0) + (voice.pitch?.value ?? 0);
    if (event.slide) pitch += event.slide * age;
    if (event.vibrato) {
      pitch += (event.vibratoDepth ?? 0.5) * Math.sin((2 * Math.PI * event.vibrato * age) / this.fps);
    }
    return pitch;
  }

  private updatePulse(
    channel: 'pulse1' | 'pulse2',
    voice: Voice,
    volume: number,
    duty: number,
    pitch: number,
  ) {
    const base = BASE[channel];
    const period = pulsePeriod(pitch, this.region);
    if (voice.age === 0) this.checkRange(channel, pitch, rawPulsePeriod(pitch, this.region), 8);
    this.write(base, ((duty & 3) << 6) | 0x30 | volume);
    const sweep = voice.event.sweep;
    if (sweep && sweep.shift > 0) {
      // Rewriting restarts the sweep, so only do it when the note starts.
      const value = 0x80 | ((sweep.period & 7) << 4) | (sweep.up ? 0x08 : 0) | (sweep.shift & 7);
      if (voice.retrigger) this.write(base + 1, value, true);
    } else {
      this.write(base + 1, 0x08);
    }
    this.writePeriod(base, period, voice.retrigger);
    this.states[channel].period = period;
  }

  private updateTriangle(voice: Voice, volume: number, pitch: number): void {
    const period = trianglePeriod(pitch, this.region);
    if (voice.age === 0) this.checkRange('triangle', pitch, rawTrianglePeriod(pitch, this.region), 2);
    // The triangle has no volume control: any non-zero volume plays it.
    const audible = volume > 0 && period >= 2;
    this.write(0x4008, audible ? 0xff : 0x80);
    // Its waveform does not restart on write, so there is nothing to retrigger.
    this.writePeriod(0x4008, period, false);
    this.states.triangle.period = period;
  }

  private updateNoise(voice: Voice, volume: number, duty: number, pitch: number): void {
    const index = noisePeriodIndex(pitch);
    const metal = voice.duty ? (duty & 1) === 1 : !!voice.event.metal;
    this.write(0x400c, 0x30 | volume);
    this.write(0x400e, (metal ? 0x80 : 0) | index);
    if (voice.retrigger) this.write(0x400f, 0xf8, true);
    this.states.noise.period = index;
  }

  /** Writes the timer period. The high byte also restarts the pulse waveform, so it is only written when needed. */
  private writePeriod(base: number, period: number, retrigger: boolean): void {
    // A hardware sweep changes the period behind our back: write it in full on new notes.
    this.write(base + 2, period & 0xff, retrigger);
    const high = 0x08 | (period >> 8); // length index 1, halted by the control bit
    this.write(base + 3, high, retrigger);
  }

  private mute(channel: ChannelId): void {
    switch (channel) {
      case 'pulse1':
      case 'pulse2': {
        const base = BASE[channel];
        const current = this.registers.get(base) ?? 0x30;
        this.write(base, (current & 0xc0) | 0x30);
        break;
      }
      case 'triangle':
        this.write(0x4008, 0x80);
        break;
      case 'noise':
        this.write(0x400c, 0x30);
        break;
      case 'dmc':
        break;
    }
  }

  private startSample(event: NoteEvent): void {
    const sample = event.sample;
    if (!sample) {
      this.warn('Note DPCM sans sample : ignorée.');
      this.voices.dmc = null;
      return;
    }
    // Stop the current sample first so that enabling restarts playback.
    this.write(0x4015, ENABLE_MASK, true);
    this.write(0x4010, (sample.loop ? 0x40 : 0) | (sample.rate & 0x0f));
    if (sample.level !== undefined) this.write(0x4011, sample.level & 0x7f, true);
    this.write(0x4012, ((sample.address - 0xc000) >> 6) & 0xff);
    this.write(0x4013, ((sample.length - 1) >> 4) & 0xff);
    this.write(0x4015, ENABLE_MASK | 0x10, true);
  }

  /** Warns when a note falls outside what the channel's 11-bit timer can play. */
  private checkRange(channel: ChannelId, pitch: number, raw: number, minPeriod: number): void {
    if (raw > 0x7ff)
      this.warn(`${noteName(pitch)} est trop grave pour ${channel} : la note est jouée plus haut.`);
    else if (raw < minPeriod)
      this.warn(`${noteName(pitch)} est trop aiguë pour ${channel} : la note est muette.`);
  }

  private warn(message: string): void {
    this.onWarning(message);
  }
}
