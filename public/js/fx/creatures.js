// Creature specials: cat, undead, bats, spider, ghost, tentacles, werewolf,
// and the things that blink back at you in the dark.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, noise1, fbm1, keyGaze, blinkAt, makeRng, smooth } from '../util.js';
import { glow, vignette, flash, drawBat, drawSpider, drawGhost, drawGlowEyes, fogSprite } from './draw.js';

// Smoothly follow a moving target with a little lag, like real pursuit.
function follower(rate = 9) {
  let cur = null;
  return (target, dt) => {
    if (!cur) cur = target.slice();
    const k = 1 - Math.exp(-rate * Math.min(dt, 0.1));
    cur[0] += (target[0] - cur[0]) * k;
    cur[1] += (target[1] - cur[1]) * k;
    return cur;
  };
}

register({
  // --------------------------------------------------------------- cat
  cat(api) {
    const R = api.rng;
    const blinks = [];
    for (let t = R.range(1.5, 3); t < api.dur - 1; t += R.range(2.8, 4.8)) blinks.push(t);
    // laser dot: hops between wall points, sometimes jittering
    const pts = [];
    let tt = 7;
    let X = R.range(-api.wallHalf * 0.8, api.wallHalf * 0.8), Y = R.range(-0.35, 0.35);
    pts.push({ t: tt, X, Y });
    while (tt < api.dur - 4) {
      tt += R.range(0.35, 1.1);
      X = clamp(X + R.range(-2.2, 2.2), -api.wallHalf * 0.9, api.wallHalf * 0.9);
      Y = R.range(-0.4, 0.4);
      pts.push({ t: tt, X, Y, d: R.range(0.12, 0.3) });
    }
    const laserEnd = tt + 0.6;
    const laser = (t) => {
      let p = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const q = pts[i];
        if (t < q.t) break;
        const u = smooth((t - q.t) / q.d);
        if (u < 1) return [lerp(p.X, q.X, u), lerp(p.Y, q.Y, u)];
        p = q;
      }
      return [p.X + noise1(t * 7, 2) * 0.02, p.Y + noise1(t * 7, 5) * 0.02];
    };
    const follow = follower(14);
    let last = 0;
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 2.5, 2.5);
        mixTheme(th, {
          irisA: [0.88, 0.97, 0.28], irisB: [0.3, 0.58, 0.04], irisGlow: 0.55, slit: 1, sclera: [0.84, 0.82, 0.6],
          skin: [0.06, 0.05, 0.05], glow: 0.12, glowColor: [0.6, 1, 0.3], veins: 0.08,
        }, w);
        let m = 0;
        for (const b of blinks) m = Math.max(m, pulse(t, b, b + 0.22, b + 0.3, b + 0.6));
        th.membrane = m * w;
      },
      pupil: (t) => ({ size: t > 6.5 && t < laserEnd ? 0.78 : 0.42, w: api.env(t, 2, 2) }),
      lids: (t) => ({ upper: t > 6.5 && t < laserEnd ? 0.5 : 0.32, lower: 0.4, tilt: 0.05, w: api.env(t, 2, 2) * 0.85 }),
      gaze(t) {
        if (t < 7 || t > laserEnd + 0.5) return null;
        const dt = t - last; last = t;
        const [X, Y] = laser(t);
        const a = follow(api.lookWall(X, Y, 1.0), dt);
        return { yaw: a[0], pitch: a[1], w: pulse(t, 7, 7.3, laserEnd, laserEnd + 0.5) };
      },
      draw(ctx, t) {
        if (t < 7 || t > laserEnd) return;
        const [X, Y] = laser(t);
        const [x, y] = api.wall(X, Y);
        const { H } = api.view;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, H * 0.05, '255,20,20', 0.55);
        glow(ctx, x, y, H * 0.012, '255,200,200', 1);
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },

  // ------------------------------------------------------------ undead
  undead(api) {
    const R = api.rng;
    const my = makeRng((api.seed + (api.idx + 5) * 7777) >>> 0);
    const droop = my.range(0.2, 0.3), tilt = my.range(-0.15, 0.15), drift = api.idx * 0.12 + my.range(-0.05, 0.05);
    const blinks = [];
    for (let t = my.range(2, 3.5); t < api.dur - 1; t += my.range(2.5, 4.5)) blinks.push(t);
    const flies = Array.from({ length: 3 }, (_, i) => ({ ph: my.range(0, TAU), r: my.range(0.08, 0.2), sp: my.range(2, 3.5), cx: my.range(-0.5, 0.5), cy: my.range(-0.3, 0.3) }));
    return {
      theme(th, t) {
        const w = api.env(t, 3, 3);
        mixTheme(th, {
          milky: 0.85, sclera: [0.74, 0.72, 0.55], veins: 0.75, veinColor: [0.36, 0.26, 0.12],
          irisA: [0.6, 0.62, 0.58], irisB: [0.3, 0.33, 0.3], skin: [0.11, 0.13, 0.08], keyColor: [0.78, 0.88, 0.7],
          glow: 0.1, glowColor: [0.4, 0.8, 0.3], vignette: 1, irisGlow: 0,
        }, w);
      },
      gaze(t) {
        const s = api.seed % 1000 + api.idx * 37;
        const lurch = Math.floor(t / 3.7);
        const lr = makeRng(s + lurch);
        const yaw = 0.3 * fbm1(t * 0.18, s) + drift + lr.range(-0.12, 0.12);
        const pitch = -0.12 + 0.14 * fbm1(t * 0.15, s + 9);
        return { yaw, pitch, w: api.env(t, 3, 3) };
      },
      lids: (t) => ({ upper: droop, lower: 0.47, tilt, w: api.env(t, 3, 3) }),
      blink: (t) => Math.max(...blinks.map((b) => blinkAt(t, b, 0.9, 0.15) * 0.75), 0),
      pupil: (t) => ({ size: 0.3, w: api.env(t, 3, 3) }),
      draw(ctx, t) {
        const { H } = api.view;
        const w = api.env(t, 3, 3);
        const [cx, cy] = api.eyePoint(0, 0);
        for (const f of flies) {
          const a = t * f.sp + f.ph;
          const x = cx + (f.cx + Math.sin(a) * f.r * 2.4) * H, y = cy + (f.cy + Math.sin(a * 2) * f.r) * H;
          ctx.fillStyle = `rgba(10,10,10,${0.9 * w})`;
          ctx.beginPath(); ctx.ellipse(x, y, H * 0.006, H * 0.004, a, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(200,210,220,${0.35 * w})`;
          const fl = Math.sin(t * 90) * H * 0.004;
          ctx.beginPath(); ctx.ellipse(x - H * 0.003, y - H * 0.004 - fl * 0.3, H * 0.005, H * 0.0025 + Math.abs(fl) * 0.3, -0.5, 0, TAU); ctx.fill();
        }
      },
    };
  },

  // -------------------------------------------------------------- bats
  bats(api) {
    const R = api.rng;
    const dir = R.sign();
    const n = R.int(14, 22);
    const half = api.wallHalf + 0.4;
    const bats = Array.from({ length: n }, () => ({
      t0: R.range(0.3, 7.5), v: R.range(1.0, 2.0), y0: R.range(-0.35, 0.35), amp: R.range(0.04, 0.16),
      fq: R.range(1, 2.6), s: R.range(0.05, 0.11), fr: R.range(7, 11), ph: R.range(0, TAU), swoop: R.chance(0.22),
    }));
    const pos = (b, t) => {
      const d = t - b.t0;
      if (d < 0) return null;
      const X = -dir * half + dir * b.v * d;
      if (Math.abs(X) > half) return null;
      const u = (X * dir + half) / (2 * half);
      const sw = b.swoop ? pulse(u, 0.35, 0.5, 0.55, 0.75) : 0;
      return { X, Y: b.y0 + b.amp * Math.sin(b.fq * d + b.ph) - sw * 0.1, s: b.s * (1 + sw * 3.5), u };
    };
    const follow = follower(10);
    let last = 0;
    return {
      theme(th, t) {
        mixTheme(th, { ambient: 0.75, key: 0.8, keyColor: [0.72, 0.78, 1] }, api.env(t, 1.5, 2));
      },
      lids: (t) => ({ upper: 0.58, lower: 0.5, tilt: -0.05, w: api.env(t, 0.6, 2) * 0.9 }),
      pupil: (t) => ({ size: 0.24, w: api.env(t, 0.6, 2) }),
      gaze(t) {
        const dt = t - last; last = t;
        let best = null, bd = Infinity;
        for (const b of bats) {
          const p = pos(b, t);
          if (!p) continue;
          const d = Math.abs(p.X - api.geo.eyeX) - p.s * 2;
          if (d < bd) { bd = d; best = p; }
        }
        if (!best) return null;
        const a = follow(api.lookWall(best.X, best.Y, 1.1), dt);
        return { yaw: a[0], pitch: a[1], w: api.env(t, 0.8, 1.5) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        for (const b of bats) {
          const p = pos(b, t);
          if (!p) continue;
          const [x, y] = api.wall(p.X, p.Y);
          const s = p.s * H;
          if (x < -s || x > W + s) continue;
          drawBat(ctx, x, y, s, Math.sin(t * b.fr + b.ph), Math.sin(t * 2 + b.ph) * 0.15 + dir * 0.08);
        }
      },
    };
  },

  // ------------------------------------------------------------ spider
  spider(api) {
    const R = api.rng;
    const home = R.pick(['L', 'C', 'R']);
    const SX = api.eyeXOf(home) + R.range(-0.45, 0.45);
    const descend = (t) => {
      if (t < 0.5) return 0.75;
      if (t < 5.5) { const u = (t - 0.5) / 5; return lerp(0.75, 0.06, 1 - Math.pow(1 - u, 3)) + Math.sin(u * 14) * 0.02 * (1 - u); }
      if (t < 10) return 0.06 + Math.sin((t - 5.5) * 2.2) * 0.015;
      return lerp(0.06, 0.8, smooth((t - 10) / 1.2));
    };
    const swing = (t) => Math.sin(t * 1.4) * 0.03 * pulse(t, 4, 6, 9.5, 10.5);
    const dir = R.sign();
    const half = api.wallHalf + 0.3;
    const minis = Array.from({ length: R.int(12, 18) }, () => ({
      t0: R.range(12, 15.5), v: R.range(0.9, 1.7), Y: R.range(-0.46, -0.22), s: R.range(0.012, 0.022), ph: R.range(0, TAU),
    }));
    const miniPos = (m, t) => {
      const d = t - m.t0;
      if (d < 0) return null;
      const X = -dir * half + dir * m.v * d + Math.sin(d * 3 + m.ph) * 0.05;
      return Math.abs(X) > half ? null : { X, Y: m.Y + Math.sin(d * 5 + m.ph) * 0.01 };
    };
    const follow = follower(8);
    let last = 0;
    return {
      lids: (t) => (t < 12
        ? { upper: t > 5.5 && t < 10 ? 0.3 : 0.58, lower: t > 5.5 && t < 10 ? 0.34 : 0.5, tilt: t > 5.5 && t < 10 ? 0.12 : -0.05, w: api.env(t, 1, 2) * 0.85 }
        : { upper: 0.58, lower: 0.5, tilt: -0.05, w: api.env(t, 1, 2) * 0.85 }),
      pupil: (t) => ({ size: 0.22, w: api.env(t, 1, 2) }),
      gaze(t) {
        const dt = t - last; last = t;
        let target = null;
        if (t > 0.8 && t < 11.2) target = api.lookWall(SX + swing(t), descend(t), 0.9);
        else if (t > 12) {
          let bd = Infinity;
          for (const m of minis) {
            const p = miniPos(m, t);
            if (!p) continue;
            const d = Math.abs(p.X - api.geo.eyeX);
            if (d < bd) { bd = d; target = api.lookWall(p.X, p.Y, 1.1); }
          }
        }
        if (!target) return null;
        const a = follow(target, dt);
        return { yaw: a[0], pitch: a[1], w: api.env(t, 1, 1.5) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        if (t < 11.5) {
          const X = SX + swing(t), Y = descend(t);
          const [x, y] = api.wall(X, Y);
          const [tx] = api.wall(SX, 0.5);
          if (x > -H * 0.2 && x < W + H * 0.2) {
            ctx.strokeStyle = 'rgba(220,220,230,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx, -5);
            ctx.lineTo(x, y);
            ctx.stroke();
            const dangle = pulse(t, 4.5, 5.5, 10, 10.5);
            drawSpider(ctx, x, y + H * 0.04, H * 0.06, t * 9, dangle * 0.6 + 0.2, Math.PI + swing(t) * 2);
          }
        }
        for (const m of minis) {
          const p = miniPos(m, t);
          if (!p) continue;
          const [x, y] = api.wall(p.X, p.Y);
          if (x < -40 || x > W + 40) continue;
          drawSpider(ctx, x, y, m.s * H, t * 22 + m.ph, 0, dir * Math.PI / 2);
        }
      },
    };
  },

  // ------------------------------------------------------------- ghost
  ghost(api) {
    const R = api.rng;
    const dir = R.sign();
    const half = api.wallHalf + 0.7;
    const stopX = api.eyeXOf(R.pick(['L', 'C', 'R'])) + R.range(-0.25, 0.25);
    const boo = 7.4;
    const X = (t) => {
      if (t < 6) return lerp(-dir * half, stopX, smooth((t - 0.5) / 5.5));
      if (t < 8.6) return stopX + Math.sin((t - 6) * 2) * 0.03;
      return lerp(stopX, dir * half, smooth((t - 8.6) / 6));
    };
    const Y = (t) => 0.06 + 0.07 * Math.sin(t * 1.3);
    const follow = follower(6);
    let last = 0;
    return {
      theme(th, t) {
        mixTheme(th, { keyColor: [0.72, 0.86, 1], glowColor: [0.6, 0.8, 1], glow: 0.18, sclera: [0.84, 0.9, 0.97], ambient: 0.85 }, api.env(t, 2, 3));
      },
      lids: (t) => ({ upper: 0.6, lower: 0.52, tilt: -0.08, w: Math.max(api.env(t, 1, 2) * 0.6, pulse(t, boo - 0.1, boo, 9, 10.5)) }),
      pupil: (t) => ({ size: 0.18, w: pulse(t, boo - 0.1, boo, 9.5, 11) }),
      blink: (t) => blinkAt(t, boo + 1.1, 0.3),
      gaze(t) {
        const dt = t - last; last = t;
        const a = follow(api.lookWall(X(t), Y(t), 1.3), dt);
        return { yaw: a[0], pitch: a[1], w: api.env(t, 1.5, 2) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        const [x, y] = api.wall(X(t), Y(t));
        const lunge = pulse(t, boo - 0.2, boo, boo + 0.6, boo + 1.2);
        const s = H * (0.16 + 0.07 * lunge);
        if (x < -s * 3 || x > W + s * 3) return;
        const alpha = api.env(t, 1, 1.5) * (0.72 + 0.15 * Math.sin(t * 7));
        drawGhost(ctx, x, y, s, t, alpha, 0.2 + 0.8 * lunge, t < 6 ? dir : t > 8.6 ? dir : 0);
      },
    };
  },

  // --------------------------------------------------------- tentacles
  tentacles(api) {
    const my = makeRng((api.seed + (api.idx + 3) * 4241) >>> 0);
    const nT = my.int(3, 5);
    const tents = Array.from({ length: nT }, (_, i) => {
      const side = my.pick(['bottom', 'bottom', 'left', 'right']);
      return {
        side, u: (i + my.range(0.2, 0.8)) / nT, len: my.range(0.55, 0.9), thick: my.range(0.05, 0.08),
        ph: my.range(0, TAU), sp: my.range(0.6, 1.2), curl: my.range(1.2, 2.4) * my.sign(), delay: my.range(0.5, 4),
      };
    });
    const N = 26;
    return {
      theme(th, t) {
        mixTheme(th, {
          bar: 1, irisA: [0.95, 0.78, 0.35], irisB: [0.45, 0.3, 0.1], sclera: [0.78, 0.82, 0.7], skin: [0.05, 0.08, 0.09],
          keyColor: [0.5, 0.85, 0.85], glow: 0.2, glowColor: [0.2, 0.8, 0.7], veins: 0.4, veinColor: [0.2, 0.3, 0.35],
        }, api.env(t, 2.5, 3));
      },
      lids: (t) => ({ upper: 0.5, lower: 0.46, tilt: 0, w: api.env(t, 2, 3) * 0.6 }),
      draw(ctx, t) {
        const { W, H } = api.view;
        for (const k of tents) {
          const grow = ramp(t, k.delay, k.delay + 3.2) * (1 - ramp(t, api.dur - 4, api.dur - 1));
          if (grow <= 0.01) continue;
          let x, y, a;
          if (k.side === 'bottom') { x = k.u * W; y = H + 10; a = -Math.PI / 2; }
          else if (k.side === 'left') { x = -10; y = H * (0.4 + k.u * 0.6); a = -0.3; }
          else { x = W + 10; y = H * (0.4 + k.u * 0.6); a = Math.PI + 0.3; }
          const L = k.len * H * grow;
          const pts = [[x, y]];
          for (let i = 1; i <= N; i++) {
            const s = i / N;
            a += (k.curl * s * s * Math.sin(t * k.sp + k.ph) + 0.9 * s * Math.sin(t * k.sp * 1.6 + s * 4 + k.ph)) / N * 2.2;
            x += Math.cos(a) * L / N;
            y += Math.sin(a) * L / N;
            pts.push([x, y]);
          }
          const left = [], right = [];
          for (let i = 0; i <= N; i++) {
            const [px, py] = pts[i];
            const [qx, qy] = pts[Math.min(N, i + 1)];
            const [rx, ry] = pts[Math.max(0, i - 1)];
            let nx = -(qy - ry), ny = qx - rx;
            const l = Math.hypot(nx, ny) || 1;
            nx /= l; ny /= l;
            const w = k.thick * H * Math.pow(1 - i / N, 0.85) * (0.6 + 0.4 * grow) + 1;
            left.push([px + nx * w, py + ny * w, nx, ny, w]);
            right.push([px - nx * w, py - ny * w]);
          }
          const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[N][0], pts[N][1]);
          g.addColorStop(0, '#2a0e22');
          g.addColorStop(0.6, '#5a1f3f');
          g.addColorStop(1, '#8a3a5c');
          ctx.fillStyle = g;
          ctx.beginPath();
          left.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(230,150,190,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          left.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
          for (let i = 2; i < N - 2; i += 2) {
            const [, , nx, ny, w] = left[i];
            const [px, py] = pts[i];
            ctx.fillStyle = 'rgba(240,190,210,0.55)';
            ctx.beginPath();
            ctx.ellipse(px - nx * w * 0.55, py - ny * w * 0.55, w * 0.28, w * 0.2, Math.atan2(ny, nx), 0, TAU);
            ctx.fill();
          }
        }
      },
    };
  },

  // ---------------------------------------------------------- werewolf
  werewolf(api) {
    const R = api.rng;
    const stars = Array.from({ length: 160 }, () => [R.range(-api.wallHalf, api.wallHalf), R.range(-0.5, 0.5), R.range(0.5, 2), R.range(0, TAU)]);
    const clouds = Array.from({ length: 10 }, () => ({ X: R.range(-api.wallHalf - 1, api.wallHalf), Y: R.range(0.05, 0.45), s: R.range(0.5, 1.1), v: R.range(0.05, 0.12) }));
    const moonX = api.eyeXOf('C') + R.range(-0.5, 0.5);
    const moonY = (t) => lerp(-0.75, 0.22, smooth(t / 7));
    const turn = 6.5, slash = 13;
    const slashX0 = -api.wallHalf + 0.3;
    const cloudSprite = fogSprite('60,64,80');
    return {
      theme(th, t) {
        const w = api.env(t, 2.5, 3);
        const tr = ramp(t, turn, turn + 1.2);
        mixTheme(th, { skinAlpha: 0.12, keyColor: [0.75, 0.8, 1], ambient: 0.8, vignette: 0.6 }, w);
        mixTheme(th, {
          irisA: [1, 0.84, 0.25], irisB: [0.62, 0.28, 0.02], irisGlow: 0.8, slit: 0.7, veins: 0.6,
          glow: 0.3, glowColor: [1, 0.6, 0.1],
        }, w * tr);
        const shake = pulse(t, turn, turn + 0.2, turn + 1.2, turn + 1.6);
        th.offset[0] += noise1(t * 30, 4) * 0.01 * shake;
        th.offset[1] += noise1(t * 30, 6) * 0.007 * shake;
      },
      gaze(t) {
        if (t < turn) {
          const [yaw, pitch] = api.lookWall(moonX, moonY(t), 1.4);
          return { yaw, pitch, w: api.env(t, 2, 1) * (1 - ramp(t, turn - 0.5, turn)) };
        }
        return null;
      },
      lids: (t) => (t < turn ? { upper: 0.5, lower: 0.46, tilt: 0, w: api.env(t, 2, 2) * 0.7 } : { upper: 0.3, lower: 0.34, tilt: 0.4, w: api.env(t - turn, 0.6, 3) }),
      pupil: (t) => ({ size: t < turn ? 0.6 : 0.4, w: api.env(t, 2, 2) }),
      drawBg(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 2.5, 3);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `rgba(10,16,40,${w})`);
        g.addColorStop(1, `rgba(2,3,8,${w})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        for (const [X, Y, r, ph] of stars) {
          const [x, y] = api.wall(X, Y);
          if (x < 0 || x > W) continue;
          ctx.fillStyle = `rgba(255,255,255,${w * (0.5 + 0.5 * Math.sin(t * 2 + ph))})`;
          ctx.fillRect(x, y, r, r);
        }
        const [mx, my] = api.wall(moonX, moonY(t));
        const mr = H * 0.17;
        glow(ctx, mx, my, mr * 3, '200,210,255', 0.25 * w);
        const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
        mg.addColorStop(0, `rgba(255,252,235,${w})`);
        mg.addColorStop(1, `rgba(215,212,190,${w})`);
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(150,145,130,${0.35 * w})`;
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.25], [-0.1, 0.4, 0.12], [0.4, -0.35, 0.1]]) {
          ctx.beginPath(); ctx.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, TAU); ctx.fill();
        }
        for (const c of clouds) {
          const X = ((c.X + c.v * t + api.wallHalf + 1) % (2 * api.wallHalf + 2)) - api.wallHalf - 1;
          const [x, y] = api.wall(X, c.Y);
          const s = c.s * H;
          ctx.globalAlpha = 0.9 * w;
          ctx.drawImage(cloudSprite, x - s, y - s * 0.4, s * 2, s * 0.8);
        }
        ctx.globalAlpha = 1;
      },
      draw(ctx, t) {
        const d = t - slash;
        if (d < 0 || d > 4.5) return;
        const { H } = api.view;
        const a = 1 - ramp(d, 2.5, 4.5);
        const prog = clamp(d / 0.45);
        for (let i = 0; i < 3; i++) {
          const x0 = slashX0 + i * 0.3, y0 = 0.62 - i * 0.05;
          const x1 = x0 + 2 * api.wallHalf - 0.4, y1 = -0.62 - i * 0.05;
          const N = 60;
          const top = [], bot = [];
          for (let k = 0; k <= N; k++) {
            const s = (k / N) * prog;
            const X = lerp(x0, x1, s), Y = lerp(y0, y1, s);
            const [px, py] = api.wall(X, Y);
            const [qx, qy] = api.wall(lerp(x0, x1, s + 0.001), lerp(y0, y1, s + 0.001));
            const len = Math.hypot(qx - px, qy - py) || 1;
            const nx = -(qy - py) / len, ny = (qx - px) / len;
            const wd = H * 0.034 * Math.pow(Math.sin(Math.PI * (k / N) * 0.999 + 0.0005), 0.6) * (1 + 0.35 * noise1(s * 40, i));
            top.push([px + nx * wd, py + ny * wd]);
            bot.push([px - nx * wd * 0.7, py - ny * wd * 0.7]);
          }
          const poly = (scale, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            top.forEach(([x, y], k) => {
              const [bx, by] = bot[k];
              const mx = (x + bx) / 2, my = (y + by) / 2;
              const px = mx + (x - mx) * scale, py = my + (y - my) * scale;
              k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            });
            for (let k = bot.length - 1; k >= 0; k--) {
              const [x, y] = bot[k];
              const [tx, ty] = top[k];
              const mx = (x + tx) / 2, my = (y + ty) / 2;
              ctx.lineTo(mx + (x - mx) * scale, my + (y - my) * scale);
            }
            ctx.closePath();
            ctx.fill();
          };
          poly(1.0, `rgba(150,20,10,${0.9 * a})`);
          poly(0.65, `rgba(45,0,0,${0.95 * a})`);
          poly(0.25, `rgba(0,0,0,${a})`);
        }
      },
    };
  },

  // ---------------------------------------------------------- darkness
  darkness(api) {
    const R = api.rng;
    const colors = ['255,215,60', '160,255,80', '255,70,40', '210,235,255', '255,140,30'];
    const pairs = Array.from({ length: R.int(16, 24) }, () => ({
      t0: R.range(2, 10.5), d: R.range(1.8, 3.6), X: R.range(-api.wallHalf + 0.25, api.wallHalf - 0.25), Y: R.range(-0.38, 0.4),
      s: R.range(0.022, 0.06), sep: R.range(2.3, 3.4), c: R.pick(colors), shape: R.pick(['round', 'slit', 'angry']),
      blink: R.range(0.3, 0.8), look: R.range(-1, 1), look2: R.range(-1, 1),
    }));
    const wake = api.look([R.range(-5, 5), R.range(-1, 0.3), R.range(3.5, 7)]);
    return {
      noBlink: true,
      theme(th, t) {
        th.fade = Math.max(th.fade, ramp(t, 0.8, 2) * (1 - ramp(t, 13.4, 14.4)) * 0.97);
      },
      blink: (t) => ramp(t, 0.2, 1.1) * (1 - ramp(t, 14.0, 14.25)),
      lids: (t) => ({ upper: 0.6, lower: 0.52, tilt: -0.05, w: pulse(t, 13.9, 14.1, 15, 16) }),
      pupil: (t) => ({ size: 0.2, w: pulse(t, 13.9, 14.1, 15, 16) }),
      gaze: (t) => (t > 13.5 ? { yaw: wake[0], pitch: wake[1], w: api.env(t, 0.01, 1.5) } : null),
      draw(ctx, t) {
        const { H } = api.view;
        for (const p of pairs) {
          const d = t - p.t0;
          if (d < 0 || d > p.d) continue;
          let open = ramp(d, 0, 0.3) * (1 - ramp(d, p.d - 0.25, p.d));
          const bk = d / p.d;
          if (Math.abs(bk - p.blink) < 0.04) open *= Math.abs(bk - p.blink) / 0.04;
          const look = lerp(p.look, p.look2, smooth(d / p.d));
          const [x, y] = api.wall(p.X, p.Y);
          drawGlowEyes(ctx, x, y, p.s * H, p.s * H * p.sep, p.c, open, look, p.shape);
        }
      },
    };
  },
});
