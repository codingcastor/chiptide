import { describe, expect, it } from 'vitest';
import { Session, encodeDpcm, encodeWav, evaluateCode, renderCode, toMacro } from '../src';

const rms = (s: Float32Array) => Math.sqrt(s.reduce((a, x) => a + x * x, 0) / s.length);

describe('evaluateCode', () => {
  it('evaluates mini-notation and NES controls', async () => {
    const { pattern } = await evaluateCode(`note("c4 e4").ch("p2").duty(25).vol(9)`);
    const values = pattern.queryArc(0, 1).map((h) => h.value);
    expect(values).toEqual([
      { note: 'c4', ch: 'p2', duty: 25, vol: 9 },
      { note: 'e4', ch: 'p2', duty: 25, vol: 9 },
    ]);
  });

  it('stacks $: patterns and reads setcps', async () => {
    const { pattern, cps } = await evaluateCode(
      `setcps(1)\n$: note("c3").s("tri")\n$: s("hh*2")\n_$: note("g4")`,
    );
    expect(cps).toBe(1);
    expect(pattern.queryArc(0, 1)).toHaveLength(3);
  });

  it('parses macros from arrays and single-quoted strings', async () => {
    expect(toMacro([15, 12, '|', 8, '/', 0])).toEqual({ values: [15, 12, 8, 0], loop: 2, release: 3 });
    const { pattern } = await evaluateCode(`note("c4").env('15 10 | 5')`);
    expect(pattern.queryArc(0, 1)[0].value.env).toEqual({ values: [15, 10, 5], loop: 2, release: -1 });
  });

  it('explains how to write macros when given a mini-notation pattern', async () => {
    await expect(evaluateCode(`note("c4").env("15 12")`)).rejects.toThrow(/single-quoted/);
  });

  it('supports scales and chords from @strudel/tonal', async () => {
    const { pattern } = await evaluateCode(`n("0 2 4").scale("C4:major")`);
    expect(pattern.queryArc(0, 1).map((h) => h.value.note)).toEqual(['C4', 'E4', 'G4']);
  });
});

describe('Session', () => {
  it('places notes on frames and converts them to driver events', async () => {
    const session = new Session();
    await session.evaluate(`setcps(0.5)\nnote("a4 a5").ch("p1")`);
    const frames = session.nextFrames(Math.round(session.fps * 2));
    const noteFrames = frames.flatMap((w, i) => (w.some((x) => x.address === 0x4003) ? [i] : []));
    // One note at frame 0, the next one after one second.
    expect(noteFrames).toEqual([0, 60]);
    expect(frames[0].find((w) => w.address === 0x4002)?.value).toBe(253);
  });

  it('routes sound names to channels and presets', async () => {
    const session = new Session();
    await session.evaluate(`s("tri hh kick")`);
    const writes = session.nextFrames(Math.round(session.fps * 2)).flat();
    const has = (a: number) => writes.some((w) => w.address === a);
    expect(has(0x400a)).toBe(true); // triangle
    expect(has(0x400e)).toBe(true); // noise hi-hat
    expect(writes.some((w) => w.address === 0x4015 && w.value === 0x1f)).toBe(true); // DPCM kick
  });

  it('defines instruments', async () => {
    const session = new Session();
    await session.evaluate(
      `instrument('lead', { ch: 'p1', duty: 1, env: [15, '|', 10] })\nnote("c5").s('lead')`,
    );
    const [first] = session.nextFrames(1);
    expect(first.findLast((w) => w.address === 0x4000)?.value).toBe(0x40 | 0x30 | 15);
  });

  it('warns once about unknown sounds', async () => {
    const warnings: string[] = [];
    const session = new Session({ onWarning: (w) => warnings.push(w) });
    await session.evaluate(`s("nope*4")`);
    session.nextFrames(200);
    expect(warnings).toEqual(['Unknown sound "nope".']);
  });
});

describe('renderCode', () => {
  it('renders audible, deterministic audio', async () => {
    const code = `stack(note("c4 e4 g4 c5").duty(1), note("c2 g2").s("tri"), s("hh*4"))`;
    const a = await renderCode(code, { cycles: 1, sampleRate: 44100 });
    const b = await renderCode(code, { cycles: 1, sampleRate: 44100 });
    // Two seconds, rounded up to a whole frame.
    expect(a.samples.length).toBeGreaterThanOrEqual(2 * 44100);
    expect(a.samples.length).toBeLessThan(2 * 44100 + 800);
    expect(rms(a.samples)).toBeGreaterThan(0.02);
    expect(a.samples).toEqual(b.samples);
    expect(a.warnings).toEqual([]);
  });

  it('keeps its register stream stable', async () => {
    const { frames } = await renderCode(
      `note("<c4 e4>*2").env([15, 12, 9, 6, 3, 0]).duty("0 2").vib(5)\n` +
        `.stack(note("c3,e3,g3").s("tri").chordarp("up"), s("hh sd"))`,
      { cycles: 1 },
    );
    const hex = frames.map((f, i) =>
      f.length ? `${i}: ${f.map((w) => `${w.address.toString(16)}=${w.value.toString(16)}`).join(' ')}` : '',
    );
    expect(hex.filter(Boolean).join('\n')).toMatchSnapshot();
  });
});

describe('encoders', () => {
  it('writes a valid WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 44100);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getInt16(46, true)).toBe(32767);
  });

  it('encodes DPCM with lengths of the form 16n + 1', () => {
    const data = encodeDpcm(new Float32Array(1000).fill(0.5), 33144);
    expect((data.length - 1) % 16).toBe(0);
  });
});
