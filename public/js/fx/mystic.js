// Mystic specials: hypnosis, the void, cosmic, eclipse, fever dream,
// signal lost, many eyes, possessed.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, noise1, fbm1, keyGaze, blinkAt, hsv, makeRng } from '../util.js';
import { glow, vignette, flash, Particles, setFont } from './draw.js';

register({
  // ---------------------------------------------------------- hypnosis
  hypnosis(api) {
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 3, 3);
        const a = hsv(0.78 + t * 0.025, 0.85, 1);
        const b = hsv(0.78 + t * 0.025 + 0.5, 0.9, 0.12);
        mixTheme(th, { spiral: 1, spiralA: b, spiralB: a, irisGlow: 0.6, glow: 0.3, glowColor: a, sclera: [0.8, 0.78, 0.86], vignette: 1 }, w);
      },
      gaze(t) {
        const [yaw, pitch] = api.look([Math.sin(t * 0.7) * 2.2, -0.3 + Math.sin(t * 0.45) * 0.4, 7]);
        return { yaw, pitch, w: api.env(t, 2, 2.5) };
      },
      lids: (t) => ({ upper: 0.52, lower: 0.48, tilt: 0, w: api.env(t, 2, 3) * 0.8 }),
      pupil: (t) => ({ size: 0.16, w: api.env(t, 2, 3) }),
    };
  },

  // -------------------------------------------------------------- void
  void(api) {
    const R = api.rng;
    const v1 = api.look([R.range(-4, 4), R.range(-1, 0.3), R.range(3.5, 7)]);
    const v2 = api.look([R.range(-4, 4), R.range(-1, 0.3), R.range(3.5, 7)]);
    const keys = [{ t: 0, a: api.anim.gaze.slice() }, { t: 1.5, a: v1, d: 3.2, ease: 'glide' }, { t: 10.5, a: v2, d: 0.13 }];
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 2.5, 2.5);
        mixTheme(th, {
          void: 1, pupilColor: [1, 0.96, 0.9], pupilGlow: 2.6, irisGlow: 0, veins: 0, skin: [0.05, 0.03, 0.04],
          key: 0.55, ambient: 0.5, glow: 0, vignette: 1,
        }, w);
        const flick = pulse(t, 13.4, 13.45, 13.7, 13.75) + pulse(t, 13.9, 13.95, 14.05, 14.1);
        th.pupilGlow *= 1 - 0.95 * flick;
      },
      pupil: (t) => ({ size: 0.075, w: api.env(t, 2.5, 2.5) }),
      lids: (t) => ({ upper: 0.46, lower: 0.44, tilt: 0.12, w: api.env(t, 2, 2) * 0.8 }),
      gaze(t) {
        const [yaw, pitch] = keyGaze(keys, t);
        return { yaw, pitch, w: api.env(t, 1, 2.5) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        vignette(ctx, W, H, '0,0,0', 0.6 * api.env(t, 3, 2), 0.25);
      },
    };
  },

  // ------------------------------------------------------------ cosmic
  cosmic(api) {
    const R = api.rng;
    const shooters = [];
    for (let t = R.range(3, 5); t < api.dur - 3; t += R.range(2.5, 5)) {
      const dir = R.sign();
      shooters.push({ t, X: -dir * R.range(1, api.wallHalf), Y: R.range(0.1, 0.45), vx: dir * R.range(2.2, 3.5), vy: -R.range(0.4, 0.9), life: R.range(1.2, 1.8) });
    }
    return {
      theme(th, t) {
        const w = api.env(t, 3.5, 3);
        mixTheme(th, { galaxy: 1, irisGlow: 0.6, keyColor: [0.7, 0.72, 1], key: 0.7, glow: 0.25, glowColor: [0.55, 0.35, 1], vignette: 0.7, sclera: [0.3, 0.3, 0.5] }, w);
      },
      lids: (t) => ({ upper: 0.5, lower: 0.47, tilt: -0.04, w: api.env(t, 3, 3) * 0.8 }),
      pupil: (t) => ({ size: 0.32, w: api.env(t, 3, 3) }),
      draw(ctx, t) {
        const { H } = api.view;
        for (const s of shooters) {
          const d = t - s.t;
          if (d < 0 || d > s.life) continue;
          const X = s.X + s.vx * d, Y = s.Y + s.vy * d;
          const [x1, y1] = api.wall(X, Y);
          const [x0, y0] = api.wall(X - s.vx * 0.12, Y - s.vy * 0.12);
          const a = Math.sin((d / s.life) * Math.PI);
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(1, `rgba(255,250,235,${a})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = Math.max(1.5, H * 0.003);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, x1, y1, H * 0.012, '255,240,220', a);
          ctx.globalCompositeOperation = 'source-over';
        }
      },
    };
  },

  // ----------------------------------------------------------- eclipse
  eclipse(api) {
    const ringAt = 13.2;
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 1.5, 2.5);
        const e = ramp(t, 1, 5.5) * (1 - ramp(t, ringAt + 0.3, 16.5));
        mixTheme(th, { ambient: 0.3, key: 0.45, keyColor: [0.8, 0.75, 0.7], skin: [0.08, 0.05, 0.04], vignette: 1, glowColor: [1, 0.6, 0.2] }, w * ramp(t, 1, 5));
        th.eclipse = e * w;
        th.glow += 0.35 * e * w + 1.2 * pulse(t, ringAt, ringAt + 0.15, ringAt + 0.4, ringAt + 1.4);
      },
      gaze(t) {
        const [yaw, pitch] = api.look([0, 1.2, 8]);
        return { yaw, pitch, w: api.env(t, 3, 3) };
      },
      lids: (t) => ({ upper: 0.56, lower: 0.5, tilt: -0.05, w: api.env(t, 3, 3) * 0.85 }),
      draw(ctx, t) {
        const { W, H } = api.view;
        const d = t - ringAt;
        if (d < 0 || d > 1.6) return;
        const [yaw, pitch] = api.view.gaze;
        const r = 0.47 * 0.97;
        const ex = Math.sin(yaw) + Math.cos(yaw) * r * 0.62;
        const ey = Math.sin(pitch) + r * 0.62;
        const [x, y] = api.eyePoint(ex, ey);
        const a = Math.sin(clamp(d / 1.6) * Math.PI);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, H * 0.25 * a, '255,250,235', 0.9 * a);
        ctx.strokeStyle = `rgba(255,255,245,${0.8 * a})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI + 0.3;
          const L = H * 0.35 * a;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(ang) * L, y - Math.sin(ang) * L);
          ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        flash(ctx, W, H, '255,250,240', 0.15 * a);
      },
    };
  },

  // ------------------------------------------------------------- fever
  fever(api) {
    const spores = new Particles(90);
    const L = api.local;
    return {
      theme(th, t) {
        const w = api.env(t, 3, 3);
        const hue = t * 0.08 + (api.idx + 1) / 3;
        mixTheme(th, {
          rainbow: 1, irisGlow: 0.7, glow: 0.4, glowColor: hsv(hue, 0.8, 1), skin: hsv(hue + 0.5, 0.6, 0.12),
          sclera: hsv(hue + 0.25, 0.25, 0.9), keyColor: hsv(hue + 0.1, 0.3, 1), veins: 0.1,
        }, w);
        th.hue = (api.idx + 1) / 3;
      },
      gaze(t) {
        const ph = t + api.idx * 0.75;
        return { yaw: 0.38 * Math.sin(ph * 0.9), pitch: 0.2 * Math.sin(ph * 1.8), w: api.env(t, 2.5, 2.5) };
      },
      lids: (t) => ({ upper: 0.3, lower: 0.4, tilt: -0.08, w: api.env(t, 3, 3) * 0.8 }),
      draw(ctx, t, dt) {
        const { W, H } = api.view;
        const w = api.env(t, 3, 3);
        spores.spawn(12 * w, dt, () => ({ x: L.range(0, W), y: L.range(0, H), r: L.range(10, 40), h: L.range(0, 1), age: 0, life: L.range(3, 6), vx: L.range(-20, 20), vy: L.range(-25, 5) }));
        spores.step(dt, (p) => { p.x += p.vx * dt; p.y += p.vy * dt; });
        ctx.globalCompositeOperation = 'lighter';
        for (const p of spores.list) {
          const c = hsv(p.h + t * 0.1, 0.8, 1).map((v) => Math.round(v * 255)).join(',');
          glow(ctx, p.x, p.y, p.r, c, Math.sin((p.age / p.life) * Math.PI) * 0.22 * w);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },

  // ------------------------------------------------------------ glitch
  glitch(api) {
    const R = api.rng;
    const bursts = [];
    for (let t = 0.6; t < api.dur - 1; t += R.range(0.5, 1.6)) bursts.push({ t, d: R.range(0.15, 0.7) });
    const bars = R.range(3, 5), sig = R.range(6, 7.5), black = R.range(2, 2.5);
    const g = (t) => bursts.reduce((m, b) => Math.max(m, pulse(t, b.t, b.t + 0.03, b.t + b.d, b.t + b.d + 0.05)), 0);
    const noiseC = document.createElement('canvas');
    noiseC.width = 160; noiseC.height = 90;
    const nctx = noiseC.getContext('2d');
    const img = nctx.createImageData(160, 90);
    return {
      theme(th, t) {
        const w = api.env(t, 0.3, 0.8);
        const v = (0.25 + 0.75 * g(t)) * w;
        th.glitch = v;
        const k = Math.floor(t * 12);
        const r = makeRng(api.seed + k * 31);
        th.offset[0] += (r.next() - 0.5) * 0.08 * g(t) * w;
        if (t > black && t < black + 0.18) th.fade = 1;
        th.hue = r.next();
        mixTheme(th, { rainbow: 0.25 }, g(t) * w);
      },
      gaze(t) {
        const k = Math.floor(t * 4);
        const r = makeRng(api.seed + k * 97 + 13);
        return { yaw: r.range(-0.55, 0.55), pitch: r.range(-0.35, 0.3), w: g(t) * api.env(t, 0.3, 0.8) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 0.3, 0.8);
        const s = (0.12 + 0.5 * g(t)) * w;
        if (s > 0.02) {
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
          nctx.putImageData(img, 0, 0);
          ctx.globalAlpha = s;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(noiseC, 0, 0, W, H);
          ctx.globalAlpha = 1;
        }
        if (t > bars && t < bars + 0.35) {
          const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
          cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * W) / 7, 0, W / 7 + 1, H * 0.7); });
          ctx.fillStyle = '#111'; ctx.fillRect(0, H * 0.7, W, H * 0.3);
        }
        if (t > sig && t < sig + 1.3 && Math.floor(t * 8) % 4 !== 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(W * 0.3, H * 0.44, W * 0.4, H * 0.12);
          setFont(ctx, H * 0.065, 'ui-monospace, "Courier New", monospace');
          ctx.fillStyle = '#e8e8e8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('NO SIGNAL', W / 2, H / 2);
        }
      },
    };
  },

  // --------------------------------------------------------- many eyes
  manyeyes(api) {
    const R = api.rng;
    const victim = api.look([R.range(-4, 4), R.range(-1, 0.3), R.range(3.5, 7)]);
    const wake = api.look([R.range(-5, 5), R.range(-1, 0.4), R.range(4, 8)]);
    return {
      noBlink: true,
      theme(th, t) {
        th.many = pulse(t, 1.0, 5.5, 13.0, 15.3) * api.env(t, 0.01, 1.5);
        th.manySync = pulse(t, 8, 8.15, 11.6, 12.4);
        mixTheme(th, { skin: [0.17, 0.08, 0.07], irisGlow: 0.4 }, th.many);
      },
      blink: (t) => ramp(t, 0.2, 0.9) * (1 - ramp(t, 15.6, 15.85)),
      gaze(t) {
        if (t < 15.5) { const [yaw, pitch] = victim; return { yaw, pitch, w: pulse(t, 7.5, 8, 12, 13) }; }
        return { yaw: wake[0], pitch: wake[1], w: api.env(t, 0.01, 1.2) };
      },
      lids: (t) => ({ upper: 0.58, lower: 0.5, tilt: -0.05, w: pulse(t, 15.4, 15.6, 16.6, 17.8) }),
      pupil: (t) => ({ size: 0.22, w: pulse(t, 15.4, 15.6, 16.6, 17.8) }),
    };
  },

  // --------------------------------------------------------- possessed
  possessed(api) {
    const R = api.rng;
    const victim = api.look([R.range(-3, 3), R.range(-1, 0.2), R.range(3.5, 6)]);
    const snap = 11;
    return {
      noBlink: true,
      theme(th, t) {
        const w = api.env(t, 1, 2);
        const fl = clamp(0.5 + noise1(t * 9, 4)) * pulse(t, 3, 4, snap, snap + 0.5);
        mixTheme(th, { veins: 1, veinColor: [0.45, 0, 0], sclera: [0.85, 0.72, 0.68], skin: [0.13, 0.06, 0.06], vignette: 1, glowColor: [1, 0.05, 0.02] }, w);
        th.blood += 0.45 * fl * w;
        th.glow += 0.4 * fl * w;
        th.lidFollow = 1 - pulse(t, 1, 1.6, snap - 0.2, snap);
        const shake = pulse(t, 0.3, 1.5, snap - 0.5, snap) * w;
        th.offset[0] += noise1(t * 32, 1) * 0.008 * shake;
        th.offset[1] += noise1(t * 32, 2) * 0.006 * shake;
        if (t > 4 && t < snap && noise1(t * 6, 9) > 0.62) th.fade = 0.7;
      },
      gaze(t) {
        if (t < snap) {
          const up = ramp(t, 1.5, 2.9);
          const tremor = noise1(t * 25, 3) * 0.04 * up;
          return { yaw: tremor, pitch: lerp(api.anim.gaze[1], 1.22, up) + noise1(t * 21, 7) * 0.03 * up, w: ramp(t, 0.2, 1.4), raw: true };
        }
        const k = clamp((t - snap) / 0.1);
        return { yaw: lerp(0, victim[0], k), pitch: lerp(1.22, victim[1], k), w: api.env(t, 0.1, 1.6), raw: k < 1 };
      },
      lids: (t) => ({ upper: (t < snap ? 0.48 : 0.6) + noise1(t * 14, 5) * 0.04, lower: 0.5, tilt: 0, w: api.env(t, 0.8, 1.6) }),
      pupil: (t) => ({ size: 0.13, w: ramp(t, snap, snap + 0.1) * api.env(t, 0.1, 1.6) }),
      draw(ctx, t) {
        const { W, H } = api.view;
        vignette(ctx, W, H, '60,0,0', 0.45 * pulse(t, 2, 4, snap, snap + 2), 0.3);
      },
    };
  },
});
