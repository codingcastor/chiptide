import { macro, type ChannelTarget, type Instrument } from '@chiptide/driver';
import { toMacro, type MacroInput } from './controls';
import { ChiptideError, suggestion } from './errors';

/** What `instrument()` accepts: macros plus default note settings. */
export interface InstrumentDefinition {
  /** Default channel: p1, p2, pulse, tri, noise or dmc. */
  ch?: string;
  env?: MacroInput;
  dutyenv?: MacroInput;
  arpenv?: MacroInput;
  pitchenv?: MacroInput;
  duty?: number;
  vol?: number;
  /** Default pitch: MIDI note, or noise pitch 0-15 on the noise channel. */
  n?: number;
  metal?: boolean;
  vib?: number;
  vibmod?: number;
  slide?: number;
  glide?: number;
  sweep?: number;
  sweeprate?: number;
  chordarp?: string;
  arpspeed?: number;
  /** DPCM playback rate 0-15. */
  rate?: number;
  /** Strudel-style envelope, converted to a volume macro when `env` is not given. */
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

const INSTRUMENT_KEYS = [
  'ch',
  'env',
  'dutyenv',
  'arpenv',
  'pitchenv',
  'duty',
  'vol',
  'n',
  'metal',
  'vib',
  'vibmod',
  'slide',
  'glide',
  'sweep',
  'sweeprate',
  'chordarp',
  'arpspeed',
  'rate',
  'attack',
  'decay',
  'sustain',
  'release',
];

export interface ResolvedInstrument {
  name: string;
  channel?: ChannelTarget;
  macros: Instrument;
  /** Note fields used when the hap does not set them. */
  defaults: Record<string, unknown>;
}

export const CHANNEL_ALIASES: Record<string, ChannelTarget> = {
  pulse: 'pulse',
  square: 'pulse',
  sq: 'pulse',
  p1: 'pulse1',
  pulse1: 'pulse1',
  sq1: 'pulse1',
  p2: 'pulse2',
  pulse2: 'pulse2',
  sq2: 'pulse2',
  tri: 'triangle',
  triangle: 'triangle',
  noise: 'noise',
  dmc: 'dmc',
  dpcm: 'dmc',
};

const CHANNEL_NUMBERS: ChannelTarget[] = ['pulse1', 'pulse2', 'triangle', 'noise', 'dmc'];

export function channelFromName(name: unknown): ChannelTarget | undefined {
  if (typeof name === 'number') return CHANNEL_NUMBERS[name];
  if (typeof name !== 'string') return undefined;
  return CHANNEL_ALIASES[name.toLowerCase()];
}

export function resolveInstrument(name: string, def: InstrumentDefinition): ResolvedInstrument {
  if (!def || typeof def !== 'object') {
    throw new ChiptideError(
      `instrument('${name}') : la définition doit être un objet { ch, duty, env, ... }.`,
    );
  }
  for (const key of Object.keys(def)) {
    if (!INSTRUMENT_KEYS.includes(key)) {
      throw new ChiptideError(
        `instrument('${name}') : propriété inconnue « ${key} ».${suggestion(key, INSTRUMENT_KEYS)}`,
      );
    }
  }
  const macros: Instrument = {};
  if (def.env !== undefined) macros.volume = toMacro(def.env, 'env', `instrument('${name}').env`);
  if (def.dutyenv !== undefined)
    macros.duty = toMacro(def.dutyenv, 'dutyenv', `instrument('${name}').dutyenv`);
  if (def.arpenv !== undefined)
    macros.arpeggio = toMacro(def.arpenv, 'arpenv', `instrument('${name}').arpenv`);
  if (def.pitchenv !== undefined)
    macros.pitch = toMacro(def.pitchenv, 'pitchenv', `instrument('${name}').pitchenv`);
  const channel = def.ch === undefined ? undefined : channelFromName(def.ch);
  if (def.ch !== undefined && !channel) {
    throw new ChiptideError(
      `instrument('${name}') : canal inconnu « ${def.ch} ».${suggestion(String(def.ch), Object.keys(CHANNEL_ALIASES))}`,
    );
  }
  const { ch: _ch, env: _e, dutyenv: _d, arpenv: _a, pitchenv: _p, ...defaults } = def;
  return { name, channel, macros, defaults };
}

/** Built-in drums, in the style of NES games. */
const PRESETS: Record<string, InstrumentDefinition> = {
  // Noise drums. n is the noise pitch (15 brightest).
  hh: { ch: 'noise', n: 14, env: [9, 6, 3, 1, 0] },
  oh: { ch: 'noise', n: 14, env: [10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1, 0] },
  sd: { ch: 'noise', n: 9, env: [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0], arpenv: [2, 0] },
  bd: { ch: 'noise', n: 3, env: [15, 11, 7, 4, 2, 0], arpenv: [3, 1, 0] },
  cr: {
    ch: 'noise',
    n: 11,
    env: [15, 14, 13, 12, 11, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0],
  },
  mt: { ch: 'noise', n: 12, metal: true, env: [10, 7, 4, 2, 0] },
  // Triangle kick: a fast downward pitch drop, the classic NES bass drum.
  tk: { ch: 'tri', n: 48, env: [15, 15, 15, 15, 0], pitchenv: [0, -6, -12, -18, -24] },
};

const registry = new Map<string, ResolvedInstrument>();

function loadPresets(): void {
  for (const [name, def] of Object.entries(PRESETS)) registry.set(name, resolveInstrument(name, def));
}
loadPresets();

/** Defines an instrument usable with `.s(name)` or `.inst(name)`. Returns its name. */
export function instrument(name: string, def: InstrumentDefinition): string {
  if (typeof name !== 'string' || !name) {
    throw new ChiptideError(
      `instrument() : le premier argument est le nom, par exemple instrument('lead', { ... }).`,
    );
  }
  registry.set(name, resolveInstrument(name, def));
  return name;
}

export const getInstrument = (name: string): ResolvedInstrument | undefined => registry.get(name);

export const instrumentNames = (): string[] => [...registry.keys()];

/** Forgets user instruments (between evaluations), keeping the presets. */
export function resetInstruments(): void {
  registry.clear();
  loadPresets();
}

export const presetNames = (): string[] => Object.keys(PRESETS);

export { macro };
