// Plays back the director's gaze / blink / lid / pupil commands for one eye,
// adds the little involuntary movements real eyes make, and keeps the eye
// alive on its own if the server goes quiet.

import { EYE_INDEX, MOODS } from '/shared/catalog.js';
import { clamp, lerp, smooth, smoother, easeOutBack, fbm1 } from './util.js';

export const MAX_YAW = 0.72;
export const MAX_PITCH = 0.48;

export function softClamp(v, m) {
  const k = 0.72 * m;
  const a = Math.abs(v);
  if (a <= k) return v;
  return Math.sign(v) * (k + (m - k) * Math.tanh((a - k) / (m - k)));
}

export class Geometry {
  constructor(pos, aspect = 16 / 9, gap = 0.04) { this.pos = pos; this.set(aspect, gap); }
  set(aspect, gap = this.gap) {
    this.aspect = aspect;
    this.gap = gap;
    this.idx = EYE_INDEX[this.pos] ?? 0;
    this.spacing = aspect * (1 + gap);
    this.eyeX = this.idx * this.spacing;
  }
  // Room point (monitor-height units) -> [yaw, pitch] for this eye.
  angles(p) {
    const dx = p[0] - this.eyeX, dy = p[1], dz = Math.max(0.05, p[2]);
    return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }
  // A point on the wall of monitors, treated as floating slightly in front.
  wallAngles(X, Y, z = 1.2) { return this.angles([X, Y, z]); }
  eyeXOf(pos) { return (EYE_INDEX[pos] ?? 0) * this.spacing; }
}

const rnd = (a, b) => a + (b - a) * Math.random();

export class EyeAnimator {
  constructor(pos, geo) {
    this.pos = pos;
    this.geo = geo;
    this.queue = [];
    this.cur = [0, -0.05];
    this.gaze = [0, -0.05];
    this.pupilOut = 0.42;
    this.seg = { t0: 0, dur: 1, from: [0, -0.05], to: [0, -0.05], ease: 'glide' };
    this.lid = { t0: 0, dur: 1, from: { ...MOODS.neutral }, to: { ...MOODS.neutral } };
    this.lids = { ...MOODS.neutral };
    this.pupilSeg = { t0: 0, dur: 1, from: 0.42, to: 0.42 };
    this.pupil = 0.42;
    this.blinks = [];
    this.sleepSeg = { t0: 0, dur: 1, from: 0, to: 0 };
    this.micro = { off: [0, 0], to: [0, 0], next: 0 };
    this.lastServer = -Infinity;
    this.auto = { gaze: 0, blink: 0 };
    this.connected = false;
    this.blinkAmount = 0;
    this.sleep = 0;
  }

  // ---------------------------------------------------------- events
  push(ev, now) {
    this.lastServer = now;
    if (ev.type === 'cancel') {
      this.queue = this.queue.filter((q) => !(ev.channels.includes(q.type) && q.at >= ev.at));
      return;
    }
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].at > ev.at) i--;
    this.queue.splice(i, 0, ev);
  }

  apply(ev, now) {
    switch (ev.type) {
      case 'gaze': {
        const to = this.geo.angles(ev.to);
        this.seg = { t0: ev.at, dur: Math.max(16, ev.dur), from: this.cur.slice(), to, ease: ev.ease };
        break;
      }
      case 'blink':
        this.blinks.push({ t0: ev.at, dur: Math.max(60, ev.dur), hold: ev.hold || 0, depth: ev.depth ?? 1 });
        break;
      case 'lids':
        this.lid = { t0: ev.at, dur: Math.max(16, ev.dur), from: { ...this.lids }, to: { upper: ev.upper, lower: ev.lower, tilt: ev.tilt } };
        break;
      case 'pupil':
        this.pupilSeg = { t0: ev.at, dur: Math.max(16, ev.dur), from: this.pupil, to: ev.size };
        break;
      case 'sleep':
        this.sleepSeg = { t0: ev.at, dur: Math.max(16, ev.dur), from: this.sleep, to: ev.asleep ? 1 : 0 };
        break;
    }
  }

  // Jump straight to a state (used when a screen joins mid-show).
  snapTo({ target, lids, pupil }, asleep) {
    if (target) { this.cur = this.geo.angles(target); this.seg = { t0: 0, dur: 1, from: this.cur.slice(), to: this.cur.slice(), ease: 'glide' }; }
    if (lids) { this.lids = { ...lids }; this.lid = { t0: 0, dur: 1, from: { ...lids }, to: { ...lids } }; }
    if (pupil) { this.pupil = pupil; this.pupilSeg = { t0: 0, dur: 1, from: pupil, to: pupil }; }
    const s = asleep ? 1 : 0;
    this.sleep = s; this.sleepSeg = { t0: 0, dur: 1, from: s, to: s };
  }

  // ---------------------------------------------------------- update
  update(now) {
    while (this.queue.length && this.queue[0].at <= now) this.apply(this.queue.shift(), now);
    if (now - this.lastServer > (this.connected ? 25000 : 4000)) this.autonomous(now);

    // gaze segment
    const s = this.seg;
    const u = clamp((now - s.t0) / s.dur);
    const k = s.ease === 'dart' ? easeOutBack(u, 0.7) : s.ease === 'linear' ? u : smoother(u);
    const g = [lerp(s.from[0], s.to[0], k), lerp(s.from[1], s.to[1], k)];
    this.cur = g;
    this.moving = u < 1;
    this.darting = s.ease === 'dart' && u < 1;

    // microsaccades + slow drift keep the eye from looking frozen
    const m = this.micro;
    if (now > m.next && !this.darting) {
      m.to = [rnd(-1, 1) * 0.013, rnd(-1, 1) * 0.01];
      m.next = now + rnd(450, 1900);
    }
    m.off[0] += (m.to[0] - m.off[0]) * 0.35;
    m.off[1] += (m.to[1] - m.off[1]) * 0.35;
    const ts = now / 1000;
    this.gaze = [
      g[0] + m.off[0] + fbm1(ts * 0.25, 11) * 0.012,
      g[1] + m.off[1] + fbm1(ts * 0.25, 29) * 0.009,
    ];

    // lids
    const l = this.lid;
    const lu = smooth((now - l.t0) / l.dur);
    this.lids = {
      upper: lerp(l.from.upper, l.to.upper, lu),
      lower: lerp(l.from.lower, l.to.lower, lu),
      tilt: lerp(l.from.tilt, l.to.tilt, lu),
    };

    // pupil + hippus (the natural slow pupil wobble)
    const p = this.pupilSeg;
    this.pupil = lerp(p.from, p.to, smooth((now - p.t0) / p.dur));
    this.pupilOut = this.pupil + fbm1(ts * 0.5, 47) * 0.025;

    // blinks
    let b = 0;
    this.blinks = this.blinks.filter((bl) => now < bl.t0 + bl.dur + 50);
    for (const bl of this.blinks) b = Math.max(b, blinkCurve(now - bl.t0, bl) * bl.depth);
    this.blinkAmount = b;

    const sl = this.sleepSeg;
    this.sleep = lerp(sl.from, sl.to, smooth((now - sl.t0) / sl.dur));
  }

  // When the server is unreachable, keep looking around on our own.
  autonomous(now) {
    if (now > this.auto.gaze) {
      const dart = Math.random() < 0.25;
      const target = [rnd(-6, 6), rnd(-1.5, 0.6), rnd(3.5, 9)];
      const dur = dart ? rnd(90, 150) : rnd(2200, 5000);
      this.apply({ type: 'gaze', at: now, to: target, dur, ease: dart ? 'dart' : 'glide' }, now);
      this.auto.gaze = now + dur + rnd(600, 3000);
    }
    if (now > this.auto.blink) {
      this.apply({ type: 'blink', at: now, dur: 230, hold: 30 }, now);
      this.auto.blink = now + rnd(2500, 6000);
    }
  }
}

// 0 = open, 1 = closed. Fast close, short hold, slower open.
export function blinkCurve(t, { dur, hold = 0 }) {
  if (t < 0) return 0;
  const close = Math.min(110, Math.max(45, (dur - hold) * 0.36));
  const open = Math.max(40, dur - hold - close);
  if (t < close) { const u = t / close; return u * u * (3 - 2 * u) * 0.25 + u * u * 0.75; }
  if (t < close + hold) return 1;
  const u = (t - close - hold) / open;
  if (u >= 1) return 0;
  return 1 - smooth(u);
}
