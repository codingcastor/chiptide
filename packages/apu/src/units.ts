import { LENGTH_TABLE } from './tables';

/** Volume envelope shared by the pulse and noise channels. Clocked on quarter frames. */
export class Envelope {
  start = false;
  loop = false;
  constant = false;
  /** Volume when constant, otherwise the divider period. */
  param = 0;
  private divider = 0;
  private decay = 0;

  write(value: number): void {
    this.loop = (value & 0x20) !== 0;
    this.constant = (value & 0x10) !== 0;
    this.param = value & 0x0f;
  }

  clock(): void {
    if (this.start) {
      this.start = false;
      this.decay = 15;
      this.divider = this.param;
      return;
    }
    if (this.divider > 0) {
      this.divider--;
      return;
    }
    this.divider = this.param;
    if (this.decay > 0) this.decay--;
    else if (this.loop) this.decay = 15;
  }

  get volume(): number {
    return this.constant ? this.param : this.decay;
  }

  reset(): void {
    this.start = this.loop = this.constant = false;
    this.param = this.divider = this.decay = 0;
  }
}

/** Length counter shared by pulse, triangle and noise. Clocked on half frames. */
export class LengthCounter {
  enabled = false;
  halt = false;
  value = 0;

  load(index: number): void {
    if (this.enabled) this.value = LENGTH_TABLE[index & 0x1f];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.value = 0;
  }

  clock(): void {
    if (!this.halt && this.value > 0) this.value--;
  }

  get active(): boolean {
    return this.value > 0;
  }

  reset(): void {
    this.enabled = this.halt = false;
    this.value = 0;
  }
}

/**
 * Every channel exposes the time (in absolute CPU cycles) at which its timer
 * next expires, so the APU can jump from event to event instead of stepping
 * every cycle.
 */
export interface TimedUnit {
  nextClock: number;
  clockTimer(): void;
}
