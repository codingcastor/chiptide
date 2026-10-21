import { noteToMidi, type Hap } from '@strudel/core';
import {
  frequencyToMidi,
  type ArpMode,
  type ChannelTarget,
  type Macro,
  type NoteEvent,
} from '@chiptide/driver';
import { MACRO_CONTROLS } from './controls';
import { channelFromName, getInstrument, type ResolvedInstrument } from './instruments';
import type { SampleBank } from './samples';

const ARP_MODES = new Set<ArpMode>(['up', 'down', 'updown', 'downup']);

/** Duty given as 0-3 or as a percentage (12.5, 25, 50, 75). */
export function dutyIndex(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 3) return Math.max(0, Math.round(n));
  if (n < 18.75) return 0;
  if (n < 37.5) return 1;
  if (n < 62.5) return 2;
  return 3;
}

function toMidi(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    try {
      return noteToMidi(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return value === undefined || value === null || !Number.isFinite(n) ? undefined : n;
};

export interface ConvertContext {
  cps: number;
  fps: number;
  samples?: SampleBank;
  warn: (message: string) => void;
}

/** Turns a Strudel hap into a note for the driver, or null when it cannot be played. */
export function hapToEvent(hap: Hap, ctx: ConvertContext): NoteEvent | null {
  const raw = hap.value;
  const value: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : { note: raw };

  // An instrument comes from .inst() or from a sound name in .s().
  let inst: ResolvedInstrument | undefined;
  let channel: ChannelTarget | undefined = channelFromName(value.ch);
  if (value.ch !== undefined && !channel) {
    ctx.warn(`Unknown channel "${String(value.ch)}". Use p1, p2, pulse, tri, noise or dmc.`);
    return null;
  }
  const instName = value.inst ?? value.s;
  if (typeof instName === 'string') {
    const asChannel = channelFromName(instName);
    if (asChannel && value.inst === undefined) {
      channel ??= asChannel;
    } else {
      inst = getInstrument(instName);
      if (!inst && channel !== 'dmc' && !ctx.samples?.has(instName)) {
        ctx.warn(`Unknown sound "${instName}".`);
        return null;
      }
    }
  }
  const field = (name: string): unknown => value[name] ?? inst?.defaults[name];
  channel ??= inst?.channel ?? (ctx.samples?.has(String(value.s)) ? 'dmc' : 'pulse');

  const whole = hap.whole!;
  const clip = num(value.clip) ?? num(value.legato) ?? 1;
  const seconds = ((whole.end.valueOf() - whole.begin.valueOf()) * clip) / ctx.cps;
  const duration = Math.max(1, Math.round(seconds * ctx.fps));

  const event: NoteEvent = { channel, duration, note: 60 };

  if (channel === 'noise') {
    event.note = num(field('n')) ?? (toMidi(value.note) ?? 12) % 16;
  } else if (channel === 'dmc') {
    const name = typeof value.s === 'string' && value.s !== 'dmc' && value.s !== 'dpcm' ? value.s : undefined;
    const sample = name ? ctx.samples?.get(name, num(value.n) ?? 0) : undefined;
    if (!sample) {
      ctx.warn(name ? `Unknown DPCM sample "${name}".` : 'DMC notes need a sample name, like s("kick").');
      return null;
    }
    event.sample = { ...sample };
    const rate = num(field('rate'));
    if (rate !== undefined) event.sample.rate = Math.max(0, Math.min(15, Math.round(rate)));
  } else {
    const freq = num(value.freq);
    const midi = freq !== undefined ? frequencyToMidi(freq) : (toMidi(value.note) ?? toMidi(field('n')));
    event.note = midi ?? 60;
  }

  const vol = num(field('vol'));
  const gain = num(value.gain);
  const velocity = num(value.velocity) ?? 1;
  if (vol !== undefined) event.volume = Math.max(0, Math.min(15, Math.round(vol * velocity)));
  else if (gain !== undefined || velocity !== 1) {
    event.volume = Math.max(0, Math.min(15, Math.round((gain ?? 1) * velocity * 15)));
  }

  const duty = dutyIndex(field('duty'));
  if (duty !== undefined) event.duty = duty;

  const macros = { ...inst?.macros };
  for (const [control, key] of Object.entries(MACRO_CONTROLS)) {
    if (value[control]) macros[key] = value[control] as Macro;
  }
  if (Object.keys(macros).length > 0) event.instrument = macros;

  const vib = num(field('vib'));
  if (vib) {
    event.vibrato = vib;
    event.vibratoDepth = num(field('vibmod')) ?? 0.5;
  }
  const slide = num(field('slide'));
  if (slide) event.slide = slide;
  const glide = num(field('glide'));
  if (glide) event.glide = glide;
  if (field('metal')) event.metal = true;

  const sweep = num(value.sweep);
  if (sweep) {
    event.sweep = {
      shift: Math.min(7, Math.abs(Math.round(sweep))),
      up: sweep > 0,
      period: Math.max(0, Math.min(7, Math.round(num(value.sweeprate) ?? 0))),
    };
  }

  const arp = value.chordarp;
  if (arp !== undefined && arp !== false && arp !== 0) {
    const mode = (arp === true || arp === 1 ? 'up' : String(arp)) as ArpMode;
    if (ARP_MODES.has(mode)) event.chordArp = mode;
    else ctx.warn(`Unknown chordarp mode "${String(arp)}". Use up, down, updown or downup.`);
    const speed = num(value.arpspeed);
    if (speed) event.arpSpeed = speed;
  }

  return event;
}
