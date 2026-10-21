export { controls, toMacro, MACRO_CONTROLS, type MacroInput } from './controls';
export { evaluateCode, prepareScope, type Evaluation } from './evaluate';
export { dutyIndex, hapToEvent } from './events';
export { getInstrument, instrument, presetNames, type InstrumentDefinition } from './instruments';
export { LivePlayer, type LivePlayerOptions } from './live';
export { encodeWav, renderCode, type RenderOptions, type RenderResult } from './render';
export { DpcmBank, defaultBank, encodeDpcm, type SampleBank } from './samples';
export { Session, type SessionOptions } from './session';
export { PatternStream } from './stream';
