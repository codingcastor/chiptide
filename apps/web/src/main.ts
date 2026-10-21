import workletUrl from '@chiptide/apu/worklet?worker&url';
import { ChiptideError, FUNCTIONS, LivePlayer, instrumentNames } from '@chiptide/engine';
import { CodeEditor } from './editor';
import { HelpPanel } from './help';
import { RegisterView } from './registers';
import { ChannelScopes, PROBE_POINTS } from './scopes';

const examples = import.meta.glob<string>('../../../examples/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const exampleNames = Object.keys(examples).sort();
const nameOf = (path: string) => path.split('/').pop()!.replace(/\.js$/, '');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLDivElement>('status');
const exampleSelect = $<HTMLSelectElement>('examples');
const volume = $<HTMLInputElement>('volume');
const scope = $<HTMLCanvasElement>('scope');

// ------------------------------------------------------------------ status line

const warnings = new Set<string>();
let statusMessage: { kind: 'ok' | 'error'; text: string } = { kind: 'ok', text: '' };

function renderStatus(): void {
  status.innerHTML = '';
  const line = document.createElement('div');
  line.className = statusMessage.kind;
  line.textContent = statusMessage.text;
  status.append(line);
  for (const w of warnings) {
    const el = document.createElement('div');
    el.className = 'warn';
    el.textContent = `⚠ ${w}`;
    status.append(el);
  }
}

function showStatus(kind: 'ok' | 'error', text: string): void {
  statusMessage = { kind, text };
  renderStatus();
}

// ------------------------------------------------------------------ player and panels

const scopes = new ChannelScopes($('scopes'));
const registerView = new RegisterView($('registers'));
let visibleTab = 'channels';
/** False while an example from the help plays: its positions do not match the editor. */
let playingEditorCode = false;

const player = new LivePlayer({
  workletUrl,
  onWarning: (w) => {
    warnings.add(w);
    renderStatus();
  },
  onError: (e) => {
    showStatus('error', `Erreur pendant la lecture : ${e.message}`);
    if (e instanceof ChiptideError) editor.showError(e.range ?? null);
  },
  onFrame: (info) => {
    if (playingEditorCode) editor.highlight(info.locations);
    if (visibleTab === 'channels') scopes.update(info.probe, info.channels);
    if (visibleTab === 'registers') registerView.update(info.registers, info.writes);
  },
});
player.setProbe(PROBE_POINTS);

const editor = new CodeEditor({
  parent: $('editor'),
  doc: initialCode(),
  docs: FUNCTIONS,
  sounds: () => [...instrumentNames(), ...player.session.samples.names()],
  onRun: () => void play(),
  onStop: stop,
});

// Handy from the browser console, and used by the end-to-end tests.
Object.assign(window, { chiptide: player, chiptideEditor: editor });

async function play(): Promise<void> {
  warnings.clear();
  const code = editor.code;
  try {
    await player.evaluate(code);
    playingEditorCode = true;
    editor.markEvaluated();
    showStatus('ok', `▶ Lecture (${(player.session.cps * 60).toFixed(1)} cycles/min)`);
    save(code);
    startScope();
  } catch (e) {
    const range = e instanceof ChiptideError ? e.range : undefined;
    const where = range ? `Ligne ${range.line} : ` : '';
    showStatus('error', `${where}${(e as Error).message}`);
    editor.showError(range ?? null);
  }
}

function stop(): void {
  player.stop();
  editor.highlight([]);
  scopes.clear();
  showStatus('ok', '■ Arrêté');
}

new HelpPanel($('help'), FUNCTIONS, async (example, name) => {
  warnings.clear();
  try {
    await player.evaluate(example);
    playingEditorCode = false;
    editor.highlight([]);
    showStatus('ok', `▶ Exemple de ${name}. Ctrl+Entrée pour revenir à votre code.`);
    startScope();
  } catch (e) {
    showStatus('error', (e as Error).message);
  }
});

// ------------------------------------------------------------------ tabs

for (const tab of document.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
  tab.addEventListener('click', () => {
    visibleTab = tab.dataset.tab!;
    for (const t of document.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
      t.setAttribute('aria-selected', String(t === tab));
    }
    for (const panel of document.querySelectorAll<HTMLElement>('.tab-panel')) {
      panel.hidden = panel.dataset.panel !== visibleTab;
    }
  });
}

// ------------------------------------------------------------------ master oscilloscope

let analyser: AnalyserNode | null = null;
function startScope(): void {
  if (analyser || !player.audioContext || !player.output) return;
  analyser = player.audioContext.createAnalyser();
  analyser.fftSize = 2048;
  player.output.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const draw = () => {
    requestAnimationFrame(draw);
    if (visibleTab !== 'channels') return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(scope.clientWidth * ratio);
    const height = Math.round(scope.clientHeight * ratio);
    if (scope.width !== width || scope.height !== height) {
      scope.width = width;
      scope.height = height;
    }
    const ctx = scope.getContext('2d')!;
    analyser!.getFloatTimeDomainData(data);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    let start = 0;
    while (start < data.length / 2 && !(data[start] <= 0 && data[start + 1] > 0)) start++;
    const span = data.length / 2;
    for (let i = 0; i < span; i++) {
      const x = (i / span) * width;
      const y = height / 2 - data[start + i] * height * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  draw();
}

// ------------------------------------------------------------------ code storage

function encode(code: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(code)));
}
function decode(text: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));
}
function save(code: string): void {
  history.replaceState(null, '', `#${encode(code)}`);
  try {
    localStorage.setItem('chiptide:code', code);
  } catch {
    // Storage can be unavailable (private mode); the URL still has the code.
  }
}
function initialCode(): string {
  if (location.hash.length > 1) {
    try {
      return decode(location.hash.slice(1));
    } catch {
      // Ignore a malformed link and fall back.
    }
  }
  try {
    const stored = localStorage.getItem('chiptide:code');
    if (stored) return stored;
  } catch {
    // Ignore unavailable storage.
  }
  return examples[exampleNames.find((p) => p.endsWith('/intro.js')) ?? exampleNames[0]] ?? '';
}

// ------------------------------------------------------------------ wiring

exampleSelect.append(new Option('Exemples…', ''));
for (const path of exampleNames) exampleSelect.append(new Option(nameOf(path), path));
exampleSelect.addEventListener('change', () => {
  if (!exampleSelect.value) return;
  editor.code = examples[exampleSelect.value];
  exampleSelect.value = '';
  if (player.playing) void play();
});

player.setVolume(1.5);
volume.addEventListener('input', () => player.setVolume(Number(volume.value) * 1.5));
$('play').addEventListener('click', () => void play());
$('stop').addEventListener('click', stop);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === '.') {
    event.preventDefault();
    stop();
  }
});

showStatus('ok', 'Ctrl+Entrée pour jouer, Ctrl+. pour arrêter.');
