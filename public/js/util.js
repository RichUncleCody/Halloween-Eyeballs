// Small deterministic helpers shared by the animator and the effects.
// Anything random that must look the same on every screen uses a seeded RNG.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
// 0 before a, 1 after b, smooth in between.
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
// Rises a->b, holds, falls c->d.
export const pulse = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));
export const TAU = Math.PI * 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
  };
}

// Smooth 1-D value noise in [-1, 1]. Pure function of (x, seed).
function h1(i, seed) {
  let x = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x27d4eb2d), 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return h1(i, seed) * (1 - u) + h1(i + 1, seed) * u;
}
export function fbm1(x, seed = 0) {
  return noise1(x, seed) * 0.6 + noise1(x * 2.1, seed + 7) * 0.28 + noise1(x * 4.3, seed + 13) * 0.12;
}

export const easeOutBack = (t, s = 0.9) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const easeInOut = smoother;

export function lerpAngles(a, b, w) {
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
}

export function rgba(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

// Gaze keyframes: [{ t, a: [yaw, pitch], d: seconds, ease: 'dart'|'glide' }, ...]
// The first key is the starting pose. Each later key moves from the previous
// pose to its own over `d` seconds starting at `t`.
export function keyGaze(keys, t) {
  let prev = keys[0].a;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k.t) break;
    const d = k.d ?? 0.12;
    const u = (t - k.t) / d;
    if (u < 1) {
      const e = k.ease === 'glide' ? smoother(u) : easeOutBack(u, 0.6);
      return lerpAngles(prev, k.a, e);
    }
    prev = k.a;
  }
  return prev;
}

// A single blink starting at t0 (seconds). Returns lid closure 0..1.
export function blinkAt(t, t0, dur = 0.25, hold = 0.03) {
  const x = t - t0;
  if (x < 0 || x > dur + hold) return 0;
  const close = Math.max(0.05, dur * 0.36);
  if (x < close) { const u = x / close; return u * u; }
  if (x < close + hold) return 1;
  return 1 - smooth((x - close - hold) / Math.max(0.05, dur - close));
}

// Seconds-based "is anything in this sorted list of times recent?" helper.
export function since(times, t) {
  let best = Infinity;
  for (const s of times) if (t >= s && t - s < best) best = t - s;
  return best;
}

export function hsv(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
