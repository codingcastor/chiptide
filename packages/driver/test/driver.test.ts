import { describe, expect, it } from 'vitest';
import type { RegisterWrite } from '@chiptide/apu';
import { Driver, MacroCursor, macro, pulsePeriod, scaleVolume, trianglePeriod, type NoteEvent } from '../src';

const note = (fields: Partial<NoteEvent>): NoteEvent => ({
  channel: 'pulse1',
  duration: 10,
  note: 69,
  ...fields,
});

/** Final value of each register after a list of writes. */
function registers(writes: RegisterWrite[]): Map<number, number> {
  return new Map(writes.map((w) => [w.address, w.value]));
}

const addresses = (writes: RegisterWrite[]) => writes.map((w) => w.address);

describe('pitch', () => {
  it('maps A4 to pulse period 253 and A2 to triangle period 507 (NTSC)', () => {
    expect(pulsePeriod(69, 'ntsc')).toBe(253);
    expect(trianglePeriod(45, 'ntsc')).toBe(507);
    expect(trianglePeriod(33, 'ntsc')).toBe(1016);
  });

  it('uses the PAL clock', () => {
    expect(pulsePeriod(69, 'pal')).toBe(235);
  });
});

describe('macros', () => {
  const values = (m: MacroCursor, frames: number, releaseAt = Infinity) => {
    const out: number[] = [];
    for (let i = 0; i < frames; i++) {
      if (i === releaseAt) m.release();
      out.push(m.value);
      m.advance();
    }
    return out;
  };

  it('loops while held and jumps to the release point on release', () => {
    const m = new MacroCursor(macro([15, 12, '|', 10, 9, '/', 6, 3, 0]));
    expect(values(m, 10, 7)).toEqual([15, 12, 10, 9, 10, 9, 10, 6, 3, 0]);
  });

  it('holds the value before the release point while held', () => {
    const m = new MacroCursor(macro([15, '/', 8, 0]));
    expect(values(m, 6, 4)).toEqual([15, 15, 15, 15, 8, 0]);
  });

  it('holds the last value without markers', () => {
    expect(values(new MacroCursor(macro([3, 2, 1])), 5)).toEqual([3, 2, 1, 1, 1]);
  });

  it('holds the first value when the release point is first', () => {
    const m = new MacroCursor(macro(['/', 8, 0]));
    expect(values(m, 4, 2)).toEqual([8, 8, 8, 0]);
  });

  it('rejects empty macros', () => {
    expect(() => macro(['|'])).toThrow();
  });
});

describe('scaleVolume', () => {
  it('multiplies on a 0-15 scale without rounding to silence', () => {
    expect(scaleVolume(15, 15)).toBe(15);
    expect(scaleVolume(15, 8)).toBe(8);
    expect(scaleVolume(1, 1)).toBe(1);
    expect(scaleVolume(0, 15)).toBe(0);
  });
});

describe('Driver', () => {
  it('initialises the APU', () => {
    const r = registers(new Driver().init());
    expect(r.get(0x4015)).toBe(0x0f);
    expect(r.get(0x4001)).toBe(0x08);
    expect(r.get(0x4008)).toBe(0x80);
  });

  it('plays a pulse note and releases it', () => {
    const driver = new Driver();
    driver.init();
    const first = registers(driver.frame([note({ duration: 2, duty: 1, volume: 12 })]));
    expect(first.get(0x4000)).toBe(0x40 | 0x30 | 12);
    expect(first.get(0x4002)).toBe(253);
    expect(first.get(0x4003)).toBe(0x08);
    expect(driver.frame([])).toEqual([]); // nothing changes while held
    const release = registers(driver.frame([]));
    expect(release.get(0x4000)).toBe(0x40 | 0x30);
    expect(driver.channelStates[0].active).toBe(false);
  });

  it('does not rewrite the high period byte unless it changes, to avoid phase resets', () => {
    const driver = new Driver();
    driver.init();
    driver.frame([note({ vibrato: 6, vibratoDepth: 0.3 })]);
    const writes = [1, 2, 3, 4, 5].flatMap(() => driver.frame([]));
    expect(addresses(writes)).toContain(0x4002);
    expect(addresses(writes)).not.toContain(0x4003);
  });

  it('retriggers on a new note but not when gliding', () => {
    const driver = new Driver();
    driver.init();
    driver.frame([note({ note: 60 })]);
    expect(addresses(driver.frame([note({ note: 60 })]))).toContain(0x4003);
    const glide = driver.frame([note({ note: 62, glide: 4 })]);
    expect(addresses(glide)).not.toContain(0x4003);
    expect(driver.channelStates[0].pitch).toBe(60);
    driver.frame([]);
    expect(driver.channelStates[0].pitch).toBeCloseTo(60.5);
  });

  it('applies volume, duty and arpeggio macros', () => {
    const driver = new Driver();
    driver.init();
    const instrument = {
      volume: macro([15, 10, 5]),
      duty: macro([0, 2]),
      arpeggio: macro(['|', 0, 12]),
    };
    const f0 = registers(driver.frame([note({ instrument })]));
    const f1 = registers(driver.frame([]));
    expect(f0.get(0x4000)).toBe(0x00 | 0x30 | 15);
    expect(f1.get(0x4000)).toBe(0x80 | 0x30 | 10);
    expect(f1.get(0x4002)).toBe(pulsePeriod(81, 'ntsc') & 0xff);
  });

  it('plays the release part of the volume macro after the note ends', () => {
    const driver = new Driver();
    driver.init();
    const instrument = { volume: macro([12, '/', 6, 0]) };
    driver.frame([note({ duration: 2, instrument })]);
    driver.frame([]);
    expect(registers(driver.frame([])).get(0x4000)! & 15).toBe(6);
    expect(registers(driver.frame([])).get(0x4000)! & 15).toBe(0);
    expect(driver.channelStates[0].active).toBe(false);
  });

  it('spreads automatic pulse notes over both pulse channels', () => {
    const driver = new Driver();
    driver.init();
    const r = registers(
      driver.frame([note({ channel: 'pulse', note: 60 }), note({ channel: 'pulse', note: 64 })]),
    );
    expect(r.get(0x4002)).toBe(pulsePeriod(64, 'ntsc') & 0xff);
    expect(r.get(0x4006)).toBe(pulsePeriod(60, 'ntsc') & 0xff);
  });

  it('prefers a free pulse channel for automatic notes', () => {
    const driver = new Driver();
    driver.init();
    driver.frame([note({ channel: 'pulse1', duration: 100 })]);
    const r = registers(driver.frame([note({ channel: 'pulse', note: 72 })]));
    expect(r.get(0x4006)).toBe(pulsePeriod(72, 'ntsc') & 0xff);
  });

  it('keeps the highest note and warns when a channel gets a chord', () => {
    const warnings: string[] = [];
    const driver = new Driver({ onWarning: (w) => warnings.push(w) });
    driver.init();
    driver.frame([note({ note: 60 }), note({ note: 67 }), note({ note: 64 })]);
    expect(driver.channelStates[0].pitch).toBe(67);
    expect(warnings).toHaveLength(1);
  });

  it('keeps the lowest noise drum when they collide', () => {
    const driver = new Driver();
    driver.init();
    driver.frame([note({ channel: 'noise', note: 14 }), note({ channel: 'noise', note: 3 })]);
    expect(driver.channelStates[3].pitch).toBe(3);
  });

  it('arpeggiates chords with chordArp', () => {
    const driver = new Driver();
    driver.init();
    const chord = [60, 64, 67].map((n) => note({ note: n, chordArp: 'up', arpSpeed: 2 }));
    const pitches: number[] = [];
    driver.frame(chord);
    pitches.push(driver.channelStates[0].pitch);
    for (let i = 0; i < 6; i++) {
      driver.frame([]);
      pitches.push(driver.channelStates[0].pitch);
    }
    expect(pitches).toEqual([60, 60, 64, 64, 67, 67, 60]);
  });

  it('mutes the triangle with its linear counter', () => {
    const driver = new Driver();
    driver.init();
    const on = registers(driver.frame([note({ channel: 'triangle', note: 45, duration: 1 })]));
    expect(on.get(0x4008)).toBe(0xff);
    expect(on.get(0x400a)).toBe(trianglePeriod(45, 'ntsc') & 0xff);
    expect(on.has(0x400b)).toBe(true);
    expect(registers(driver.frame([])).get(0x4008)).toBe(0x80);
  });

  it('plays noise with pitch and mode', () => {
    const driver = new Driver();
    driver.init();
    const r = registers(driver.frame([note({ channel: 'noise', note: 12, metal: true, volume: 9 })]));
    expect(r.get(0x400c)).toBe(0x30 | 9);
    expect(r.get(0x400e)).toBe(0x80 | 3);
    expect(r.get(0x400f)).toBe(0xf8);
  });

  it('starts DPCM samples', () => {
    const driver = new Driver();
    driver.init();
    const writes = driver.frame([
      note({ channel: 'dmc', sample: { address: 0xc040, length: 0x81, rate: 15, level: 64 } }),
    ]);
    expect(writes).toEqual([
      { address: 0x4015, value: 0x0f },
      { address: 0x4010, value: 0x0f },
      { address: 0x4011, value: 64 },
      { address: 0x4012, value: 1 },
      { address: 0x4013, value: 8 },
      { address: 0x4015, value: 0x1f },
    ]);
  });

  it('writes the hardware sweep once per note', () => {
    const driver = new Driver();
    driver.init();
    const sweep = { shift: 3, period: 2, up: true };
    expect(registers(driver.frame([note({ sweep })])).get(0x4001)).toBe(0x80 | 0x20 | 0x08 | 3);
    expect(addresses(driver.frame([]))).not.toContain(0x4001);
  });
});
