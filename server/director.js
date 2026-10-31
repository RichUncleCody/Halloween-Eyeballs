// The Director runs the show. It decides where every eye looks, when it
// blinks, what mood its lids are in, and when something special happens.
// Screens are mostly dumb renderers: they receive timestamped events and play
// them back in sync. Anything the auto-director can do can also be triggered
// manually through the HTTP API.

import {
  EYES, EYE_INDEX, LEAD_MS, SPECIALS, SPECIAL_MAP, QUIRKS, QUIRK_MAP,
  MODES, MOODS, PALETTES, MESSAGES,
} from '../shared/catalog.js';

// Room geometry used for gaze maths, in units of monitor height.
// Monitors are assumed 16:9 with a small bezel gap.
const EYE_SPACING = (16 / 9) * 1.04;
const eyePos = (e) => [EYE_INDEX[e] * EYE_SPACING, 0, 0];

const MODE_MOOD = { lazy: 'relaxed', alert: 'wide' };
const MODE_PUPIL = { lazy: 0.55, alert: 0.3 };
const DEFAULT_PUPIL = 0.42;

export const DEFAULT_CONFIG = {
  auto: true,            // auto-director runs specials & quirks on its own
  specialMean: 300,      // average seconds between specials
  quirkMean: 45,         // average seconds between quirks
  chapterMinutes: 15,    // average minutes between palette changes
  disabled: [],          // special/quirk ids the auto-director must skip
};

export class Director {
  constructor({ send, config = {}, random = Math.random, now = () => Date.now(), onConfig } = {}) {
    this.send = send || (() => {});
    this.random = random;
    this.now = now;
    this.onConfig = onConfig || (() => {});
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timers = new Set();
    this.started = false;
    this.startedAt = now();

    this.mode = 'together';
    this.modeUntil = 0;
    this.leader = 'C';
    this.shared = [0, -0.4, 6];
    this.sweepDir = 1;
    this.indep = { next: { L: 0, C: 0, R: 0 }, regroupAt: 0 };

    this.eyes = {};
    for (const e of EYES) {
      this.eyes[e] = { target: [...this.shared], lids: { ...MOODS.neutral }, pupil: DEFAULT_PUPIL };
    }
    this.palette = { L: 'amber', C: 'amber', R: 'amber' };
    this.asleep = false;
    this.fx = [];
    this.history = [];
    this.lastPlayed = {};
    this.recent = [];
    this.recentQuirks = [];

    this.gazeHoldUntil = 0;
    this.noBlinkUntil = 0;
    this.busyUntil = 0;
    this.moodOverrideUntil = 0;
    this.nextSpecialAt = 0;
    this.nextQuirkAt = 0;
    this.nextChapterAt = 0;
    this.fxSeq = 0;
  }

  // ------------------------------------------------------------------ utils
  rand(a = 0, b = 1) { return a + (b - a) * this.random(); }
  int(a, b) { return Math.floor(this.rand(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.random() * arr.length) % arr.length]; }
  chance(p) { return this.random() < p; }
  erlang(mean, k = 2) {
    let s = 0;
    for (let i = 0; i < k; i++) s += -Math.log(1 - this.random() * 0.999999);
    return (s / k) * mean;
  }
  weighted(items, weightOf) {
    const ws = items.map(weightOf);
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = this.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  after(ms, fn) {
    const h = setTimeout(() => {
      this.timers.delete(h);
      try { fn(); } catch (err) { console.error('[director]', err); }
    }, Math.max(0, ms));
    this.timers.add(h);
    return h;
  }

  emit(ev) {
    ev.at = Math.round(ev.at ?? this.now() + LEAD_MS);
    this.send(ev);
    return ev;
  }

  log(kind, id, extra = {}) {
    this.history.unshift({ t: this.now(), kind, id, ...extra });
    if (this.history.length > 60) this.history.length = 60;
  }

  // ------------------------------------------------------------ lifecycle
  start() {
    if (this.started) return;
    this.started = true;
    const now = this.now();
    this.startedAt = now;
    // First special comes fairly early so the room gets a taste of it.
    this.nextSpecialAt = now + this.rand(70, 150) * 1000;
    this.nextQuirkAt = now + this.rand(20, 40) * 1000;
    this.nextChapterAt = now + this.config.chapterMinutes * 60000 * this.rand(0.7, 1.3);
    this.pickMode('together');
    this.after(500, () => this.gazeLoop());
    this.after(1200, () => this.blinkLoop());
    this.after(5000, () => this.pupilLoop());
    this.tickHandle = setInterval(() => {
      try { this.tick(); } catch (err) { console.error('[director]', err); }
    }, 1000);
  }

  stop() {
    this.started = false;
    for (const h of this.timers) clearTimeout(h);
    this.timers.clear();
    clearInterval(this.tickHandle);
  }

  tick() {
    const now = this.now();
    this.fx = this.fx.filter((f) => f.at + f.dur * 1000 > now);
    if (this.asleep) return;
    if (now >= this.modeUntil) this.pickMode();
    if (!this.config.auto) return;
    if (now >= this.nextSpecialAt && now >= this.busyUntil) {
      const def = this.pickSpecial();
      if (def) this.runSpecial(def.id);
      else this.nextSpecialAt = now + 60000;
    } else if (now >= this.nextQuirkAt && now >= this.busyUntil + 5000 && now < this.nextSpecialAt - 6000) {
      const q = this.pickQuirk();
      if (q) this.runQuirk(q.id);
      this.nextQuirkAt = now + Math.max(12000, this.erlang(this.config.quirkMean * 1000));
    } else if (now >= this.nextChapterAt && now >= this.busyUntil + 3000) {
      this.changePalette();
    }
  }

  // --------------------------------------------------------- primitives
  angles(e, p) {
    const o = eyePos(e);
    const dx = p[0] - o[0], dy = p[1] - o[1], dz = Math.max(0.05, p[2] - o[2]);
    return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }

  angleBetween(e, a, b) {
    const A = this.angles(e, a), B = this.angles(e, b);
    const clampA = (v) => [Math.max(-0.75, Math.min(0.75, v[0])), Math.max(-0.5, Math.min(0.5, v[1]))];
    const a2 = clampA(A), b2 = clampA(B);
    return Math.hypot(a2[0] - b2[0], a2[1] - b2[1]) * 180 / Math.PI;
  }

  gaze(e, at, to, dur = 3000, ease = 'glide') {
    this.eyes[e].target = to.map((v) => +v.toFixed(3));
    return this.emit({ type: 'gaze', eye: e, at, to: this.eyes[e].target, dur: Math.round(dur), ease });
  }

  dart(e, at, to, { blinkChance = 0.35 } = {}) {
    const amp = this.angleBetween(e, this.eyes[e].target, to);
    const dur = Math.max(70, Math.min(190, 55 + amp * 2.6));
    this.gaze(e, at, to, dur, 'dart');
    if (amp > 22 && this.chance(blinkChance) && at >= this.noBlinkUntil) {
      this.blink(e, at + 5, { dur: 200 });
    }
  }

  blink(e, at, { dur = 230, hold = 30, depth = 1 } = {}) {
    return this.emit({ type: 'blink', eye: e, at, dur: Math.round(dur), hold: Math.round(hold), depth });
  }

  lids(e, at, mood, dur = 500) {
    const v = typeof mood === 'string' ? MOODS[mood] || MOODS.neutral : mood;
    this.eyes[e].lids = { upper: v.upper, lower: v.lower, tilt: v.tilt };
    return this.emit({ type: 'lids', eye: e, at, dur: Math.round(dur), ...this.eyes[e].lids });
  }

  pupil(e, at, size, dur = 800) {
    this.eyes[e].pupil = size;
    return this.emit({ type: 'pupil', eye: e, at, dur: Math.round(dur), size: +size.toFixed(3) });
  }

  cancel(at, channels = ['gaze', 'blink', 'lids', 'pupil']) {
    return this.emit({ type: 'cancel', at, channels });
  }

  modeMood() { return MODE_MOOD[this.mode] || 'neutral'; }
  modePupil() { return MODE_PUPIL[this.mode] ?? DEFAULT_PUPIL; }

  restoreLids(at, dur = 700) {
    if (this.now() < this.moodOverrideUntil) return;
    for (const e of EYES) this.lids(e, at, this.modeMood(), dur);
  }

  restorePupils(at, dur = 1200) {
    for (const e of EYES) this.pupil(e, at, this.modePupil() + this.rand(-0.03, 0.03), dur);
  }

  // ------------------------------------------------------------- targets
  roomTarget(kind) {
    kind = kind || this.weighted(
      ['guest', 'far', 'table', 'up', 'side'],
      (k) => ({ guest: 0.62, far: 0.14, table: 0.1, up: 0.05, side: 0.09 })[k],
    );
    const r = (a, b) => this.rand(a, b);
    switch (kind) {
      case 'far': return [r(-11, 11), r(-0.8, 2.2), r(9, 15)];
      case 'table': return [r(-3.5, 3.5), r(-3.4, -2.2), r(2.4, 5)];
      case 'up': return [r(-5, 5), r(2.6, 5), r(3, 7)];
      case 'side': { const s = this.chance(0.5) ? -1 : 1; return [s * r(8, 14), r(-1.2, 1), r(1.5, 5)]; }
      default: return [r(-6.5, 6.5), r(-1.5, 0.6), r(3.5, 9)];
    }
  }

  // A target meaningfully different from the shared one (for darts).
  distantTarget(kind) {
    let best = null, bestD = -1;
    for (let i = 0; i < 6; i++) {
      const t = this.roomTarget(kind);
      const d = this.angleBetween('C', this.shared, t);
      if (d > 18) return t;
      if (d > bestD) { best = t; bestD = d; }
    }
    return best;
  }

  nearbyTarget(from) {
    if (this.chance(0.35)) return this.roomTarget();
    const r = (a, b) => this.rand(a, b);
    return [
      Math.max(-11, Math.min(11, from[0] + r(-4, 4))),
      Math.max(-3.4, Math.min(4, from[1] + r(-1, 1))),
      Math.max(2.4, Math.min(15, from[2] + r(-2, 2))),
    ];
  }

  jitter(p, amt = 1) {
    return [p[0] + this.rand(-0.35, 0.35) * amt, p[1] + this.rand(-0.18, 0.18) * amt, p[2]];
  }

  // Point just in front of another monitor, so eye `e` looks at eye `other`.
  eyeTarget(other) { const o = eyePos(other); return [o[0], this.rand(-0.1, 0.25), 0.35]; }

  // ------------------------------------------------------------- gaze loop
  gazeLoop() {
    if (!this.started) return;
    const now = this.now();
    let next = 1000;
    if (this.asleep) next = 1000;
    else if (now < this.gazeHoldUntil) next = this.gazeHoldUntil - now + 30;
    else next = this.modeStep(now + LEAD_MS);
    this.after(Math.max(120, next), () => this.gazeLoop());
  }

  pickMode(id) {
    const prev = this.mode;
    if (!id) {
      const choices = MODES.filter((m) => m.id !== prev);
      id = this.weighted(choices, (m) => m.weight).id;
    }
    this.mode = id;
    this.modeUntil = this.now() + this.rand(40, 110) * 1000;
    this.leader = this.pick(EYES);
    this.indep.regroupAt = this.now() + this.rand(8000, 16000);
    const at = this.now() + LEAD_MS;
    this.restoreLids(at, 1500);
    this.restorePupils(at, 2000);
    this.emit({ type: 'mode', at, mode: id });
    this.log('mode', id);
  }

  modeStep(at) {
    switch (this.mode) {
      case 'leader': return this.stepLeader(at);
      case 'independent': return this.stepIndependent(at);
      case 'conversation': return this.stepConversation(at);
      case 'sweep': return this.stepSweep(at);
      case 'lazy': return this.stepTogether(at, { pDart: 0.03, slow: 1.7, hold: 1.8 });
      case 'alert': return this.stepTogether(at, { pDart: 0.45, slow: 0.7, hold: 0.55 });
      default: return this.stepTogether(at);
    }
  }

  stepTogether(at, { pDart = 0.2, slow = 1, hold = 1 } = {}) {
    if (this.chance(pDart)) {
      const to = this.distantTarget();
      const leader = this.pick(EYES);
      for (const e of EYES) {
        const d = e === leader ? 0 : this.rand(60, 300);
        this.dart(e, at + d, this.jitter(to, 0.6));
      }
      this.shared = to;
      return this.rand(1400, 4200) * hold;
    }
    const to = this.nearbyTarget(this.shared);
    const dur = this.rand(2200, 5400) * slow;
    for (const e of EYES) {
      this.gaze(e, at + this.rand(0, 450), this.jitter(to), dur * this.rand(0.85, 1.15), 'glide');
    }
    this.shared = to;
    return dur + this.rand(300, 2600) * hold;
  }

  stepLeader(at) {
    const L = this.leader;
    const followers = EYES.filter((e) => e !== L);
    if (this.chance(0.28)) {
      const to = this.distantTarget();
      this.dart(L, at, to);
      for (const e of followers) this.dart(e, at + this.rand(180, 650), this.jitter(to, 0.7));
      this.shared = to;
      return this.rand(1500, 4000);
    }
    const to = this.nearbyTarget(this.shared);
    const dur = this.rand(2000, 5000);
    this.gaze(L, at, to, dur, 'glide');
    for (const e of followers) this.gaze(e, at + this.rand(350, 1100), this.jitter(to), dur * this.rand(0.95, 1.35), 'glide');
    this.shared = to;
    return dur + this.rand(300, 2400);
  }

  stepIndependent(at) {
    const now = at - LEAD_MS;
    if (now >= this.indep.regroupAt) {
      // Every so often they all snap to the same point at once. Creepy.
      const to = this.distantTarget('guest');
      for (const e of EYES) this.dart(e, at, to, { blinkChance: 0 });
      this.shared = to;
      const until = now + this.rand(2500, 4200);
      for (const e of EYES) this.indep.next[e] = until;
      this.indep.regroupAt = now + this.rand(10000, 20000);
      return until - now;
    }
    for (const e of EYES) {
      if (now < this.indep.next[e]) continue;
      const to = this.chance(0.7) ? this.nearbyTarget(this.eyes[e].target) : this.roomTarget();
      if (this.chance(0.22)) {
        this.dart(e, at, to);
        this.indep.next[e] = now + this.rand(1200, 3500);
      } else {
        const dur = this.rand(1800, 4800);
        this.gaze(e, at, to, dur, 'glide');
        this.indep.next[e] = now + dur + this.rand(200, 2200);
      }
    }
    return Math.max(150, Math.min(...EYES.map((e) => this.indep.next[e])) - now);
  }

  stepConversation(at) {
    if (this.chance(0.5)) {
      const pairs = [['L', 'C'], ['C', 'R'], ['L', 'R'], ['C', 'L'], ['R', 'C'], ['R', 'L']];
      const [a, b] = this.pick(pairs);
      const third = EYES.find((e) => e !== a && e !== b);
      const reply = this.rand(250, 700);
      const holdFor = this.rand(900, 2200);
      this.dart(a, at, this.eyeTarget(b), { blinkChance: 0.1 });
      this.dart(b, at + reply, this.eyeTarget(a), { blinkChance: 0.1 });
      if (this.chance(0.5)) this.dart(third, at + reply + this.rand(200, 600), this.eyeTarget(this.chance(0.5) ? a : b));
      const away = at + reply + holdFor;
      const to = this.distantTarget();
      if (this.chance(0.6)) {
        // Both look away together, as if caught.
        for (const e of EYES) this.dart(e, away + this.rand(0, 160), this.jitter(to, 0.6));
      } else {
        this.dart(a, away, this.jitter(to));
        this.dart(b, away + this.rand(300, 800), this.roomTarget());
        this.dart(third, away + this.rand(100, 500), this.jitter(to));
      }
      this.shared = to;
      return reply + holdFor + this.rand(1500, 3500);
    }
    return this.stepTogether(at, { pDart: 0.35 });
  }

  stepSweep(at) {
    this.sweepDir *= -1;
    const dir = this.sweepDir;
    const y = this.rand(-1.2, 0.4), z = this.rand(4, 8);
    const to = [8 * dir, y, z];
    const dur = this.rand(5000, 8500);
    const order = dir > 0 ? ['L', 'C', 'R'] : ['R', 'C', 'L'];
    order.forEach((e, i) => this.gaze(e, at + i * this.rand(180, 380), to, dur, 'glide'));
    this.shared = to;
    if (this.chance(0.3)) {
      // "Found something!"
      const found = this.roomTarget('guest');
      const t2 = at + dur * this.rand(0.4, 0.8);
      for (const e of EYES) this.dart(e, t2 + this.rand(0, 200), this.jitter(found, 0.5));
      this.shared = found;
      return dur + 2500;
    }
    return dur + this.rand(400, 1500);
  }

  // ------------------------------------------------------------- blinking
  blinkLoop() {
    if (!this.started) return;
    const alert = this.mode === 'alert';
    const next = this.rand(1700, 4300) * (alert ? 0.75 : this.mode === 'lazy' ? 1.3 : 1);
    const now = this.now();
    if (!this.asleep && now >= this.noBlinkUntil) {
      const at = now + LEAD_MS;
      const r = this.random();
      if (r < 0.42) {
        for (const e of EYES) this.blink(e, at + this.rand(0, 50));
      } else if (r < 0.55) {
        const order = this.chance(0.5) ? EYES : [...EYES].reverse();
        const step = this.rand(85, 140);
        order.forEach((e, i) => this.blink(e, at + i * step));
      } else if (r < 0.6) {
        for (const e of EYES) { this.blink(e, at, { dur: 200 }); this.blink(e, at + 320, { dur: 210 }); }
      } else if (r < 0.63) {
        for (const e of EYES) this.blink(e, at, { dur: 750, hold: 160 });
      } else {
        const e = this.pick(EYES);
        this.blink(e, at, this.chance(0.12) ? { dur: 240, depth: 0.6 } : {});
        if (this.chance(0.25)) this.blink(this.pick(EYES.filter((x) => x !== e)), at + this.rand(150, 500));
      }
    }
    this.after(next, () => this.blinkLoop());
  }

  pupilLoop() {
    if (!this.started) return;
    if (!this.asleep && this.now() >= this.busyUntil) {
      const at = this.now() + LEAD_MS;
      const base = this.modePupil() + this.rand(-0.08, 0.12);
      for (const e of EYES) this.pupil(e, at + this.rand(0, 300), base + this.rand(-0.03, 0.03), this.rand(1200, 2500));
    }
    this.after(this.rand(7000, 16000), () => this.pupilLoop());
  }

  // ------------------------------------------------------------- palettes
  changePalette(spec) {
    const now = this.now();
    const at = now + LEAD_MS;
    let eyes;
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      eyes = { L: spec.L ?? spec.all, C: spec.C ?? spec.all, R: spec.R ?? spec.all };
    } else if (typeof spec === 'string') {
      eyes = { L: spec, C: spec, R: spec };
    } else {
      const ids = Object.keys(PALETTES);
      const cur = new Set(Object.values(this.palette));
      const fresh = ids.filter((i) => !cur.has(i));
      if (this.chance(0.22)) {
        const pool = [...fresh];
        eyes = {};
        for (const e of EYES) {
          const i = Math.floor(this.random() * pool.length);
          eyes[e] = pool.splice(i, 1)[0] || this.pick(ids);
        }
      } else {
        const p = this.pick(fresh.length ? fresh : ids);
        eyes = { L: p, C: p, R: p };
      }
    }
    for (const e of EYES) if (eyes[e] == null) eyes[e] = this.palette[e];
    this.palette = eyes;
    for (const e of EYES) this.blink(e, at, { dur: 900, hold: 380 });
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 1200);
    this.emit({ type: 'palette', at: at + 320, dur: 320, eyes });
    this.nextChapterAt = now + this.config.chapterMinutes * 60000 * this.rand(0.7, 1.3);
    this.log('palette', Object.values(eyes).join('/'));
    return eyes;
  }

  // ------------------------------------------------------------- specials
  isEnabled(id) { return !this.config.disabled.includes(id); }

  pickSpecial() {
    const now = this.now();
    const pool = SPECIALS.filter((s) => this.isEnabled(s.id));
    if (!pool.length) return null;
    const avoid = new Set(this.recent.slice(0, Math.min(10, pool.length - 1)));
    const candidates = pool.filter((s) => !avoid.has(s.id));
    return this.weighted(candidates.length ? candidates : pool, (s) => {
      const last = this.lastPlayed[s.id];
      const stale = last == null ? 4 : Math.min(3, (now - last) / 1800000);
      return s.weight * (1 + stale);
    });
  }

  pickMessage() {
    return this.weighted(MESSAGES, (m) => m.weight).words;
  }

  runSpecial(id, params = {}, { manual = false } = {}) {
    const def = SPECIAL_MAP[id];
    if (!def) throw new Error(`unknown special: ${id}`);
    const now = this.now();
    const at = now + LEAD_MS;
    // Anything already playing fades out quickly.
    this.endFx(at, (f) => true);
    const p = { ...params };
    if (id === 'message' && !Array.isArray(p.words)) p.words = this.pickMessage();
    if (Array.isArray(p.words)) p.words = p.words.slice(0, 3).map((w) => String(w).slice(0, 24).toUpperCase());
    const dur = Number(params.dur) > 0 ? Math.min(600, Number(params.dur)) : def.dur;
    const fx = {
      type: 'fx', kind: 'special', id, key: `s${++this.fxSeq}`, at, dur,
      seed: Math.floor(this.random() * 2 ** 31), params: p,
    };
    this.fx.push(fx);
    this.emit(fx);
    const end = at + dur * 1000;
    this.busyUntil = end;
    if (def.noBlink) this.noBlinkUntil = Math.max(this.noBlinkUntil, end);
    this.lastPlayed[id] = now;
    this.recent = [id, ...this.recent.filter((r) => r !== id)].slice(0, 20);
    const gap = Math.max(90000, this.erlang(this.config.specialMean * 1000) - dur * 1000);
    this.nextSpecialAt = end + gap;
    this.log('special', id, { manual, params: p });
    return fx;
  }

  endFx(at, filter = () => true) {
    const ended = this.fx.filter(filter);
    for (const f of ended) this.emit({ type: 'fxEnd', at, key: f.key });
    this.fx = this.fx.filter((f) => !ended.includes(f));
    if (ended.some((f) => f.kind === 'special')) {
      this.busyUntil = Math.min(this.busyUntil, at + 1500);
      this.noBlinkUntil = Math.min(this.noBlinkUntil, at + 1500);
    }
    return ended.length;
  }

  stopAll() {
    const at = this.now() + LEAD_MS;
    const n = this.endFx(at);
    this.busyUntil = at + 1200;
    this.noBlinkUntil = at;
    this.gazeHoldUntil = 0;
    return n;
  }

  // --------------------------------------------------------------- quirks
  pickQuirk() {
    const pool = QUIRKS.filter((q) => this.isEnabled(q.id) && !this.recentQuirks.slice(0, 4).includes(q.id));
    if (!pool.length) return null;
    return this.weighted(pool, (q) => q.weight);
  }

  runQuirk(id, params = {}, { manual = false } = {}) {
    const def = QUIRK_MAP[id];
    if (!def) throw new Error(`unknown quirk: ${id}`);
    const now = this.now();
    const at = now + LEAD_MS;
    let dur = def.dur;
    if (def.kind === 'fx') {
      const fx = {
        type: 'fx', kind: 'quirk', id, key: `q${++this.fxSeq}`, at, dur,
        seed: Math.floor(this.random() * 2 ** 31), params: { eye: params.eye || this.pick(EYES), ...params },
      };
      this.fx.push(fx);
      this.emit(fx);
    } else {
      const fn = QUIRK_IMPL[id];
      dur = fn.call(this, at, params) ?? def.dur;
    }
    this.busyUntil = Math.max(this.busyUntil, at + dur * 1000);
    this.recentQuirks = [id, ...this.recentQuirks.filter((r) => r !== id)].slice(0, 10);
    this.log('quirk', id, { manual });
    return { id, at, dur };
  }

  // ------------------------------------------------------- manual control
  look(p, { hold = 5, ease = 'dart', dur, eyes = EYES } = {}) {
    const at = this.now() + LEAD_MS;
    const to = [Number(p[0]) || 0, Number(p[1]) || 0, Math.max(0.3, Number(p[2]) || 5)];
    this.cancel(at - 1, ['gaze']);
    for (const e of eyes) {
      if (ease === 'dart') this.dart(e, at, to, { blinkChance: 0 });
      else this.gaze(e, at, to, dur ?? (ease === 'track' ? 250 : 1200), ease === 'track' ? 'glide' : ease);
    }
    this.shared = to;
    this.gazeHoldUntil = at + Math.max(0.2, hold) * 1000;
    return { at, to };
  }

  blinkNow({ eyes = EYES, kind = 'normal' } = {}) {
    const at = this.now() + LEAD_MS;
    const opts = { normal: {}, slow: { dur: 900, hold: 250 }, double: null, half: { dur: 260, depth: 0.55 } }[kind];
    for (const e of eyes) {
      if (kind === 'double') { this.blink(e, at); this.blink(e, at + 330); } else this.blink(e, at, opts || {});
    }
    return { at };
  }

  setMood(mood, { eyes = EYES, dur = 600, hold = 0 } = {}) {
    const at = this.now() + LEAD_MS;
    const v = typeof mood === 'string' ? MOODS[mood] : mood;
    if (!v) throw new Error(`unknown mood: ${mood}`);
    for (const e of eyes) this.lids(e, at, v, dur);
    if (hold > 0) {
      this.moodOverrideUntil = at + hold * 1000;
      this.after(hold * 1000 + LEAD_MS, () => this.restoreLids(this.now() + LEAD_MS, 900));
    } else {
      this.moodOverrideUntil = 0;
    }
    return { at };
  }

  sleep() {
    if (this.asleep) return;
    const at = this.now() + LEAD_MS;
    this.endFx(at);
    this.cancel(at);
    this.asleep = true;
    EYES.forEach((e, i) => this.emit({ type: 'sleep', eye: e, at: at + i * 500, asleep: true, dur: 2200 }));
    this.log('sleep', 'sleep');
  }

  wake() {
    if (!this.asleep) return;
    const at = this.now() + LEAD_MS;
    this.asleep = false;
    for (const e of EYES) this.emit({ type: 'sleep', eye: e, at, asleep: false, dur: 160 });
    const to = this.roomTarget('guest');
    for (const e of EYES) { this.lids(e, at, 'wide', 150); this.dart(e, at + 80, to, { blinkChance: 0 }); }
    this.after(2500, () => this.restoreLids(this.now() + LEAD_MS, 1200));
    this.gazeHoldUntil = at + 2500;
    this.busyUntil = Math.max(this.busyUntil, at + 3000);
    this.nextSpecialAt = Math.max(this.nextSpecialAt, at + 60000);
    this.log('sleep', 'wake');
  }

  setConfig(patch = {}) {
    const c = { ...this.config };
    if (typeof patch.auto === 'boolean') c.auto = patch.auto;
    if (Number(patch.specialMean) > 0) c.specialMean = Math.max(20, Math.min(7200, Number(patch.specialMean)));
    if (Number(patch.quirkMean) > 0) c.quirkMean = Math.max(5, Math.min(3600, Number(patch.quirkMean)));
    if (Number(patch.chapterMinutes) > 0) c.chapterMinutes = Math.max(1, Math.min(240, Number(patch.chapterMinutes)));
    if (Array.isArray(patch.disabled)) c.disabled = patch.disabled.filter((x) => typeof x === 'string');
    const now = this.now();
    if (c.specialMean !== this.config.specialMean) {
      this.nextSpecialAt = Math.min(this.nextSpecialAt, now + Math.max(20000, this.erlang(c.specialMean * 1000)));
    }
    if (c.quirkMean !== this.config.quirkMean) {
      this.nextQuirkAt = Math.min(this.nextQuirkAt, now + Math.max(5000, this.erlang(c.quirkMean * 1000)));
    }
    this.config = c;
    this.onConfig(c);
    return c;
  }

  // ------------------------------------------------------------ snapshots
  snapshot() {
    const now = this.now();
    return {
      mode: this.mode,
      asleep: this.asleep,
      palette: this.palette,
      eyes: this.eyes,
      fx: this.fx.filter((f) => f.at + f.dur * 1000 > now),
    };
  }

  status() {
    const now = this.now();
    const active = this.fx.filter((f) => f.at + f.dur * 1000 > now);
    return {
      now,
      uptime: Math.round((now - this.startedAt) / 1000),
      mode: this.mode,
      modeEndsIn: Math.max(0, Math.round((this.modeUntil - now) / 1000)),
      asleep: this.asleep,
      palette: this.palette,
      config: this.config,
      active: active.map((f) => ({ key: f.key, kind: f.kind, id: f.id, endsIn: Math.round((f.at + f.dur * 1000 - now) / 1000), params: f.params })),
      nextSpecialIn: Math.round((this.nextSpecialAt - now) / 1000),
      nextQuirkIn: Math.round((this.nextQuirkAt - now) / 1000),
      nextPaletteIn: Math.round((this.nextChapterAt - now) / 1000),
      history: this.history.slice(0, 30),
    };
  }
}

// ---------------------------------------------------------------------------
// Server-choreographed quirks. `this` is the Director, `at` the start time.
// Each returns its duration in seconds.
// ---------------------------------------------------------------------------
const QUIRK_IMPL = {
  wink(at, { eye } = {}) {
    const e = eye || this.pick(EYES);
    this.blink(e, at, { dur: 560, hold: 200 });
    this.lids(e, at + 520, { upper: 0.36, lower: 0.3, tilt: 0 }, 250);
    this.after(1900, () => this.restoreLids(this.now() + LEAD_MS, 600));
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 1800);
    return 2.5;
  },

  doubletake(at) {
    const old = [...this.shared];
    const A = this.distantTarget('guest');
    for (const e of EYES) this.dart(e, at + this.rand(0, 80), this.jitter(A, 0.4), { blinkChance: 0 });
    for (const e of EYES) this.dart(e, at + 520 + this.rand(0, 60), this.jitter(old, 0.4), { blinkChance: 0 });
    for (const e of EYES) {
      this.dart(e, at + 1250 + this.rand(0, 50), this.jitter(A, 0.3), { blinkChance: 0 });
      this.lids(e, at + 1250, 'wide', 120);
      this.pupil(e, at + 1250, 0.26, 250);
    }
    this.shared = A;
    this.gazeHoldUntil = at + 3600;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 2600);
    this.after(3000, () => { const t = this.now() + LEAD_MS; this.restoreLids(t, 800); this.restorePupils(t); });
    return 4;
  },

  neighbor(at) {
    const [a, b] = this.pick([['L', 'C'], ['C', 'R'], ['C', 'L'], ['R', 'C']]);
    const third = EYES.find((e) => e !== a && e !== b);
    const reply = this.rand(350, 700);
    this.dart(a, at, this.eyeTarget(b), { blinkChance: 0 });
    this.dart(b, at + reply, this.eyeTarget(a), { blinkChance: 0 });
    this.lids(a, at + reply + 150, 'suspicious', 400);
    this.lids(b, at + reply + 150, 'suspicious', 400);
    this.dart(third, at + reply + 600, this.eyeTarget(this.pick([a, b])), { blinkChance: 0 });
    const away = at + reply + this.rand(1500, 2200);
    const to = this.distantTarget('guest');
    for (const e of EYES) this.dart(e, away + this.rand(0, 120), this.jitter(to, 0.5), { blinkChance: 0.2 });
    this.shared = to;
    this.gazeHoldUntil = away + 1200;
    this.after(away - at + 200, () => this.restoreLids(this.now() + LEAD_MS, 500));
    return (away - at) / 1000 + 1.5;
  },

  squint(at) {
    const V = this.roomTarget('guest');
    EYES.forEach((e, i) => {
      this.gaze(e, at + i * 120, this.jitter(V, 0.3), 900, 'glide');
      this.lids(e, at + i * 120, 'suspicious', 700);
    });
    this.shared = V;
    this.gazeHoldUntil = at + 4200;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 4000);
    this.after(4000, () => this.restoreLids(this.now() + LEAD_MS, 700));
    return 5;
  },

  widen(at) {
    for (const e of EYES) {
      this.lids(e, at + this.rand(0, 60), 'wide', 160);
      this.pupil(e, at, 0.24, 260);
    }
    if (this.chance(0.6)) {
      const to = this.distantTarget();
      for (const e of EYES) this.dart(e, at + this.rand(40, 160), this.jitter(to, 0.5), { blinkChance: 0 });
      this.shared = to;
      this.gazeHoldUntil = at + 2200;
    }
    this.after(2000, () => { const t = this.now() + LEAD_MS; this.restoreLids(t, 900); this.restorePupils(t, 1500); });
    return 3;
  },

  pupils(at) {
    EYES.forEach((e, i) => this.pupil(e, at + i * 150, 0.74, 1100));
    this.after(2700, () => this.restorePupils(this.now() + LEAD_MS, 1400));
    return 4;
  },

  cascade(at) {
    const order = this.chance(0.5) ? EYES : [...EYES].reverse();
    order.forEach((e, i) => this.blink(e, at + i * 120));
    [...order].reverse().forEach((e, i) => this.blink(e, at + 700 + i * 120));
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 1800);
    return 2.5;
  },

  crosseyed(at) {
    const P = [0, -0.5, 0.7];
    for (const e of EYES) this.gaze(e, at + this.rand(0, 80), P, 380, 'glide');
    for (const e of EYES) this.blink(e, at + 1900, { dur: 300 });
    const back = this.shared;
    for (const e of EYES) this.gaze(e, at + 2050, this.jitter(back), 300, 'glide');
    this.gazeHoldUntil = at + 2900;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 1900);
    return 3.5;
  },

  tabletop(at) {
    const dishes = EYES.map(() => this.roomTarget('table'));
    EYES.forEach((e, i) => {
      this.gaze(e, at + i * 200, dishes[i], 1300, 'glide');
      this.pupil(e, at + i * 200, 0.6, 1200);
      this.dart(e, at + 1900 + this.rand(0, 400), dishes[(i + 1) % 3], { blinkChance: 0 });
      this.dart(e, at + 3000 + this.rand(0, 400), this.roomTarget('table'), { blinkChance: 0 });
    });
    const up = this.roomTarget('guest');
    for (const e of EYES) this.gaze(e, at + 4500 + this.rand(0, 300), this.jitter(up), 1300, 'glide');
    this.shared = up;
    this.gazeHoldUntil = at + 6000;
    this.after(5000, () => this.restorePupils(this.now() + LEAD_MS));
    return 6;
  },

  startle(at) {
    const to = this.roomTarget(this.chance(0.5) ? 'side' : 'far');
    for (const e of EYES) {
      this.lids(e, at, 'wide', 110);
      this.pupil(e, at, 0.22, 200);
      this.dart(e, at + this.rand(30, 120), this.jitter(to, 0.4), { blinkChance: 0 });
    }
    const order = this.chance(0.5) ? EYES : [...EYES].reverse();
    order.forEach((e, i) => this.blink(e, at + 900 + i * 100));
    this.shared = to;
    this.gazeHoldUntil = at + 2200;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 1500);
    this.after(1900, () => { const t = this.now() + LEAD_MS; this.restoreLids(t, 1000); this.restorePupils(t, 1500); });
    return 3;
  },

  slowblink(at) {
    for (const e of EYES) {
      this.lids(e, at, 'relaxed', 600);
      this.blink(e, at + 500, { dur: 1300, hold: 420 });
    }
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 2800);
    this.after(2300, () => this.restoreLids(this.now() + LEAD_MS, 800));
    return 3;
  },

  sideeye(at) {
    const dir = this.chance(0.5) ? -1 : 1;
    const to = [dir * this.rand(10, 14), this.rand(-0.8, 0), this.rand(1.5, 3)];
    EYES.forEach((e, i) => {
      this.gaze(e, at + i * 90, this.jitter(to, 0.3), 650, 'glide');
      this.lids(e, at + i * 90, { upper: 0.24, lower: 0.3, tilt: 0.05 }, 500);
    });
    const back = this.roomTarget('guest');
    for (const e of EYES) this.gaze(e, at + 3700, this.jitter(back), 900, 'glide');
    this.shared = back;
    this.gazeHoldUntil = at + 4700;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 3600);
    this.after(3700, () => this.restoreLids(this.now() + LEAD_MS, 800));
    return 5;
  },

  scan(at) {
    const dir = this.chance(0.5) ? -1 : 1;
    const y = this.rand(-1, 0.3), z = this.rand(4, 7);
    const order = dir > 0 ? ['L', 'C', 'R'] : ['R', 'C', 'L'];
    for (const e of EYES) this.gaze(e, at, [-9 * dir, y, z], 900, 'glide');
    order.forEach((e, i) => this.gaze(e, at + 1200 + i * 260, [9 * dir, y, z], 5200, 'glide'));
    const back = this.roomTarget('guest');
    for (const e of EYES) this.gaze(e, at + 7300, this.jitter(back), 1200, 'glide');
    for (const e of EYES) this.lids(e, at, 'suspicious', 800);
    this.after(7300, () => this.restoreLids(this.now() + LEAD_MS, 900));
    this.shared = back;
    this.gazeHoldUntil = at + 8600;
    return 9;
  },

  snap(at) {
    const to = this.distantTarget('guest');
    for (const e of EYES) {
      this.dart(e, at, to, { blinkChance: 0 });
      this.lids(e, at, { upper: 0.5, lower: 0.46, tilt: 0 }, 160);
      this.pupil(e, at, 0.3, 300);
    }
    this.shared = to;
    this.gazeHoldUntil = at + 3400;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 3300);
    this.after(3200, () => { const t = this.now() + LEAD_MS; this.restoreLids(t, 900); this.restorePupils(t); });
    return 4;
  },

  peekaboo(at) {
    for (const e of EYES) this.blink(e, at + this.rand(0, 60), { dur: 1900, hold: 1300 });
    const to = this.distantTarget();
    for (const e of EYES) this.gaze(e, at + 700, this.jitter(to, 0.4), 300, 'glide');
    for (const e of EYES) this.lids(e, at + 1500, 'wide', 300);
    this.after(3000, () => this.restoreLids(this.now() + LEAD_MS, 900));
    this.shared = to;
    this.gazeHoldUntil = at + 3200;
    this.noBlinkUntil = Math.max(this.noBlinkUntil, at + 3000);
    return 4;
  },
};

export const SERVER_QUIRKS = Object.keys(QUIRK_IMPL);
