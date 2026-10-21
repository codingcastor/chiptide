export { adsrMacro, type Adsr } from './adsr';
export { controls, toMacro, MACRO_CONTROLS, type MacroControl, type MacroInput } from './controls';
export { ChiptideError, closest, explainError, suggestion, type CodeRange } from './errors';
export { evaluateCode, knownNames, prepareScope, type Evaluation } from './evaluate';
export { dutyIndex, hapToEvent, type Location, type SourcedEvent } from './events';
export {
  getInstrument,
  instrument,
  instrumentNames,
  presetNames,
  type InstrumentDefinition,
} from './instruments';
export { LivePlayer, type FrameInfo, type LivePlayerOptions } from './live';
export { encodeWav, renderCode, type RenderOptions, type RenderResult } from './render';
export { DpcmBank, defaultBank, encodeDpcm, type SampleBank } from './samples';
export { Session, type SessionOptions } from './session';
export { PatternStream } from './stream';
export { CATEGORIES, FUNCTIONS, findDoc, referenceMarkdown, type Category, type FunctionDoc } from './docs';
export type { ChannelState, NoteEvent } from '@chiptide/driver';
