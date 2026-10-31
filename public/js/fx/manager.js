// Runs effect instances (specials + quirk fx) and gives each one an API for
// drawing on the shared "wall" of monitors and steering this eye.

import { makeRng, clamp, smooth } from '../util.js';
import { REGISTRY } from './registry.js';

export class FxManager {
  constructor(ctx) {
    // ctx: { pos, geo, view(), anim }
    this.ctx = ctx;
    this.active = [];
  }

  start(ev) {
    if (this.active.some((a) => a.ev.key === ev.key)) return;
    const def = REGISTRY[ev.id];
    if (!def) { console.warn('unknown effect', ev.id); return; }
    const api = makeApi(ev, this.ctx);
    let inst;
    try { inst = def(api); } catch (err) { console.error('effect failed to start', ev.id, err); return; }
    this.active.push({ ev, api, inst });
  }

  end(key, at) {
    for (const a of this.active) {
      if (key && a.ev.key !== key) continue;
      a.api.cutAt = Math.min(a.api.cutAt, at);
    }
  }

  clear() { this.active = []; }

  prune(now) {
    this.active = this.active.filter((a) => now < a.api.endMs());
  }

  // Seconds since start, or null if not started yet.
  time(a, now) {
    const t = (now - a.ev.at) / 1000;
    return t < 0 ? null : t;
  }
}

function makeApi(ev, ctx) {
  const api = {
    id: ev.id,
    key: ev.key,
    seed: ev.seed >>> 0,
    params: ev.params || {},
    dur: ev.dur,
    at: ev.at,
    cutAt: Infinity,
    pos: ctx.pos,
    get idx() { return ctx.geo.idx; },
    get geo() { return ctx.geo; },
    get anim() { return ctx.anim; },
    get view() { return ctx.view(); },
    rng: makeRng(ev.seed >>> 0),
    // Local-only randomness (particles that never cross screens).
    local: makeRng(((ev.seed >>> 0) ^ (ctx.geo.idx + 2) * 0x9e3779b1) >>> 0),

    endMs() {
      const natural = ev.at + ev.dur * 1000;
      return Math.min(natural, api.cutAt === Infinity ? Infinity : api.cutAt + 900);
    },
    // Envelope: fades in over `fin` s and out over `fout` s before the end
    // (or quickly if the server cut the effect short).
    env(t, fin = 1, fout = 1) {
      const end = (ev.at + ev.dur * 1000 - ev.at) / 1000;
      let w = Math.min(smooth(t / Math.max(0.001, fin)), smooth((end - t) / Math.max(0.001, fout)));
      if (api.cutAt !== Infinity) {
        const ct = (api.cutAt - ev.at) / 1000;
        w = Math.min(w, smooth(1 - (t - ct) / 0.9));
      }
      return clamp(w);
    },
    // Wall coordinates (monitor-height units, origin at centre of C) -> CSS px on this screen.
    wall(X, Y) {
      const v = ctx.view();
      return [(X - ctx.geo.eyeX) * v.H + v.W / 2, v.H / 2 - Y * v.H];
    },
    wallX(X) { const v = ctx.view(); return (X - ctx.geo.eyeX) * v.H + v.W / 2; },
    // Horizontal extent of the whole wall and of this screen in wall units.
    get wallHalf() { return ctx.geo.spacing + ctx.geo.aspect / 2; },
    get screenLeft() { return ctx.geo.eyeX - ctx.geo.aspect / 2; },
    get screenRight() { return ctx.geo.eyeX + ctx.geo.aspect / 2; },
    eyeXOf(pos) { return ctx.geo.eyeXOf(pos); },
    lookWall(X, Y, z = 1.2) { return ctx.geo.wallAngles(X, Y, z); },
    look(p) { return ctx.geo.angles(p); },
    // Screen position of a point given in eye units (lid maths matches the shader).
    eyePoint(ex, ey) {
      const v = ctx.view();
      const s = v.eyeScale;
      const off = v.offset || [0, 0];
      return [v.W / 2 + (ex * s + off[0]) * v.H, v.H / 2 - (ey * s + off[1]) * v.H];
    },
    lowerLidY(x, lower) {
      const w = Math.max(1 - x * x, 0);
      const inner = ctx.view().inner;
      return -lower * Math.pow(w, 0.78) * (1 + 0.07 * x * inner);
    },
  };
  return api;
}
