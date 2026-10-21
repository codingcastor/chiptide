import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import {
  ChangeSet,
  EditorState,
  StateEffect,
  StateField,
  type ChangeDesc,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { CodeRange, FunctionDoc } from '@chiptide/engine';

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  docs: readonly FunctionDoc[];
  /** Sound names offered inside s("...") and channel names inside ch("..."). */
  sounds: () => string[];
  onRun: () => void;
  onStop: () => void;
  onChange?: () => void;
}

// ------------------------------------------------------------------ highlighting of playing code

const setHighlights = StateEffect.define<{ from: number; to: number }[]>();
const markEvaluated = StateEffect.define<null>();

/** Changes made since the code was last evaluated, to map highlight positions onto the current text. */
const sinceEvaluation = StateField.define<ChangeDesc>({
  create: (state) => ChangeSet.empty(state.doc.length).desc,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(markEvaluated))) return ChangeSet.empty(tr.newDoc.length).desc;
    return tr.docChanged ? value.composeDesc(tr.changes.desc) : value;
  },
});

const activeMark = Decoration.mark({ class: 'cm-playing' });

const highlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setHighlights)) continue;
      const mapping = tr.state.field(sinceEvaluation);
      const ranges: Range<Decoration>[] = [];
      for (const { from, to } of effect.value) {
        if (to > mapping.length) continue;
        const a = mapping.mapPos(from, 1);
        const b = mapping.mapPos(to, -1);
        if (b > a) ranges.push(activeMark.range(a, b));
      }
      value = Decoration.set(ranges, true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ------------------------------------------------------------------ error marking

const setError = StateEffect.define<CodeRange | null>();

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setError)) continue;
      const range = effect.value;
      if (!range) {
        value = Decoration.none;
        continue;
      }
      const doc = tr.state.doc;
      const from = Math.min(range.from, doc.length);
      const to = Math.min(Math.max(range.to, from + 1), doc.length);
      const line = doc.lineAt(from);
      const marks: Range<Decoration>[] = [Decoration.line({ class: 'cm-error-line' }).range(line.from)];
      if (to > from) marks.push(Decoration.mark({ class: 'cm-error' }).range(from, to));
      value = Decoration.set(marks, true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ------------------------------------------------------------------ completion and hover

function docInfo(doc: FunctionDoc): () => Node {
  return () => {
    const root = document.createElement('div');
    root.className = 'cm-doc';
    const sig = document.createElement('code');
    sig.textContent = doc.signature;
    const summary = document.createElement('p');
    summary.textContent = doc.summary;
    root.append(sig, summary);
    if (doc.details) {
      const details = document.createElement('p');
      details.textContent = doc.details;
      root.append(details);
    }
    const example = document.createElement('pre');
    example.textContent = doc.example;
    root.append(example);
    return root;
  };
}

/** Option values offered inside the string argument of some functions. */
function stringOptions(fn: string, sounds: () => string[]): string[] | null {
  switch (fn) {
    case 's':
    case 'sound':
    case 'inst':
      return sounds();
    case 'ch':
      return ['p1', 'p2', 'pulse', 'tri', 'noise', 'dmc'];
    case 'chordarp':
      return ['up', 'down', 'updown', 'downup'];
    case 'duty':
      return ['12.5', '25', '50', '75'];
    default:
      return null;
  }
}

function completions(docs: readonly FunctionDoc[], sounds: () => string[]) {
  const methods: Completion[] = docs
    .filter((d) => d.method)
    .map((d) => ({ label: d.name, type: 'method', detail: d.signature, info: docInfo(d), boost: 10 }));
  const functions: Completion[] = docs
    .filter((d) => !d.method)
    .map((d) => ({ label: d.name, type: 'function', detail: d.signature, info: docInfo(d), boost: 10 }));

  return (context: CompletionContext): CompletionResult | null => {
    // Inside a string argument: s("hh| → sound names.
    const inString = context.matchBefore(/(\w+)\(\s*["'`][^"'`]*$/);
    if (inString) {
      const fn = /^(\w+)/.exec(inString.text)![1];
      const options = stringOptions(fn, sounds);
      if (!options) return null;
      const word = context.matchBefore(/[\w.#^-]*$/)!;
      return {
        from: word.from,
        options: options.map((label) => ({ label, type: 'constant' })),
        validFor: /^[\w.#^-]*$/,
      };
    }
    const member = context.matchBefore(/\.\w*$/);
    if (member) return { from: member.from + 1, options: methods, validFor: /^\w*$/ };
    const word = context.matchBefore(/\w+$/);
    if (!word && !context.explicit) return null;
    return { from: word?.from ?? context.pos, options: functions, validFor: /^\w*$/ };
  };
}

function docsTooltip(docs: readonly FunctionDoc[]) {
  return hoverTooltip((view, pos) => {
    const { from, to, text } = view.state.doc.lineAt(pos);
    let start = pos;
    let end = pos;
    while (start > from && /\w/.test(text[start - from - 1])) start--;
    while (end < to && /\w/.test(text[end - from])) end++;
    if (start === end) return null;
    const doc = docs.find((d) => d.name === text.slice(start - from, end - from));
    if (!doc) return null;
    return { pos: start, end, above: true, create: () => ({ dom: docInfo(doc)() as HTMLElement }) };
  });
}

// ------------------------------------------------------------------ theme

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--syntax-keyword)' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: 'var(--syntax-function)',
  },
  { tag: tags.propertyName, color: 'var(--syntax-property)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--muted)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--panel)', color: 'var(--text)' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
    lineHeight: '1.6',
  },
  '.cm-content': { caretColor: 'var(--accent)', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--panel)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
});

// ------------------------------------------------------------------ editor

export class CodeEditor {
  readonly view: EditorView;
  private highlighted = '';

  constructor(options: EditorOptions) {
    const runKeys = keymap.of([
      { key: 'Mod-Enter', run: () => (options.onRun(), true), preventDefault: true },
      { key: 'Mod-.', run: () => (options.onStop(), true), preventDefault: true },
      { key: 'Mod-/', run: toggleComment },
    ]);
    this.view = new EditorView({
      parent: options.parent,
      state: EditorState.create({
        doc: options.doc,
        extensions: [
          runKeys,
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightSelectionMatches(),
          javascript(),
          syntaxHighlighting(highlightStyle),
          autocompletion({ override: [completions(options.docs, options.sounds)] }),
          docsTooltip(options.docs),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          sinceEvaluation,
          highlights,
          errorField,
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Code', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) options.onChange?.();
          }),
        ],
      }),
    });
  }

  get code(): string {
    return this.view.state.doc.toString();
  }

  set code(text: string) {
    this.highlighted = '';
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      effects: [setHighlights.of([]), setError.of(null)],
    });
  }

  /** Call when the current text is evaluated: highlight positions refer to it from now on. */
  markEvaluated(): void {
    this.highlighted = '';
    this.view.dispatch({ effects: [markEvaluated.of(null), setError.of(null)] });
  }

  /** Highlights code ranges given as offsets in the last evaluated text. */
  highlight(ranges: { start: number; end: number }[]): void {
    // Chord notes share their location: highlight each range once.
    const unique = [...new Map(ranges.map((r) => [`${r.start}-${r.end}`, r])).values()];
    unique.sort((a, b) => a.start - b.start || a.end - b.end);
    ranges = unique;
    const key = ranges.map((r) => `${r.start}-${r.end}`).join(',');
    if (key === this.highlighted) return;
    this.highlighted = key;
    this.view.dispatch({ effects: setHighlights.of(ranges.map((r) => ({ from: r.start, to: r.end }))) });
  }

  showError(range: CodeRange | null): void {
    this.view.dispatch({ effects: setError.of(range) });
    if (range) {
      this.view.dispatch({
        effects: EditorView.scrollIntoView(Math.min(range.from, this.view.state.doc.length)),
      });
    }
  }

  focus(): void {
    this.view.focus();
  }
}
