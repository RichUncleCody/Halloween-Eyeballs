// Personality specials: googly eyes, dizzy, pass-the-glance, the stare,
// drowsy, candlelight.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, fbm1, noise1, keyGaze, blinkAt, makeRng, smooth } from '../util.js';
import { glow, vignette, setFont } from './draw.js';

register({
  // ------------------------------------------------------------- googly
  googly(api) {
    const R = api.rng;
    const shakes = [];
    for (let t = R.range(1.6, 2.4); t < api.dur - 2; t += R.range(1.0, 2.2)) {
      shakes.push({ t, a: R.range(0, TAU), m: R.range(2.5, 5.5), spin: R.chance(0.3) });
    }
    const p = [0, -0.2], v = [0, 0];
    const Rmax = 0.66 - 0.335;
    let next = 0, last = null;
    const swapIn = 0.5, swapOut = api.dur - 0.7;
    return {
      noBlink: true,
      update(t, dt) {
        if (last === null) last = t;
        const step = clamp(t - last, 0, 0.05);
        last = t;
        while (next < shakes.length && t >= shakes[next].t) {
          const s = shakes[next++];
          const k = 0.6 + 0.4 * ((api.idx + 2) / 3);
          if (s.spin) { const ang = Math.atan2(p[1], p[0]) + Math.PI / 2; v[0] += Math.cos(ang) * s.m * 1.4; v[1] += Math.sin(ang) * s.m * 1.4; }
          else { v[0] += Math.cos(s.a + api.idx * 0.4) * s.m * k; v[1] += Math.sin(s.a + api.idx * 0.4) * s.m * k; }
        }
        v[1] -= 4.2 * step;
        v[0] *= 1 - 0.6 * step; v[1] *= 1 - 0.6 * step;
        p[0] += v[0] * step; p[1] += v[1] * step;
        const d = Math.hypot(p[0], p[1]);
        if (d > Rmax) {
          const nx = p[0] / d, ny = p[1] / d;
          p[0] = nx * Rmax; p[1] = ny * Rmax;
          const vn = v[0] * nx + v[1] * ny;
          if (vn > 0) { v[0] -= 1.55 * vn * nx; v[1] -= 1.55 * vn * ny; v[0] *= 0.92; v[1] *= 0.92; }
        }
      },
      theme(th, t) {
        th.googly = t > swapIn && t < swapOut ? 1 : 0;
        th.googPos = [p[0], p[1]];
        let sh = 0;
        for (const s of shakes) sh = Math.max(sh, Math.exp(-(t - s.t) * 9) * (t >= s.t ? 1 : 0));
        th.offset[0] += noise1(t * 40, 1) * 0.012 * sh;
        th.offset[1] += noise1(t * 40, 2) * 0.008 * sh;
        mixTheme(th, { key: 1.1, keyColor: [1, 1, 1] }, th.googly);
      },
      blink: (t) => Math.max(blinkAt(t, swapIn - 0.18, 0.4, 0.06), blinkAt(t, swapOut - 0.18, 0.4, 0.06)),
    };
  },

  // -------------------------------------------------------------- dizzy
  dizzy(api) {
    const cross = [7.2, 9.4];
    const stars = Array.from({ length: 5 }, (_, i) => i / 5);
    return {
      noBlink: true,
      gaze(t) {
        if (t < cross[0]) {
          const phase = 2 * t + 0.55 * t * t + api.idx * ramp(t, 2, 6) * 1.3;
          const A = ramp(t, 0, 1.2);
          return { yaw: 0.42 * A * Math.cos(phase), pitch: 0.3 * A * Math.sin(phase), w: api.env(t, 0.5, 1) };
        }
        const wob = Math.sin(t * 9) * 0.05;
        const yaw = api.idx === 0 ? wob : -api.idx * 0.68 + wob;
        const pitch = api.idx === 0 ? -0.38 : -0.12 + Math.cos(t * 7) * 0.03;
        return { yaw, pitch, w: api.env(t, 0.5, 1.2) };
      },
      lids: (t) => ({ upper: 0.3, lower: 0.42, tilt: -0.1, w: api.env(t, 1.5, 1) * 0.8 }),
      blink: (t) => blinkAt(t, cross[1], 0.35) + blinkAt(t, cross[1] + 0.45, 0.3),
      theme(th, t) {
        const sh = pulse(t, cross[1] + 0.1, cross[1] + 0.2, cross[1] + 0.8, cross[1] + 1);
        th.offset[0] += Math.sin(t * 38) * 0.012 * sh;
      },
      draw(ctx, t) {
        if (t < cross[0] - 0.3 || t > cross[1] + 0.5) return;
        const { H } = api.view;
        const a = pulse(t, cross[0] - 0.3, cross[0], cross[1], cross[1] + 0.5);
        const [cx, cy] = api.eyePoint(0, 0.85);
        setFont(ctx, H * 0.07, 'system-ui, sans-serif');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const s of stars) {
          const ang = s * TAU + t * 3;
          const x = cx + Math.cos(ang) * H * 0.32, y = cy + Math.sin(ang) * H * 0.07;
          ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(ang));
          ctx.fillStyle = '#ffd84a';
          ctx.fillText('★', x, y);
        }
        ctx.globalAlpha = 1;
      },
    };
  },

  // ------------------------------------------------------------- domino
  domino(api) {
    const R = api.rng;
    const me = api.pos;
    const neighbor = (p) => api.look([api.eyeXOf(p), 0.1, 0.35]);
    const center = api.look([0, -0.3, 6]);
    const far = api.look([R.sign() * 8, -0.5, 4]);
    const guest = api.look([R.range(-4, 4), R.range(-1.2, 0.3), R.range(4, 7)]);
    const keys = [{ t: 0, a: api.anim.gaze.slice() }, { t: 0.2, a: center, d: 0.8, ease: 'glide' }];
    const add = (t, a, d = 0.12, ease = 'dart') => keys.push({ t, a, d, ease });
    if (me === 'L') { add(1.5, neighbor('C')); add(4.15, far); }
    if (me === 'C') { add(1.9, neighbor('L')); add(2.6, neighbor('R')); add(3.9, far); }
    if (me === 'R') { add(3.0, neighbor('C')); add(3.6, far); }
    const up = api.look([0, 3.5, 6]), dn = api.look([0, -3.5, 5]), lf = api.look([-7, -0.2, 5]), rt = api.look([7, -0.2, 5]);
    add(7.0, up, 0.25, 'glide'); add(7.5, dn, 0.3, 'glide'); add(8.1, up, 0.3, 'glide'); add(8.7, dn, 0.3, 'glide');
    add(9.4, lf, 0.25, 'glide'); add(9.9, rt, 0.3, 'glide'); add(10.4, lf, 0.3, 'glide'); add(10.9, center, 0.3, 'glide');
    add(11.3, guest);
    const order = { L: 0, C: 1, R: 2 }[me];
    const waveT = [5.0 + order * 0.25, 6.4 - order * 0.25];
    return {
      gaze(t) { const [yaw, pitch] = keyGaze(keys, t); return { yaw, pitch, w: api.env(t, 0.3, 1.2) }; },
      lids: (t) => ({ upper: 0.62, lower: 0.52, tilt: -0.08, w: Math.max(pulse(t, waveT[0], waveT[0] + 0.1, waveT[0] + 0.3, waveT[0] + 0.5), pulse(t, 11.3, 11.4, 12.3, 12.8)) }),
      blink: (t) => Math.max(blinkAt(t, waveT[1], 0.25), blinkAt(t, 3.3, 0.2) * (me === 'C' ? 1 : 0)),
    };
  },

  // -------------------------------------------------------------- stare
  stare(api) {
    const R = api.rng;
    const victim = api.look([R.range(-5, 5), R.range(-1.2, 0.3), R.range(3.5, 8)]);
    const rel = api.look([R.range(-4, 4), R.range(-1, 0.4), R.range(4, 8)]);
    const keys = [{ t: 0, a: api.anim.gaze.slice() }, { t: 0.3, a: victim, d: 0.12 }, { t: 12.4, a: rel, d: 2.2, ease: 'glide' }];
    return {
      noBlink: true,
      gaze(t) { const [yaw, pitch] = keyGaze(keys, t); return { yaw, pitch, w: api.env(t, 0.3, 1.5) }; },
      lids(t) {
        const k = ramp(t, 0.5, 10);
        return { upper: lerp(0.58, 0.2, k), lower: lerp(0.5, 0.27, k), tilt: lerp(-0.05, 0.18, k), w: api.env(t, 0.3, 2) };
      },
      pupil: (t) => ({ size: lerp(0.32, 0.15, ramp(t, 0.5, 10)), w: api.env(t, 0.3, 2) }),
      blink: (t) => blinkAt(t, 12.2, 0.9, 0.2),
      theme(th, t) {
        const w = api.env(t, 1, 2);
        mixTheme(th, { ambient: 0.6, vignette: 1, key: 0.85 }, w);
        th.glow += 0.25 * ramp(t, 8, 11) * w;
        th.glowColor = [0.9, 0.05, 0.02];
        th.offset[0] += noise1(t * 20, 3) * 0.0015 * ramp(t, 4, 11) * w;
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        vignette(ctx, W, H, '0,0,0', 0.55 * api.env(t, 2, 2), 0.25);
      },
    };
  },

  // ------------------------------------------------------------- drowsy
  drowsy(api) {
    const R = api.rng;
    const order = { L: 0, C: 1, R: 2 }[api.pos];
    const closeAt = 7 + order * 0.6;
    const snap = 12;
    const startle = api.look([R.sign() * R.range(5, 10), R.range(-0.5, 1), R.range(2, 5)]);
    const zs = Array.from({ length: 4 }, (_, i) => snap - 3.6 + i * 0.8 + order * 0.2);
    return {
      noBlink: true,
      lids(t) {
        if (t < snap) {
          const droop = ramp(t, 0, 7) - 0.25 * pulse(t, 3.0, 3.15, 3.4, 3.9) - 0.2 * pulse(t, 5.2, 5.35, 5.6, 6.2);
          return { upper: lerp(0.4, 0.1, droop), lower: 0.42, tilt: -0.06, w: api.env(t, 1, 0.1) };
        }
        return { upper: 0.62, lower: 0.52, tilt: -0.06, w: pulse(t, snap, snap + 0.06, snap + 2, snap + 3.5) };
      },
      blink(t) {
        const heavy = Math.max(blinkAt(t, 2.0, 0.6, 0.2), blinkAt(t, 4.2, 0.9, 0.5), blinkAt(t, 6.0, 1.2, 0.7));
        const sleep = ramp(t, closeAt, closeAt + 0.9) * (1 - ramp(t, snap, snap + 0.08));
        return Math.max(heavy, sleep);
      },
      gaze(t) {
        if (t < snap) return { yaw: api.anim.gaze[0] * 0.5, pitch: lerp(api.anim.gaze[1], -0.3, ramp(t, 1, 8)), w: api.env(t, 1.5, 0.1) };
        return { yaw: startle[0], pitch: startle[1], w: pulse(t, snap, snap + 0.12, snap + 2.2, snap + 3.5) };
      },
      pupil: (t) => ({ size: t < snap ? 0.55 : 0.18, w: t < snap ? api.env(t, 2, 0.1) : pulse(t, snap, snap + 0.1, snap + 2, snap + 3.5) }),
      draw(ctx, t) {
        const { H } = api.view;
        const [x0, y0] = api.eyePoint(0.45, 0.12);
        setFont(ctx, H * 0.13, '"Comic Sans MS", "Chalkboard SE", ui-rounded, system-ui, sans-serif');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const z of zs) {
          const d = t - z;
          if (d < 0 || d > 2.6 || t > snap) continue;
          const a = Math.sin((d / 2.6) * Math.PI);
          const s = 0.6 + d * 0.35;
          ctx.save();
          ctx.translate(x0 + d * H * 0.1 + Math.sin(d * 3) * H * 0.02, y0 - d * H * 0.13);
          ctx.scale(s, s);
          ctx.rotate(-0.2);
          ctx.fillStyle = `rgba(200,220,255,${0.85 * a})`;
          ctx.fillText('Z', 0, 0);
          ctx.restore();
        }
      },
    };
  },

  // ------------------------------------------------------------ candle
  candle(api) {
    const R = api.rng;
    const spots = [0, 1, 2, 3, 4, 5].map(() => api.look([R.range(-3, 3), R.range(-3.2, -2.2), R.range(2.5, 4.5)]));
    const guest = api.look([R.range(-4, 4), R.range(-1, 0.3), R.range(4, 7)]);
    const keys = [{ t: 0, a: api.anim.gaze.slice() }, { t: 1.5, a: spots[0], d: 2.2, ease: 'glide' }];
    let tt = 4;
    spots.slice(1).forEach((s, i) => { keys.push({ t: tt, a: i === 2 ? guest : s, d: R.range(1.2, 2.5), ease: 'glide' }); tt += R.range(3, 4.2); });
    const flick = (t) => 0.75 + 0.25 * clamp(0.5 + fbm1(t * 5.5, 31) * 0.9);
    const sway = (t) => fbm1(t * 1.3, 9) * 0.6;
    return {
      theme(th, t) {
        const w = api.env(t, 3, 3);
        const f = flick(t);
        mixTheme(th, {
          ambient: 0.18, keyDir: [0.12, -0.75, 0.65], keyColor: [1, 0.62, 0.28], skin: [0.2, 0.1, 0.06], vignette: 1,
          glowColor: [1, 0.5, 0.15], sclera: [0.93, 0.83, 0.66],
        }, w);
        th.key = lerp(th.key, 1.25 * f, w);
        th.glow += 0.12 * f * w;
      },
      gaze(t) { const [yaw, pitch] = keyGaze(keys, t); return { yaw, pitch, w: api.env(t, 1.5, 3) }; },
      lids: (t) => ({ upper: 0.32, lower: 0.4, tilt: 0, w: api.env(t, 3, 3) * 0.85 }),
      pupil: (t) => ({ size: 0.58, w: api.env(t, 3, 3) }),
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 3, 3);
        const f = flick(t);
        const [bx, by] = api.wall(0, -0.62);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, H * 1.6);
        g.addColorStop(0, `rgba(255,150,50,${0.28 * f * w})`);
        g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const [cx, cy] = api.wall(0, -0.4);
        if (cx < -H * 0.3 || cx > W + H * 0.3) return;
        ctx.globalAlpha = w;
        const cw = H * 0.07;
        const wax = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0);
        wax.addColorStop(0, '#8a6a4a'); wax.addColorStop(0.4, '#f3e2c2'); wax.addColorStop(1, '#6a4c30');
        ctx.fillStyle = wax;
        ctx.fillRect(cx - cw, cy, cw * 2, H);
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(cx - 1.5, cy - H * 0.025, 3, H * 0.03);
        const fh = H * 0.09 * (0.9 + 0.15 * f), fw = H * 0.025;
        const sx = sway(t) * fw;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx, cy - fh * 0.5, H * 0.35, '255,150,40', 0.35 * f);
        ctx.globalCompositeOperation = 'source-over';
        const fg = ctx.createRadialGradient(cx, cy - fh * 0.25, 1, cx, cy - fh * 0.4, fh);
        fg.addColorStop(0, '#fffbe8'); fg.addColorStop(0.35, '#ffd060'); fg.addColorStop(0.7, 'rgba(255,120,20,0.85)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(cx - fw, cy - fh * 0.1);
        ctx.quadraticCurveTo(cx - fw, cy - fh * 0.6, cx + sx, cy - fh);
        ctx.quadraticCurveTo(cx + fw, cy - fh * 0.6, cx + fw, cy - fh * 0.1);
        ctx.quadraticCurveTo(cx, cy + fh * 0.12, cx - fw, cy - fh * 0.1);
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    };
  },
});
