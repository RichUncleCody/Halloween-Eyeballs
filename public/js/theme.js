// The look of an eye is a flat "theme" object; every key maps to a shader
// uniform (irisA -> uIrisA). Effects blend their own values over the base.

import { PALETTES } from '/shared/catalog.js';

export const BASE_THEME = {
  sclera: [0.89, 0.85, 0.79],
  veins: 0.3,
  veinColor: [0.62, 0.07, 0.06],
  blood: 0,
  irisA: [0.98, 0.66, 0.18],
  irisB: [0.45, 0.22, 0.05],
  irisGlow: 0.06,
  limbus: 1,
  pupilColor: [0.0, 0.0, 0.0],
  pupilGlow: 0,
  slit: 0,
  bar: 0,
  skin: [0.2, 0.12, 0.09],
  skinAlpha: 1,
  keyColor: [1.0, 0.93, 0.86],
  key: 1,
  keyDir: [-0.35, 0.55, 0.9],
  ambient: 1,
  fire: 0,
  fireA: [0.9, 0.22, 0.02],
  fireB: [1.0, 0.72, 0.18],
  fireIris: 0,
  spiral: 0,
  spiralA: [0.03, 0.0, 0.06],
  spiralB: [0.75, 0.25, 1.0],
  galaxy: 0,
  milky: 0,
  frost: 0,
  eclipse: 0,
  rainbow: 0,
  hue: 0,
  void: 0,
  electric: 0,
  glow: 0,
  glowColor: [1.0, 0.3, 0.08],
  vignette: 0.85,
  glitch: 0,
  many: 0,
  manySync: 0,
  googly: 0,
  googPos: [0, -0.2],
  membrane: 0,
  fade: 0,
  offset: [0, 0],
  pupilScale: 1,
  lidFollow: 1,
};

const PALETTE_KEYS = ['irisA', 'irisB', 'skin', 'veins', 'sclera', 'irisGlow'];

export function cloneTheme(t) {
  const o = {};
  for (const k in t) o[k] = Array.isArray(t[k]) ? t[k].slice() : t[k];
  return o;
}

export function lerp(a, b, t) { return a + (b - a) * t; }

// Blend `over` into `th` by weight w (in place).
export function mixTheme(th, over, w) {
  if (!(w > 0)) return th;
  if (w > 1) w = 1;
  for (const k in over) {
    const v = over[k];
    if (Array.isArray(v)) {
      const d = th[k];
      for (let i = 0; i < v.length; i++) d[i] = d[i] + (v[i] - d[i]) * w;
    } else {
      th[k] = th[k] + (v - th[k]) * w;
    }
  }
  return th;
}

export function paletteTheme(spec) {
  const p = typeof spec === 'string' ? PALETTES[spec] : spec;
  const base = { irisA: BASE_THEME.irisA, irisB: BASE_THEME.irisB, skin: BASE_THEME.skin, veins: BASE_THEME.veins, sclera: BASE_THEME.sclera, irisGlow: BASE_THEME.irisGlow };
  const out = {};
  for (const k of PALETTE_KEYS) {
    const v = p && p[k] !== undefined ? p[k] : base[k];
    out[k] = Array.isArray(v) ? v.slice() : v;
  }
  return out;
}

// Base look with a smooth palette transition.
export class ThemeState {
  constructor(paletteId = 'amber') {
    this.from = paletteTheme(paletteId);
    this.to = paletteTheme(paletteId);
    this.t0 = 0;
    this.dur = 1;
  }

  setPalette(spec, at, dur, now) {
    // Start from wherever we currently are.
    this.from = this.current(now ?? at);
    this.to = paletteTheme(spec);
    this.t0 = at;
    this.dur = Math.max(1, dur);
  }

  current(now) {
    const s = Math.max(0, Math.min(1, (now - this.t0) / this.dur));
    const cur = cloneTheme(this.from);
    mixTheme(cur, this.to, s);
    return cur;
  }

  build(now) {
    const th = cloneTheme(BASE_THEME);
    Object.assign(th, this.current(now));
    return th;
  }
}
