import { noteToMidi, type Hap } from '@strudel/core';
import {
  frequencyToMidi,
  type ArpMode,
  type ChannelTarget,
  type Macro,
  type NoteEvent,
} from '@chiptide/driver';
import { adsrMacro } from './adsr';
import { MACRO_CONTROLS } from './controls';
import { suggestion } from './errors';
import {
  CHANNEL_ALIASES,
  channelFromName,
  getInstrument,
  instrumentNames,
  type ResolvedInstrument,
} from './instruments';
import type { SampleBank } from './samples';

const ARP_MODES = new Set<ArpMode>(['up', 'down', 'updown', 'downup']);
const DUTY_VALUES = new Set([0, 1, 2, 3, 12, 12.5, 25, 50, 75]);

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
      const midi = noteToMidi(value);
      return Number.isFinite(midi) ? midi : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(n) ? undefined : n;
};

/** A source position of the hap in the code, for highlighting. */
export interface Location {
  start: number;
  end: number;
}

/** A driver note plus where it came from in the code. */
export type SourcedEvent = NoteEvent & { locations?: Location[] };

export interface ConvertContext {
  cps: number;
  fps: number;
  samples?: SampleBank;
  warn: (message: string) => void;
}

/** Turns a Strudel hap into a note for the driver, or null when it cannot be played. */
export function hapToEvent(hap: Hap, ctx: ConvertContext): SourcedEvent | null {
  const raw = hap.value;
  const value: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : { note: raw };
  const { warn } = ctx;

  // An instrument comes from .inst() or from a sound name in .s().
  let inst: ResolvedInstrument | undefined;
  let channel: ChannelTarget | undefined = channelFromName(value.ch);
  if (value.ch !== undefined && !channel) {
    warn(
      `Canal inconnu « ${String(value.ch)} ».${suggestion(String(value.ch), Object.keys(CHANNEL_ALIASES))}` +
        ' Canaux : p1, p2, pulse, tri, noise, dmc.',
    );
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
        const known = [
          ...instrumentNames(),
          ...(ctx.samples?.names() ?? []),
          ...Object.keys(CHANNEL_ALIASES),
        ];
        warn(`Son inconnu « ${instName} ».${suggestion(instName, known)}`);
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

  const event: SourcedEvent = { channel, duration, note: 60 };
  if (hap.context?.locations?.length) event.locations = hap.context.locations;

  if (channel === 'noise') {
    const n = num(field('n'));
    if (n !== undefined && (n < 0 || n > 15)) warn(`Bruit : n va de 0 (grave) à 15 (aigu), reçu ${n}.`);
    event.note = n ?? (toMidi(value.note) ?? 12) % 16;
  } else if (channel === 'dmc') {
    const name = typeof value.s === 'string' && value.s !== 'dmc' && value.s !== 'dpcm' ? value.s : undefined;
    const sample = name ? ctx.samples?.get(name, num(value.n) ?? 0) : undefined;
    if (!sample) {
      warn(
        name
          ? `Sample DPCM inconnu « ${name} ».${suggestion(name, ctx.samples?.names() ?? [])}`
          : 'Le canal DPCM joue des samples : écrivez par exemple s("kick").',
      );
      return null;
    }
    event.sample = { ...sample };
    const rate = num(field('rate'));
    if (rate !== undefined) {
      if (rate < 0 || rate > 15) warn(`.rate() va de 0 (lent) à 15 (rapide), reçu ${rate}.`);
      event.sample.rate = Math.max(0, Math.min(15, Math.round(rate)));
    }
  } else {
    const freq = num(value.freq);
    const noteValue = value.note ?? field('n');
    const midi = freq !== undefined ? frequencyToMidi(freq) : toMidi(noteValue);
    if (midi === undefined && noteValue !== undefined) warn(`Note inconnue « ${String(noteValue)} ».`);
    event.note = midi ?? 60;
  }

  const vol = num(field('vol'));
  const gain = num(value.gain);
  const velocity = num(value.velocity) ?? 1;
  if (vol !== undefined) {
    if (vol < 0 || vol > 15) warn(`.vol() va de 0 à 15, reçu ${vol}.`);
    event.volume = Math.max(0, Math.min(15, Math.round(vol * velocity)));
  } else if (gain !== undefined || velocity !== 1) {
    event.volume = Math.max(0, Math.min(15, Math.round((gain ?? 1) * velocity * 15)));
  }

  const dutyValue = field('duty');
  const duty = dutyIndex(dutyValue);
  if (dutyValue !== undefined && (duty === undefined || !DUTY_VALUES.has(Number(dutyValue)))) {
    warn(`.duty() accepte 12.5, 25, 50, 75 (ou 0 à 3), reçu ${String(dutyValue)}.`);
  }
  if (duty !== undefined) event.duty = duty;

  const macros = { ...inst?.macros };
  for (const [control, key] of Object.entries(MACRO_CONTROLS)) {
    if (value[control]) macros[key] = value[control] as Macro;
  }
  if (!macros.volume) {
    const [attack, decay, sustain, release] = ['attack', 'decay', 'sustain', 'release'].map((k) =>
      num(field(k)),
    );
    if ([attack, decay, sustain, release].some((v) => v !== undefined)) {
      macros.volume = adsrMacro({ attack, decay, sustain, release }, ctx.fps);
    }
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

  const sweep = num(field('sweep'));
  if (sweep) {
    if (Math.abs(sweep) > 7) warn(`.sweep() va de -7 à 7, reçu ${sweep}.`);
    if (channel !== 'pulse' && channel !== 'pulse1' && channel !== 'pulse2') {
      warn('.sweep() ne fonctionne que sur les pulses.');
    }
    const rate = num(field('sweeprate')) ?? 0;
    if (rate < 0 || rate > 7) warn(`.sweeprate() va de 0 à 7, reçu ${rate}.`);
    event.sweep = {
      shift: Math.min(7, Math.abs(Math.round(sweep))),
      up: sweep > 0,
      period: Math.max(0, Math.min(7, Math.round(rate))),
    };
  }

  const arp = field('chordarp');
  if (arp !== undefined && arp !== false && arp !== 0) {
    const mode = (arp === true || arp === 1 ? 'up' : String(arp)) as ArpMode;
    if (ARP_MODES.has(mode)) event.chordArp = mode;
    else
      warn(
        `Mode d'arpège inconnu « ${String(arp)} ».${suggestion(String(arp), ARP_MODES)} Modes : up, down, updown, downup.`,
      );
    const speed = num(field('arpspeed'));
    if (speed !== undefined && speed < 1) warn(`.arpspeed() compte des frames : au moins 1, reçu ${speed}.`);
    if (speed) event.arpSpeed = speed;
  }

  return event;
}
