// Elemental specials: demon, fires, frost, storm, electricity, fog.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, fbm1, noise1, keyGaze, blinkAt, since, makeRng } from '../util.js';
import { glow, vignette, flash, boltPoints, drawBolt, fogSprite, Particles } from './draw.js';

const heart = (t, beat = 1.05) => {
  const ph = (t % beat) / beat;
  return Math.exp(-(((ph - 0.03) / 0.035) ** 2)) + 0.7 * Math.exp(-(((ph - 0.22) / 0.04) ** 2));
};

function embersFx(api, rgb, opts = {}) {
  const P = new Particles(opts.max || 260);
  const L = api.local;
  return (ctx, t, dt, w) => {
    const { W, H } = api.view;
    P.spawn((opts.rate || 70) * w, dt, () => ({
      x: L.range(-0.05, 1.05) * W, y: H + 10, vx: L.range(-20, 20), vy: -L.range(opts.vmin || 60, opts.vmax || 170),
      r: L.range(1.2, opts.rmax || 3.6), age: 0, life: L.range(2, 4.5), ph: L.range(0, TAU),
    }));
    P.step(dt, (p) => {
      p.x += (p.vx + Math.sin(p.age * 3 + p.ph) * (opts.wobble || 25)) * dt;
      p.y += p.vy * dt;
      p.vy *= 1 - 0.15 * dt;
    });
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P.list) {
      const a = Math.sin((p.age / p.life) * Math.PI) * (0.6 + 0.4 * Math.sin(p.age * 18 + p.ph)) * w;
      glow(ctx, p.x, p.y, p.r * (opts.halo || 4), rgb, a * 0.55);
      ctx.fillStyle = `rgba(255,240,200,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}

register({
  // ------------------------------------------------------------- demon
  demon(api) {
    const R = api.rng;
    const victims = [0, 1, 2, 3, 4].map(() => api.look([R.range(-5, 5), R.range(-1.3, 0.4), R.range(3.5, 8)]));
    const keys = [{ t: 0, a: victims[0] }];
    [7.5, 11.5, 15, 19].forEach((s, i) => keys.push({ t: s + R.range(-0.4, 0.4), a: victims[i + 1], d: 0.11 }));
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 3, 3);
        const h = heart(t) * ramp(t, 2, 4) * w;
        mixTheme(th, {
          sclera: [0.6, 0.11, 0.08], veins: 1, veinColor: [0.28, 0, 0], blood: 0.7,
          irisA: [1, 0.85, 0.25], irisB: [0.72, 0.05, 0.0], irisGlow: 1.1, slit: 1,
          skin: [0.15, 0.03, 0.03], glow: 0.35, glowColor: [1, 0.06, 0.02],
          keyColor: [1, 0.45, 0.35], ambient: 0.7, vignette: 1,
        }, w);
        th.glow += h * 0.35;
        th.offset[1] += h * 0.003;
      },
      lids: (t) => ({ upper: 0.3, lower: 0.35, tilt: 0.4, w: api.env(t, 2.5, 2.5) * 0.95 }),
      pupil: (t) => ({ size: 0.42 + heart(t) * 0.12, w: api.env(t, 3, 3) }),
      gaze: (t) => {
        const [yaw, pitch] = keyGaze(keys, t);
        return { yaw, pitch, w: api.env(t - 2.8, 1.2, 2.5) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 3, 3);
        vignette(ctx, W, H, '110,0,0', (0.3 + 0.4 * heart(t) * ramp(t, 2, 4)) * w, 0.28);
      },
    };
  },

  // ---------------------------------------------------------- hellfire
  hellfire(api) {
    const embers = embersFx(api, '255,120,20');
    return {
      theme(th, t) {
        const w = api.env(t, 4, 3.5);
        mixTheme(th, {
          fire: 1, fireA: [0.92, 0.2, 0.02], fireB: [1, 0.72, 0.16], fireIris: 1, irisGlow: 0.6,
          sclera: [0.58, 0.34, 0.22], veins: 0.8, veinColor: [0.45, 0.05, 0], skin: [0.11, 0.03, 0.01],
          glow: 0.65, glowColor: [1, 0.35, 0.05], keyColor: [1, 0.55, 0.25], keyDir: [0.1, -0.6, 0.8],
          slit: 0.55, pupilColor: [0.04, 0, 0], vignette: 0.95,
        }, w);
        th.key *= 1 + 0.18 * fbm1(t * 7, 3) * w;
      },
      lids: (t) => (t < 5
        ? { upper: 0.56, lower: 0.5, tilt: 0, w: pulse(t, 0.2, 1, 3.5, 5) }
        : { upper: 0.32, lower: 0.36, tilt: 0.3, w: api.env(t - 4.5, 1.5, 3) }),
      draw(ctx, t, dt) { embers(ctx, t, dt, api.env(t, 3, 3)); },
    };
  },

  // ---------------------------------------------------------- soulfire
  soulfire(api) {
    const wisps = new Particles(70);
    const L = api.local;
    const embers = embersFx(api, '120,180,255', { rate: 40, rmax: 2.6 });
    return {
      theme(th, t) {
        const w = api.env(t, 3.5, 3);
        mixTheme(th, {
          fire: 0.85, fireA: [0.08, 0.3, 0.95], fireB: [0.55, 0.92, 1], fireIris: 0.75, irisGlow: 1.0,
          irisA: [0.75, 0.95, 1], irisB: [0.1, 0.3, 0.8], sclera: [0.55, 0.64, 0.75], veins: 0.2, veinColor: [0.2, 0.3, 0.6],
          skin: [0.04, 0.06, 0.12], glow: 0.6, glowColor: [0.3, 0.6, 1], keyColor: [0.55, 0.75, 1], keyDir: [0, -0.5, 0.85],
          pupilColor: [0.02, 0.04, 0.1], vignette: 1,
        }, w);
      },
      pupil: (t) => ({ size: 0.3, w: api.env(t, 3, 3) }),
      lids: (t) => ({ upper: 0.48, lower: 0.46, tilt: -0.05, w: api.env(t, 3, 3) * 0.8 }),
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        const w = api.env(t, 3, 3);
        wisps.spawn(9 * w, dt, () => ({ x: L.range(0, W), y: H + 60, r: L.range(30, 80), vy: -L.range(30, 70), age: 0, life: L.range(4, 7), ph: L.range(0, TAU) }));
        wisps.step(dt, (p) => { p.y += p.vy * dt; p.x += Math.sin(p.age * 1.3 + p.ph) * 22 * dt; });
        ctx.globalCompositeOperation = 'lighter';
        for (const p of wisps.list) {
          const a = Math.sin((p.age / p.life) * Math.PI) * 0.16 * w;
          glow(ctx, p.x, p.y, p.r, '110,170,255', a);
          glow(ctx, p.x + Math.sin(p.age * 2 + p.ph) * p.r * 0.5, p.y - p.r * 0.6, p.r * 0.6, '170,220,255', a * 0.8);
        }
        ctx.globalCompositeOperation = 'source-over';
        embers(ctx, t, dt, w);
      },
    };
  },

  // ---------------------------------------------------------- witch brew
  witchbrew(api) {
    const bubbles = new Particles(120);
    const L = api.local;
    const fog = fogSprite('90,200,80');
    return {
      theme(th, t) {
        const w = api.env(t, 3.5, 3);
        mixTheme(th, {
          fire: 0.55, fireA: [0.12, 0.55, 0.04], fireB: [0.65, 1, 0.3], fireIris: 0.35,
          irisA: [0.8, 1, 0.3], irisB: [0.1, 0.42, 0.05], irisGlow: 0.9,
          sclera: [0.72, 0.8, 0.52], veins: 0.65, veinColor: [0.22, 0.38, 0.05],
          skin: [0.05, 0.1, 0.03], glow: 0.55, glowColor: [0.35, 1, 0.2], keyColor: [0.7, 1, 0.6], vignette: 1,
        }, w);
      },
      lids: (t) => ({ upper: 0.26, lower: 0.3, tilt: 0.14, w: api.env(t, 2, 3) * 0.85 }),
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        const w = api.env(t, 3, 3);
        // drifting fog bands near the floor, continuous across screens
        ctx.globalAlpha = 0.85 * w;
        for (let i = 0; i < 9; i++) {
          const X = ((i * 1.37 + t * 0.12) % 7) - 3.5;
          const [sx] = api.wall(X * api.wallHalf / 2.4, 0);
          const sy = H * (0.78 + 0.12 * Math.sin(i * 2.1 + t * 0.3));
          const s = H * (0.9 + 0.3 * Math.sin(i));
          ctx.drawImage(fog, sx - s / 2, sy - s / 3, s, s * 0.6);
        }
        ctx.globalAlpha = 1;
        bubbles.spawn(14 * w, dt, () => ({ x: L.range(0, W), y: H + 20, r: L.range(4, 16), vy: -L.range(50, 120), age: 0, life: L.range(2, 5), ph: L.range(0, TAU) }));
        bubbles.step(dt, (p) => { p.y += p.vy * dt; p.x += Math.sin(p.age * 4 + p.ph) * 12 * dt; });
        for (const p of bubbles.list) {
          const k = p.age / p.life;
          const a = w * (k < 0.92 ? 0.75 : 0.75 * (1 - (k - 0.92) / 0.08));
          if (k > 0.92) {
            ctx.strokeStyle = `rgba(170,255,120,${a})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * (1 + (k - 0.92) * 20), 0, TAU);
            ctx.stroke();
            continue;
          }
          ctx.fillStyle = `rgba(60,160,30,${a * 0.25})`;
          ctx.strokeStyle = `rgba(150,255,110,${a * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = `rgba(230,255,220,${a})`;
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, TAU);
          ctx.fill();
        }
      },
    };
  },

  // ------------------------------------------------------------ frozen
  frozen(api) {
    const crackAt = 15.5;
    let frozenGaze = null;
    let shards = null;
    let cracks = null;
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 1, 2);
        const grow = ramp(t, 0, 9);
        const shatter = ramp(t, crackAt, crackAt + 1.4);
        mixTheme(th, {
          irisA: [0.86, 0.97, 1], irisB: [0.3, 0.56, 0.86], irisGlow: 0.3, sclera: [0.82, 0.9, 1],
          veins: 0.08, veinColor: [0.3, 0.4, 0.7], skin: [0.1, 0.13, 0.2], keyColor: [0.75, 0.88, 1],
          glowColor: [0.5, 0.8, 1], glow: 0.25,
        }, w * grow * (1 - shatter * 0.9));
        th.frost = grow * (1 - shatter) * w;
        const shiver = pulse(t, crackAt + 0.2, crackAt + 0.4, crackAt + 2.4, crackAt + 3.4);
        th.offset[0] += noise1(t * 40, 3) * 0.006 * shiver;
        th.offset[1] += noise1(t * 40, 9) * 0.004 * shiver;
      },
      gaze(t) {
        if (t > 6 && !frozenGaze) frozenGaze = api.anim.gaze.slice();
        if (!frozenGaze) return null;
        return { yaw: frozenGaze[0], pitch: frozenGaze[1], w: ramp(t, 6, 8.5) * (1 - ramp(t, crackAt, crackAt + 0.12)) };
      },
      pupil: (t) => ({ size: 0.24, w: ramp(t, 2, 8) * (1 - ramp(t, crackAt, crackAt + 1)) }),
      lids: (t) => ({ upper: 0.58, lower: 0.5, tilt: -0.05, w: pulse(t, crackAt, crackAt + 0.15, crackAt + 2, crackAt + 3.5) }),
      blink: (t) => blinkAt(t, crackAt + 0.5, 0.25),
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        if (t < crackAt - 0.05) return;
        if (!cracks) {
          const L = api.local;
          cracks = [];
          const cx = W * L.range(0.3, 0.7), cy = H * L.range(0.3, 0.7);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * TAU + L.range(-0.2, 0.2);
            const len = Math.hypot(W, H) * L.range(0.3, 0.7);
            cracks.push(boltPoints(L.next, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, 0.18, 5));
          }
          shards = Array.from({ length: 40 }, () => ({
            x: L.range(0, W), y: L.range(0, H), vx: L.range(-80, 80), vy: L.range(-200, 0), r: L.range(6, 22),
            rot: L.range(0, TAU), vr: L.range(-6, 6), sides: L.int(3, 4),
          }));
        }
        const k = t - crackAt;
        const a = clamp(1 - k / 1.6);
        flash(ctx, W, H, '220,240,255', 0.6 * clamp(1 - k / 0.3));
        ctx.strokeStyle = `rgba(230,245,255,${a})`;
        ctx.lineWidth = 2;
        for (const c of cracks) {
          ctx.beginPath();
          c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        }
        for (const s of shards) {
          s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.fillStyle = `rgba(200,230,255,${a * 0.7})`;
          ctx.beginPath();
          for (let i = 0; i < s.sides; i++) {
            const ang = (i / s.sides) * TAU;
            ctx.lineTo(Math.cos(ang) * s.r, Math.sin(ang) * s.r * 0.6);
          }
          ctx.fill();
          ctx.restore();
        }
      },
    };
  },

  // ------------------------------------------------------------- storm
  storm(api) {
    const R = api.rng;
    const strikes = [];
    let tt = R.range(2.2, 3.5);
    while (tt < api.dur - 3.5) {
      const X = R.range(-api.wallHalf * 0.92, api.wallHalf * 0.92);
      const main = boltPoints(R.next, X + R.range(-0.3, 0.3), 0.62, X + R.range(-0.5, 0.5), -0.62, 0.32, 6);
      const branches = [];
      for (let b = 0; b < 3; b++) {
        const p = main[R.int(8, main.length - 20)];
        branches.push(boltPoints(R.next, p[0], p[1], p[0] + R.range(-0.6, 0.6), p[1] - R.range(0.2, 0.5), 0.35, 4));
      }
      strikes.push({ t: tt, X, main, branches, double: R.chance(0.6) });
      tt += R.range(2.0, 3.6);
    }
    const times = strikes.map((s) => s.t);
    const flashAmt = (t) => {
      let f = 0;
      for (const s of strikes) {
        const d = t - s.t;
        if (d >= 0) f += Math.exp(-d * 9) + (s.double && d > 0.13 ? 0.7 * Math.exp(-(d - 0.13) * 11) : 0);
      }
      return Math.min(1.4, f);
    };
    const rain = new Particles(400);
    const L = api.local;
    return {
      theme(th, t) {
        const w = api.env(t, 2, 2);
        mixTheme(th, { ambient: 0.5, key: 0.5, keyColor: [0.6, 0.7, 0.92], skin: [0.1, 0.1, 0.13], vignette: 1, sclera: [0.8, 0.82, 0.85] }, w);
        const f = flashAmt(t) * w;
        th.key += f * 2.2;
        th.ambient += f * 1.4;
        th.keyColor = th.keyColor.map((c) => lerp(c, 1, clamp(f)));
      },
      pupil: (t) => ({ size: 0.16, w: Math.exp(-since(times, t) * 0.9) }),
      lids: (t) => ({ upper: 0.58, lower: 0.5, tilt: -0.05, w: Math.exp(-since(times, t) * 0.7) * 0.9 }),
      blink: (t) => Math.max(...strikes.map((s) => blinkAt(t, s.t + 0.55, 0.22))),
      gaze(t) {
        const s = strikes.filter((x) => t >= x.t + 0.08).pop();
        if (!s) return null;
        const [yaw, pitch] = api.lookWall(s.X, 0.15, 1.6);
        return { yaw, pitch, w: clamp((t - s.t - 0.08) / 0.12) * Math.exp(-Math.max(0, t - s.t - 1.4) * 1.5) };
      },
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        const w = api.env(t, 2, 2);
        rain.spawn(320 * w, dt, () => ({ x: L.range(-0.2, 1.1) * W, y: -20, v: L.range(900, 1400), len: L.range(14, 30), age: 0, life: 2 }));
        rain.step(dt, (p) => { p.y += p.v * dt; p.x += p.v * 0.18 * dt; return p.y < H + 40; });
        ctx.strokeStyle = `rgba(170,190,230,${0.28 * w})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const p of rain.list) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.len * 0.18, p.y - p.len); }
        ctx.stroke();
        for (const s of strikes) {
          const d = t - s.t;
          if (d < 0 || d > 0.45) continue;
          const a = (d < 0.06 ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(d * 60))) * (1 - d / 0.45);
          const map = (pts) => pts.map(([X, Y]) => api.wall(X, Y));
          drawBolt(ctx, map(s.main), Math.max(2, H * 0.004), a);
          for (const b of s.branches) drawBolt(ctx, map(b), Math.max(1, H * 0.0022), a * 0.8);
        }
        flash(ctx, W, H, '220,230,255', flashAmt(t) * 0.33 * w);
      },
    };
  },

  // ---------------------------------------------------------- overload
  overload(api) {
    const R = api.rng;
    const bursts = [];
    for (let t = R.range(1, 2); t < api.dur - 1.5; t += R.range(0.9, 2.2)) bursts.push({ t, d: R.range(0.25, 0.8) });
    const burst = (t) => bursts.reduce((m, b) => Math.max(m, pulse(t, b.t, b.t + 0.04, b.t + b.d, b.t + b.d + 0.15)), 0);
    const bridgeAt = R.range(5.5, 7);
    const sparks = new Particles(220);
    const L = api.local;
    let arcs = [];
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 1.5, 2);
        const b = burst(t) * w;
        mixTheme(th, {
          electric: 0.6, irisA: [0.75, 0.95, 1], irisB: [0.15, 0.35, 0.85], irisGlow: 1.3, glow: 0.35,
          glowColor: [0.4, 0.7, 1], keyColor: [0.7, 0.85, 1], sclera: [0.8, 0.86, 0.95], skin: [0.06, 0.07, 0.1],
        }, w);
        th.electric += b * 0.6;
        th.glow += b * 0.6;
        th.offset[0] += noise1(t * 50, 5) * 0.008 * b;
        th.offset[1] += noise1(t * 50, 8) * 0.006 * b;
        if (b > 0.3 && noise1(t * 30, 2) > 0.55) th.fade = 0.55;
      },
      gaze(t) {
        const k = Math.floor(t * 3.3);
        const r = makeRng(api.seed + k * 7919 + api.idx * 31);
        return { yaw: r.range(-0.5, 0.5), pitch: r.range(-0.3, 0.3), w: burst(t) * api.env(t, 1, 1) };
      },
      pupil: (t) => ({ size: 0.15 + 0.4 * (noise1(t * 12, 4) * 0.5 + 0.5), w: burst(t) }),
      lids: (t) => ({ upper: 0.56, lower: 0.5, tilt: 0, w: api.env(t, 0.5, 1.5) * 0.85 }),
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        const w = api.env(t, 1.5, 2);
        const b = burst(t) * w;
        const [cx, cy] = api.eyePoint(0, 0);
        const rx = api.view.eyeScale * H;
        if (b > 0.2 && L.chance(dt * 25)) {
          const a = L.range(0, TAU);
          const sx = cx + Math.cos(a) * rx * 0.95, sy = cy + Math.sin(a) * rx * 0.45;
          const ex = cx + Math.cos(a) * W * 0.8, ey = cy + Math.sin(a) * H * 0.8;
          arcs.push({ pts: boltPoints(L.next, sx, sy, ex, ey, 0.28, 5), age: 0, life: L.range(0.08, 0.2) });
          for (let i = 0; i < 8; i++) sparks.list.push({ x: sx, y: sy, vx: L.range(-300, 300), vy: L.range(-350, 100), age: 0, life: L.range(0.4, 1) });
        }
        arcs = arcs.filter((a) => (a.age += dt) < a.life);
        for (const a of arcs) drawBolt(ctx, a.pts, 2, 1 - a.age / a.life, '120,170,255');
        sparks.step(dt, (p) => { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; });
        ctx.fillStyle = '#cfe6ff';
        for (const p of sparks.list) { ctx.globalAlpha = 1 - p.age / p.life; ctx.fillRect(p.x, p.y, 2.5, 2.5); }
        ctx.globalAlpha = 1;
        // the big arc jumps between all three monitors
        const d = t - bridgeAt;
        if (d > 0 && d < 1.1) {
          const k = Math.floor(t * 18);
          const r = makeRng(api.seed + k);
          const pts = [];
          const xs = [api.eyeXOf('L'), api.eyeXOf('C'), api.eyeXOf('R')];
          for (let i = 0; i < 2; i++) pts.push(...boltPoints(r.next, xs[i], 0, xs[i + 1], 0, 0.25, 6));
          drawBolt(ctx, pts.map(([X, Y]) => api.wall(X, Y)), Math.max(2.5, H * 0.005), (1 - d / 1.1) * (0.6 + 0.4 * Math.sin(t * 70)));
          flash(ctx, W, H, '180,210,255', 0.25 * (1 - d / 1.1));
        }
      },
    };
  },

  // --------------------------------------------------------------- fog
  fog(api) {
    const R = api.rng;
    const tint = R.pick(['190,205,195', '200,200,210', '150,200,160', '170,175,225']);
    const sprite = fogSprite(tint);
    const span = api.wallHalf + 1.5;
    const blobs = Array.from({ length: 26 }, () => ({
      x0: R.range(-span, span), y: R.range(-0.62, 0.55), s: R.range(0.6, 1.4), v: R.range(0.06, 0.2), a: R.range(0.2, 0.55),
    }));
    const dir = R.sign();
    const walkT0 = 6, walkT1 = 21;
    const figX = (t) => -dir * (api.wallHalf + 0.4) + dir * (2 * api.wallHalf + 0.8) * clamp((t - walkT0) / (walkT1 - walkT0));
    return {
      theme(th, t) {
        mixTheme(th, { key: 0.65, ambient: 0.7, keyColor: [0.78, 0.85, 0.9], vignette: 1 }, api.env(t, 3, 3));
      },
      lids: (t) => ({ upper: 0.28, lower: 0.34, tilt: 0.08, w: api.env(t, 3, 3) * 0.75 }),
      gaze(t) {
        if (t < walkT0 + 1 || t > walkT1) return null;
        const [yaw, pitch] = api.lookWall(figX(t), 0.15, 1.6);
        return { yaw, pitch, w: pulse(t, walkT0 + 1, walkT0 + 1.4, walkT1 - 1.5, walkT1) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 4, 4);
        // the figure walking through the fog
        if (t > walkT0 && t < walkT1) {
          const [sx, sy] = api.wall(figX(t), -0.05);
          if (sx > -H && sx < W + H) {
            const h = H * 0.95;
            const bob = Math.abs(Math.sin(t * 3.2)) * h * 0.012;
            ctx.save();
            ctx.globalAlpha = 0.82 * w;
            ctx.fillStyle = '#050507';
            ctx.filter = 'blur(3px)';
            ctx.beginPath();
            ctx.ellipse(sx, sy - h * 0.36 - bob, h * 0.055, h * 0.07, 0, 0, TAU);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(sx - h * 0.1, sy - h * 0.26 - bob);
            ctx.quadraticCurveTo(sx, sy - h * 0.31 - bob, sx + h * 0.1, sy - h * 0.26 - bob);
            ctx.lineTo(sx + h * 0.14, sy + h * 0.55);
            ctx.lineTo(sx - h * 0.14, sy + h * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'lighter';
            const look = dir * h * 0.012;
            glow(ctx, sx - h * 0.018 + look, sy - h * 0.37 - bob, h * 0.012, '255,240,200', 0.9 * w);
            glow(ctx, sx + h * 0.018 + look, sy - h * 0.37 - bob, h * 0.012, '255,240,200', 0.9 * w);
            ctx.restore();
          }
        }
        for (const b of blobs) {
          let X = b.x0 + b.v * t;
          X = ((X + span) % (2 * span) + 2 * span) % (2 * span) - span;
          const [sx, sy] = api.wall(X, b.y);
          const s = b.s * H;
          if (sx < -s || sx > W + s) continue;
          ctx.globalAlpha = b.a * w;
          ctx.drawImage(sprite, sx - s, sy - s * 0.5, s * 2, s);
        }
        ctx.globalAlpha = 1;
      },
    };
  },
});
