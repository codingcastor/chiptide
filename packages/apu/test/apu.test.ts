import { describe, expect, it } from 'vitest';
import { Apu, BlipBuffer, FrameRenderer, Noise, Pulse, REGIONS, TND_MIX, PULSE_MIX, frameRate } from '../src';

const NTSC = REGIONS.ntsc;
const RATE = 48000;

/** Counts rising zero crossings in a signal, skipping the start so the filters settle. */
function frequency(samples: Float32Array, sampleRate: number): number {
  const start = Math.floor(sampleRate * 0.1);
  let mean = 0;
  for (let i = start; i < samples.length; i++) mean += samples[i];
  mean /= samples.length - start;
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = start + 1; i < samples.length; i++) {
    if (samples[i - 1] < mean && samples[i] >= mean) {
      if (first < 0) first = i;
      else count++;
      last = i;
    }
  }
  return (count * sampleRate) / (last - first);
}

function renderSeconds(apu: Apu, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * apu.sampleRate));
  apu.render(out);
  return out;
}

describe('timing', () => {
  it('runs NTSC frames at 60.0988 Hz and PAL at 50.007 Hz', () => {
    expect(frameRate('ntsc')).toBeCloseTo(60.0988, 3);
    expect(frameRate('pal')).toBeCloseTo(50.007, 3);
  });
});

describe('pulse', () => {
  it('plays A440 at timer period 253', () => {
    // The 440 Hz high-pass reshapes square waves; measure the raw staircase.
    const apu = new Apu({ sampleRate: RATE, filters: false });
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0xbf); // 50% duty, halt, constant volume 15
    apu.write(0x4001, 0x08);
    apu.write(0x4002, 253);
    apu.write(0x4003, 0x00);
    const expected = NTSC.cpuClock / (16 * 254);
    expect(frequency(renderSeconds(apu, 1), RATE)).toBeCloseTo(expected, 0);
  });

  it('produces each duty cycle', () => {
    for (const [duty, ratio] of [
      [0, 1 / 8],
      [1, 2 / 8],
      [2, 4 / 8],
      [3, 6 / 8],
    ]) {
      const pulse = new Pulse(true);
      pulse.length.setEnabled(true);
      pulse.write(0, (duty << 6) | 0x3f);
      pulse.write(2, 100);
      pulse.write(3, 0);
      let high = 0;
      for (let i = 0; i < 800; i++) {
        if (pulse.output() > 0) high++;
        pulse.clockTimer();
      }
      expect(high / 800).toBeCloseTo(ratio, 5);
    }
  });

  it('is muted by the sweep unit when the period is below 8 or the target overflows', () => {
    const pulse = new Pulse(true);
    pulse.length.setEnabled(true);
    pulse.write(0, 0xbf);
    pulse.write(1, 0x00); // shift 0, no negate: target = 2 * period
    pulse.write(2, 0xff);
    pulse.write(3, 0x04); // period 0x4ff -> target 0x9fe overflows
    expect(pulse.muted).toBe(true);
    pulse.write(1, 0x08); // negate keeps the target in range
    expect(pulse.muted).toBe(false);
    pulse.write(2, 5);
    pulse.write(3, 0);
    expect(pulse.muted).toBe(true);
  });

  it('sweeps the period down when enabled', () => {
    const pulse = new Pulse(false);
    pulse.write(1, 0x81); // enabled, period 0, shift 1, add
    pulse.write(2, 0x00);
    pulse.write(3, 0x01); // period 256
    pulse.clockHalf();
    expect(pulse.period).toBe(384);
    pulse.clockHalf();
    expect(pulse.period).toBe(576);
  });

  it('decays the envelope from 15 to 0 and stays there without loop', () => {
    const pulse = new Pulse(true);
    pulse.length.setEnabled(true);
    pulse.write(0, 0x80); // envelope period 0
    pulse.write(3, 0);
    pulse.clockQuarter(); // start
    expect(pulse.envelope.volume).toBe(15);
    for (let i = 0; i < 15; i++) pulse.clockQuarter();
    expect(pulse.envelope.volume).toBe(0);
    pulse.clockQuarter();
    expect(pulse.envelope.volume).toBe(0);
  });

  it('silences when the length counter runs out', () => {
    const pulse = new Pulse(true);
    pulse.length.setEnabled(true);
    pulse.write(0, 0x9f); // no halt
    pulse.write(3, 0x18); // length index 3 -> 2 half frames
    expect(pulse.length.value).toBe(2);
    pulse.clockHalf();
    pulse.clockHalf();
    expect(pulse.length.active).toBe(false);
  });
});

describe('triangle', () => {
  it('plays an octave below a pulse with the same period', () => {
    const apu = new Apu({ sampleRate: RATE });
    apu.write(0x4015, 0x04);
    apu.write(0x4008, 0xff);
    apu.write(0x400a, 253);
    apu.write(0x400b, 0x00);
    const expected = NTSC.cpuClock / (32 * 254);
    expect(frequency(renderSeconds(apu, 1), RATE)).toBeCloseTo(expected, 0);
  });

  it('holds its position when the linear counter reaches zero', () => {
    const apu = new Apu({ sampleRate: RATE });
    apu.write(0x4015, 0x04);
    apu.write(0x4008, 0x7f);
    apu.write(0x400a, 100);
    apu.write(0x400b, 0x00);
    apu.write(0x4008, 0x00); // reload 0, control clear
    renderSeconds(apu, 0.05);
    const step = apu.triangle.step;
    renderSeconds(apu, 0.05);
    expect(apu.triangle.step).toBe(step);
  });
});

describe('noise', () => {
  function lfsrPeriod(shortMode: boolean): number {
    const noise = new Noise(NTSC.noisePeriods);
    noise.write(2, shortMode ? 0x80 : 0);
    for (let i = 0; i < 200; i++) noise.clockTimer();
    const start = noise.shift;
    for (let i = 1; i <= 40000; i++) {
      noise.clockTimer();
      if (noise.shift === start) return i;
    }
    return -1;
  }

  it('has a 32767-step sequence in long mode', () => {
    expect(lfsrPeriod(false)).toBe(32767);
  });

  it('has a 93-step sequence in short mode', () => {
    expect(lfsrPeriod(true)).toBe(93);
  });
});

describe('dmc', () => {
  it('moves the output level by 2 for each sample bit and stops at the end', () => {
    const apu = new Apu({ sampleRate: RATE });
    apu.memory.fill(0xff, 0xc000, 0xc000 + 17);
    apu.write(0x4011, 0);
    apu.write(0x4010, 0x0f); // fastest rate
    apu.write(0x4012, 0x00);
    apu.write(0x4013, 0x01); // 17 bytes
    apu.write(0x4015, 0x10);
    renderSeconds(apu, 0.1);
    // 17 bytes of ones = 136 increments, clamped at 127 (last even step 126).
    expect(apu.dmc.level).toBe(126);
    expect(apu.dmc.bytesRemaining).toBe(0);
  });
});

describe('mixer', () => {
  it('matches the NESdev lookup tables', () => {
    expect(PULSE_MIX[30]).toBeCloseTo(95.52 / (8128 / 30 + 100), 10);
    expect(TND_MIX[202]).toBeCloseTo(163.67 / (24329 / 202 + 100), 10);
  });

  it('outputs silence before any write', () => {
    const out = renderSeconds(new Apu({ sampleRate: RATE }), 0.1);
    expect(Math.max(...out.map(Math.abs))).toBe(0);
  });
});

describe('BlipBuffer', () => {
  it('turns a delta into a step of the same size', () => {
    const blip = new BlipBuffer(NTSC.cpuClock, RATE, 4096);
    blip.addDelta(1000, 0.5);
    blip.endFrame(NTSC.cpuClock / 100);
    const out = new Float32Array(blip.samplesAvailable);
    blip.read(out);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBeCloseTo(0.5, 6);
  });

  it('reports the cycles needed for a number of samples', () => {
    const blip = new BlipBuffer(NTSC.cpuClock, RATE, 4096);
    blip.endFrame(blip.clocksNeeded(1000));
    expect(blip.samplesAvailable).toBe(1000);
  });
});

describe('FrameRenderer', () => {
  it('renders about one frame worth of samples per frame', () => {
    const renderer = new FrameRenderer({ sampleRate: RATE });
    let total = 0;
    for (let i = 0; i < 600; i++) total += renderer.renderFrame([]).length;
    expect(total).toBeGreaterThanOrEqual(Math.floor(600 * renderer.samplesPerFrame) - 1);
    expect(total).toBeLessThanOrEqual(Math.ceil(600 * renderer.samplesPerFrame));
  });

  it('is deterministic', () => {
    const frames = Array.from({ length: 30 }, (_, i) =>
      i === 0
        ? [
            { address: 0x4015, value: 0x0f },
            { address: 0x400c, value: 0x3f },
            { address: 0x400e, value: 0x03 },
            { address: 0x400f, value: 0xf8 },
            { address: 0x4000, value: 0x7f },
            { address: 0x4002, value: 200 },
            { address: 0x4003, value: 0 },
          ]
        : [],
    );
    const a = new FrameRenderer({ sampleRate: RATE }).renderFrames(frames);
    const b = new FrameRenderer({ sampleRate: RATE }).renderFrames(frames);
    expect(a.length).toBeGreaterThan(20000);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
