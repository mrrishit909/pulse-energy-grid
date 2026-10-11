import { shortestDelta } from "../lib/math";
import { easeSmooth } from "./ease";
import { motionEnabled } from "../state/motion";

/**
 * Retargetable time-based tween (MOTION_SYSTEM 4). retarget() restarts from the
 * current interpolated value with the full duration; nothing queues. In angle
 * mode it travels the shortest signed path.
 */
export class Tween {
  value: number;
  private from: number;
  private to: number;
  private start = 0;
  constructor(
    value: number,
    public duration: number,
    public ease: (t: number) => number = easeSmooth,
    private angle = false,
  ) {
    this.value = this.from = this.to = value;
  }
  get target() { return this.to; }
  get active() { return this.value !== this.to; }
  retarget(to: number, now: number, duration = this.duration) {
    this.update(now);
    this.from = this.value;
    this.to = this.angle ? this.value + shortestDelta(this.value, to) : to;
    this.start = now;
    this.duration = motionEnabled() ? duration : 0;
    if (this.duration <= 0) this.value = this.to;
  }
  /** Advance to time `now`; returns true while still moving. */
  update(now: number): boolean {
    if (this.value === this.to) return false;
    const t = this.duration > 0 ? (now - this.start) / this.duration : 1;
    if (t >= 1) { this.value = this.to; return false; }
    this.value = this.from + (this.to - this.from) * this.ease(Math.max(0, t));
    return true;
  }
  snap() { this.value = this.to; }
}
