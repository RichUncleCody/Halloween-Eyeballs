// Estimates the offset between this browser's monotonic clock and the
// server's wall clock, NTP-style, so every screen plays events in lock-step.

export class Clock {
  constructor() {
    this.offset = Date.now() - performance.now();
    this.target = this.offset;
    this.rtt = NaN;
    this.synced = false;
    this.frozenAt = null;
  }

  now() {
    return this.frozenAt ?? performance.now() + this.offset;
  }

  // Nudge toward the latest estimate instead of jumping (avoids visible skips).
  tick(dtMs) {
    const d = this.target - this.offset;
    if (Math.abs(d) > 250) this.offset = this.target;
    else this.offset += Math.max(-dtMs * 0.05, Math.min(dtMs * 0.05, d));
  }

  async sync(samples = 7) {
    const out = [];
    for (let i = 0; i < samples; i++) {
      try {
        const t0 = performance.now();
        const r = await fetch('/api/time', { cache: 'no-store' });
        const { now } = await r.json();
        const t1 = performance.now();
        out.push({ rtt: t1 - t0, offset: now - (t0 + t1) / 2 });
      } catch { /* server unreachable; keep previous estimate */ }
    }
    if (!out.length) return false;
    out.sort((a, b) => a.rtt - b.rtt);
    const best = out.slice(0, Math.max(1, Math.ceil(out.length / 3)));
    const off = best.reduce((s, x) => s + x.offset, 0) / best.length;
    this.rtt = out[0].rtt;
    this.target = off;
    if (!this.synced) this.offset = off;
    this.synced = true;
    return true;
  }
}
