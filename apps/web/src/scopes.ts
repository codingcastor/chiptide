import type { ChannelState } from '@chiptide/engine';

export const CHANNELS = [
  { id: 'pulse1', label: 'Pulse 1', max: 15 },
  { id: 'pulse2', label: 'Pulse 2', max: 15 },
  { id: 'triangle', label: 'Triangle', max: 15 },
  { id: 'noise', label: 'Noise', max: 15 },
  { id: 'dmc', label: 'DPCM', max: 127 },
] as const;

/** Probe points per frame requested from the worklet (about 15 kHz). */
export const PROBE_POINTS = 256;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
};

interface Scope {
  canvas: HTMLCanvasElement;
  note: HTMLElement;
  /** The last two frames of samples, so a trigger point can be found. */
  history: Uint8Array;
}

/** One small oscilloscope per channel, drawn from the APU's own channel outputs. */
export class ChannelScopes {
  private scopes: Scope[];
  private dirty = false;

  constructor(parent: HTMLElement) {
    this.scopes = CHANNELS.map((ch) => {
      const row = document.createElement('div');
      row.className = 'scope';
      row.style.setProperty('--color', `var(--${ch.id})`);
      row.innerHTML = `<div class="scope-label"><span>${ch.label}</span><span class="note">—</span></div>`;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `Oscilloscope ${ch.label}`);
      row.append(canvas);
      parent.append(row);
      return {
        canvas,
        note: row.querySelector('.note') as HTMLElement,
        history: new Uint8Array(PROBE_POINTS * 2),
      };
    });
    const draw = () => {
      requestAnimationFrame(draw);
      if (this.dirty) this.draw();
      this.dirty = false;
    };
    requestAnimationFrame(draw);
  }

  update(probe: Uint8Array[] | undefined, channels: readonly ChannelState[]): void {
    if (probe) {
      probe.forEach((samples, i) => {
        const history = this.scopes[i].history;
        const n = Math.min(samples.length, history.length);
        history.copyWithin(0, n);
        history.set(samples.subarray(samples.length - n), history.length - n);
      });
    }
    channels.forEach((c, i) => {
      const text = !c.active ? '—' : i === 4 ? '▶' : i === 3 ? `n${Math.round(c.pitch)}` : noteName(c.pitch);
      if (this.scopes[i].note.textContent !== text) this.scopes[i].note.textContent = text;
    });
    this.dirty = true;
  }

  clear(): void {
    for (const scope of this.scopes) {
      scope.history.fill(0);
      scope.note.textContent = '—';
    }
    this.dirty = true;
  }

  private draw(): void {
    const style = getComputedStyle(document.documentElement);
    this.scopes.forEach((scope, i) => {
      const { canvas, history } = scope;
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      // Start on a rising edge in the first half so periodic waves stand still.
      const span = PROBE_POINTS;
      let start = 0;
      for (let j = 1; j < span; j++) {
        if (history[j] > history[j - 1]) {
          start = j;
          break;
        }
      }
      const max = CHANNELS[i].max;
      ctx.strokeStyle = style.getPropertyValue(`--${CHANNELS[i].id}`);
      ctx.lineWidth = 1.5 * ratio;
      ctx.beginPath();
      const pad = 3 * ratio;
      for (let j = 0; j < span; j++) {
        const x = (j / (span - 1)) * width;
        const y = height - pad - (history[start + j] / max) * (height - 2 * pad);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
}
