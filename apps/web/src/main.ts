import workletUrl from '@chiptide/apu/worklet?worker&url';
import { LivePlayer } from '@chiptide/engine';

const examples = import.meta.glob<string>('../../../examples/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const exampleNames = Object.keys(examples).sort();
const nameOf = (path: string) => path.split('/').pop()!.replace(/\.js$/, '');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = $<HTMLTextAreaElement>('code');
const status = $<HTMLDivElement>('status');
const exampleSelect = $<HTMLSelectElement>('examples');
const volume = $<HTMLInputElement>('volume');
const scope = $<HTMLCanvasElement>('scope');

const CHANNELS = [
  { id: 'pulse1', label: 'Pulse 1', max: 15 },
  { id: 'pulse2', label: 'Pulse 2', max: 15 },
  { id: 'triangle', label: 'Triangle', max: 15 },
  { id: 'noise', label: 'Noise', max: 15 },
  { id: 'dmc', label: 'DPCM', max: 127 },
] as const;

const channelList = $<HTMLUListElement>('channels');
const meters = CHANNELS.map((ch) => {
  const li = document.createElement('li');
  li.style.setProperty('--color', `var(--${ch.id})`);
  li.innerHTML = `<span>${ch.label}</span><span class="note">—</span><span class="bar"><span></span></span>`;
  channelList.append(li);
  return {
    note: li.querySelector('.note') as HTMLElement,
    bar: li.querySelector('.bar span') as HTMLElement,
  };
});

// ------------------------------------------------------------------ status

const warnings = new Set<string>();
function showStatus(kind: 'ok' | 'error', message: string): void {
  status.innerHTML = '';
  const line = document.createElement('div');
  line.className = kind;
  line.textContent = message;
  status.append(line);
  for (const w of warnings) {
    const el = document.createElement('div');
    el.className = 'warn';
    el.textContent = `⚠ ${w}`;
    status.append(el);
  }
}

// ------------------------------------------------------------------ player

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
};

let levels: number[] = [0, 0, 0, 0, 0];
const player = new LivePlayer({
  workletUrl,
  onWarning: (w) => {
    warnings.add(w);
    showStatus('ok', status.firstElementChild?.textContent ?? '');
  },
  onError: (e) => showStatus('error', `Erreur pendant la lecture : ${e.message}`),
  onFrame: ({ channels }) => {
    levels = channels.map((c) => (c.active ? c.volume : 0));
    channels.forEach((c, i) => {
      if (i === 4) meters[i].note.textContent = c.active ? '▶' : '—';
      else if (i === 3) meters[i].note.textContent = c.active ? `n${Math.round(c.pitch)}` : '—';
      else meters[i].note.textContent = c.active ? noteName(c.pitch) : '—';
    });
  },
});

// Handy from the browser console, and used by the end-to-end tests.
(window as unknown as { chiptide: LivePlayer }).chiptide = player;

async function play(): Promise<void> {
  warnings.clear();
  try {
    await player.evaluate(editor.value);
    showStatus('ok', `▶ Lecture (${(player.session.cps * 60).toFixed(1)} cycles/min)`);
    save();
    startScope();
  } catch (e) {
    showStatus('error', (e as Error).message);
  }
}

function stop(): void {
  player.stop();
  levels = [0, 0, 0, 0, 0];
  showStatus('ok', '■ Arrêté');
}

// ------------------------------------------------------------------ scope & meters

let analyser: AnalyserNode | null = null;
function startScope(): void {
  if (analyser || !player.audioContext || !player.output) return;
  analyser = player.audioContext.createAnalyser();
  analyser.fftSize = 2048;
  player.output.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const ctx = scope.getContext('2d')!;
  const draw = () => {
    requestAnimationFrame(draw);
    const { width, height } = scope;
    analyser!.getFloatTimeDomainData(data);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Start on a rising zero crossing so the waveform stands still.
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
    meters.forEach((m, i) => {
      m.bar.style.width = `${(levels[i] / (i === 4 ? 1 : CHANNELS[i].max)) * 100}%`;
    });
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
function save(): void {
  history.replaceState(null, '', `#${encode(editor.value)}`);
  try {
    localStorage.setItem('chiptide:code', editor.value);
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
  editor.value = examples[exampleSelect.value];
  exampleSelect.value = '';
  if (player.playing) play();
});

editor.value = initialCode();
volume.value = '1';
player.setVolume(1.5);
volume.addEventListener('input', () => player.setVolume(Number(volume.value) * 1.5));
$('play').addEventListener('click', play);
$('stop').addEventListener('click', stop);

editor.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    play();
  } else if ((event.ctrlKey || event.metaKey) && event.key === '.') {
    event.preventDefault();
    stop();
  } else if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === '.') {
    event.preventDefault();
    stop();
  }
});

showStatus('ok', 'Ctrl+Entrée pour jouer, Ctrl+. pour arrêter.');
