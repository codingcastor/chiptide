import { DUTY_TABLE, TRIANGLE_TABLE } from './tables';
import { Envelope, LengthCounter, type TimedUnit } from './units';

export class Pulse implements TimedUnit {
  readonly envelope = new Envelope();
  readonly length = new LengthCounter();
  nextClock = 0;
  duty = 0;
  step = 0;
  /** 11-bit timer period. The sequencer advances every 2 * (period + 1) CPU cycles. */
  period = 0;

  sweepEnabled = false;
  sweepPeriod = 0;
  sweepNegate = false;
  sweepShift = 0;
  private sweepReload = false;
  private sweepDivider = 0;

  /** Pulse 1 negates with ones' complement, pulse 2 with two's complement. */
  constructor(private readonly onesComplement: boolean) {}

  write(reg: number, value: number): void {
    switch (reg) {
      case 0:
        this.duty = value >> 6;
        this.length.halt = (value & 0x20) !== 0;
        this.envelope.write(value);
        break;
      case 1:
        this.sweepEnabled = (value & 0x80) !== 0;
        this.sweepPeriod = (value >> 4) & 7;
        this.sweepNegate = (value & 0x08) !== 0;
        this.sweepShift = value & 7;
        this.sweepReload = true;
        break;
      case 2:
        this.period = (this.period & 0x700) | value;
        break;
      case 3:
        this.period = (this.period & 0xff) | ((value & 7) << 8);
        this.length.load(value >> 3);
        this.step = 0;
        this.envelope.start = true;
        break;
    }
  }

  clockTimer(): void {
    this.nextClock += 2 * (this.period + 1);
    this.step = (this.step + 1) & 7;
  }

  private sweepTarget(): number {
    const change = this.period >> this.sweepShift;
    if (!this.sweepNegate) return this.period + change;
    return this.period - change - (this.onesComplement ? 1 : 0);
  }

  /** The sweep unit mutes the channel even while disabled. */
  get muted(): boolean {
    return this.period < 8 || this.sweepTarget() > 0x7ff;
  }

  clockQuarter(): void {
    this.envelope.clock();
  }

  clockHalf(): void {
    this.length.clock();
    if (this.sweepDivider === 0 && this.sweepEnabled && this.sweepShift > 0 && !this.muted) {
      this.period = Math.max(0, this.sweepTarget());
    }
    if (this.sweepDivider === 0 || this.sweepReload) {
      this.sweepDivider = this.sweepPeriod;
      this.sweepReload = false;
    } else {
      this.sweepDivider--;
    }
  }

  output(): number {
    if (!this.length.active || this.muted || DUTY_TABLE[this.duty][this.step] === 0) return 0;
    return this.envelope.volume;
  }

  reset(): void {
    this.envelope.reset();
    this.length.reset();
    this.duty = this.step = this.period = 0;
    this.sweepEnabled = this.sweepNegate = this.sweepReload = false;
    this.sweepPeriod = this.sweepShift = this.sweepDivider = 0;
  }
}

export class Triangle implements TimedUnit {
  readonly length = new LengthCounter();
  nextClock = 0;
  step = 0;
  /** The sequencer advances every period + 1 CPU cycles. */
  period = 0;
  control = false;
  linearReloadValue = 0;
  linearCounter = 0;
  private linearReload = false;

  write(reg: number, value: number): void {
    switch (reg) {
      case 0:
        this.control = (value & 0x80) !== 0;
        this.length.halt = this.control;
        this.linearReloadValue = value & 0x7f;
        break;
      case 2:
        this.period = (this.period & 0x700) | value;
        break;
      case 3:
        this.period = (this.period & 0xff) | ((value & 7) << 8);
        this.length.load(value >> 3);
        this.linearReload = true;
        break;
    }
  }

  clockTimer(): void {
    // Periods 0 and 1 give ultrasonic frequencies. Like most emulators we
    // freeze the sequencer instead, which avoids a loud pop and saves work.
    if (this.period < 2) {
      this.nextClock += 64;
      return;
    }
    this.nextClock += this.period + 1;
    if (this.linearCounter > 0 && this.length.active) this.step = (this.step + 1) & 31;
  }

  clockQuarter(): void {
    if (this.linearReload) this.linearCounter = this.linearReloadValue;
    else if (this.linearCounter > 0) this.linearCounter--;
    if (!this.control) this.linearReload = false;
  }

  clockHalf(): void {
    this.length.clock();
  }

  /** The triangle keeps outputting its current step when halted. */
  output(): number {
    return TRIANGLE_TABLE[this.step];
  }

  reset(): void {
    this.length.reset();
    this.step = this.period = this.linearReloadValue = this.linearCounter = 0;
    this.control = this.linearReload = false;
  }
}

export class Noise implements TimedUnit {
  readonly envelope = new Envelope();
  readonly length = new LengthCounter();
  nextClock = 0;
  shortMode = false;
  periodIndex = 0;
  shift = 1;

  constructor(private readonly periods: readonly number[]) {}

  write(reg: number, value: number): void {
    switch (reg) {
      case 0:
        this.length.halt = (value & 0x20) !== 0;
        this.envelope.write(value);
        break;
      case 2:
        this.shortMode = (value & 0x80) !== 0;
        this.periodIndex = value & 0x0f;
        break;
      case 3:
        this.length.load(value >> 3);
        this.envelope.start = true;
        break;
    }
  }

  clockTimer(): void {
    this.nextClock += this.periods[this.periodIndex];
    const feedback = (this.shift ^ (this.shift >> (this.shortMode ? 6 : 1))) & 1;
    this.shift = (this.shift >> 1) | (feedback << 14);
  }

  clockQuarter(): void {
    this.envelope.clock();
  }

  clockHalf(): void {
    this.length.clock();
  }

  output(): number {
    if (!this.length.active || (this.shift & 1) !== 0) return 0;
    return this.envelope.volume;
  }

  reset(): void {
    this.envelope.reset();
    this.length.reset();
    this.shortMode = false;
    this.periodIndex = 0;
    this.shift = 1;
  }
}

export type MemoryReader = (address: number) => number;

export class Dmc implements TimedUnit {
  nextClock = 0;
  rateIndex = 0;
  loop = false;
  irqEnabled = false;
  level = 0;
  sampleAddress = 0xc000;
  sampleLength = 1;
  currentAddress = 0xc000;
  bytesRemaining = 0;
  private buffer = -1;
  private shiftRegister = 0;
  private bitsRemaining = 8;
  private silence = true;

  constructor(
    private readonly rates: readonly number[],
    public read: MemoryReader,
  ) {}

  write(reg: number, value: number): void {
    switch (reg) {
      case 0:
        this.irqEnabled = (value & 0x80) !== 0;
        this.loop = (value & 0x40) !== 0;
        this.rateIndex = value & 0x0f;
        break;
      case 1:
        this.level = value & 0x7f;
        break;
      case 2:
        this.sampleAddress = 0xc000 + value * 64;
        break;
      case 3:
        this.sampleLength = value * 16 + 1;
        break;
    }
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.bytesRemaining = 0;
    } else if (this.bytesRemaining === 0) {
      this.restart();
      this.fillBuffer();
    }
  }

  private restart(): void {
    this.currentAddress = this.sampleAddress;
    this.bytesRemaining = this.sampleLength;
  }

  private fillBuffer(): void {
    if (this.buffer >= 0 || this.bytesRemaining === 0) return;
    this.buffer = this.read(this.currentAddress) & 0xff;
    this.currentAddress = this.currentAddress === 0xffff ? 0x8000 : this.currentAddress + 1;
    if (--this.bytesRemaining === 0 && this.loop) this.restart();
  }

  clockTimer(): void {
    this.nextClock += this.rates[this.rateIndex];
    if (!this.silence) {
      if (this.shiftRegister & 1) {
        if (this.level <= 125) this.level += 2;
      } else if (this.level >= 2) {
        this.level -= 2;
      }
    }
    this.shiftRegister >>= 1;
    if (--this.bitsRemaining === 0) {
      this.bitsRemaining = 8;
      if (this.buffer < 0) {
        this.silence = true;
      } else {
        this.silence = false;
        this.shiftRegister = this.buffer;
        this.buffer = -1;
        this.fillBuffer();
      }
    }
  }

  get playing(): boolean {
    return this.bytesRemaining > 0 || this.buffer >= 0 || !this.silence;
  }

  output(): number {
    return this.level;
  }

  reset(): void {
    this.rateIndex = this.level = this.bytesRemaining = 0;
    this.loop = this.irqEnabled = false;
    this.sampleAddress = this.currentAddress = 0xc000;
    this.sampleLength = 1;
    this.buffer = -1;
    this.shiftRegister = 0;
    this.bitsRemaining = 8;
    this.silence = true;
  }
}
