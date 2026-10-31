// Specials that use all three monitors as one big face or canvas:
// jack-o'-lantern, skull, writing on the wall, weeping blood.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, fbm1, noise1, keyGaze, blinkAt, makeRng, smooth } from '../util.js';
import { glow, vignette, setFont } from './draw.js';

// Cache a static full-screen layer; rebuilt when the screen size changes.
function staticLayer(api, paint) {
  let c = null, key = '';
  return () => {
    const { W, H, dpr } = api.view;
    const k = `${W}x${H}@${dpr}`;
    if (k !== key) {
      key = k;
      c = document.createElement('canvas');
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      paint(g, W, H);
    }
    return c;
  };
}

// Build a path from wall-space points (curves via quadratic midpoints).
function wallPath(ctx, api, pts, closed = true) {
  const s = pts.map(([X, Y]) => api.wall(X, Y));
  ctx.moveTo(s[0][0], s[0][1]);
  for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
  if (closed) ctx.closePath();
}

register({
  // ------------------------------------------------------------ pumpkin
  pumpkin(api) {
    const A = api.geo.spacing;
    const xL = -A, xR = A;
    const flick = (t) => 0.7 + 0.3 * clamp(0.5 + fbm1(t * 7, 77));
    const eyeTri = (cx, side) => [[cx - 0.5, -0.28], [cx + 0.5, -0.26], [cx + 0.06 * side, 0.43]];
    const nose = [[-0.16, 0.06], [0.16, 0.06], [0, 0.29]];
    const mouth = [
      [-0.82, 0.0], [-0.55, -0.12], [-0.4, -0.15], [-0.4, -0.05], [-0.24, -0.07], [-0.24, -0.18], [0.24, -0.18],
      [0.24, -0.07], [0.4, -0.05], [0.4, -0.15], [0.55, -0.12], [0.82, 0.0], [0.6, -0.27], [0.3, -0.38],
      [0.1, -0.41], [0.1, -0.3], [-0.1, -0.3], [-0.1, -0.41], [-0.3, -0.38], [-0.6, -0.27],
    ];
    const holes = [eyeTri(xL, 1), eyeTri(xR, -1), nose, mouth];
    const layer = staticLayer(api, (g, W, H) => {
      const [cx, cy] = api.wall(0, -0.05);
      const gr = g.createRadialGradient(cx, cy, H * 0.2, cx, cy, H * 3.2);
      gr.addColorStop(0, '#ff9a2a');
      gr.addColorStop(0.45, '#e36d0c');
      gr.addColorStop(1, '#5a2203');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      // ribs, curving like meridians of a sphere
      for (let k = -9; k <= 9; k++) {
        const x0 = k * 0.42;
        const pts = [];
        for (let Y = -0.7; Y <= 0.7; Y += 0.05) pts.push([x0 * (1 - 0.32 * Y * Y), Y]);
        g.save();
        g.strokeStyle = 'rgba(90,30,0,0.45)';
        g.lineWidth = H * 0.035;
        g.filter = `blur(${Math.round(H * 0.012)}px)`;
        g.beginPath(); wallPath(g, api, pts, false); g.stroke();
        g.filter = 'none';
        g.strokeStyle = 'rgba(255,190,110,0.18)';
        g.lineWidth = H * 0.012;
        g.translate(H * 0.035, 0);
        g.beginPath(); wallPath(g, api, pts, false); g.stroke();
        g.restore();
      }
      // speckles
      const r = makeRng(99);
      g.fillStyle = 'rgba(120,50,0,0.25)';
      for (let i = 0; i < 500; i++) { g.beginPath(); g.arc(r.range(0, W), r.range(0, H), r.range(0.5, 2.5), 0, TAU); g.fill(); }
      // light spill around the carved holes
      g.globalCompositeOperation = 'lighter';
      for (const h of holes) {
        const cxh = h.reduce((s, p) => s + p[0], 0) / h.length, cyh = h.reduce((s, p) => s + p[1], 0) / h.length;
        const [sx, sy] = api.wall(cxh, cyh);
        glow(g, sx, sy, H * 0.55, '255,140,20', 0.25);
      }
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.beginPath();
      for (const h of holes) wallPath(g, api, h);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // carved flesh: the inner wall of each hole, lit by the candle
      g.save();
      g.beginPath();
      for (const h of holes) wallPath(g, api, h);
      g.clip();
      g.lineJoin = 'round';
      g.strokeStyle = '#ffcf6a';
      g.lineWidth = H * 0.05;
      g.beginPath();
      for (const h of holes) wallPath(g, api, h);
      g.stroke();
      g.strokeStyle = 'rgba(200,90,10,0.8)';
      g.lineWidth = H * 0.02;
      g.stroke();
      g.restore();
    });
    const isMouth = api.idx === 0;
    return {
      noBlink: isMouth,
      theme(th, t) {
        const w = api.env(t, 1.2, 1.5);
        const f = flick(t);
        mixTheme(th, {
          skin: [0.02, 0.01, 0], fire: isMouth ? 1 : 0.55, fireA: [0.95, 0.3, 0.02], fireB: [1, 0.8, 0.25], fireIris: 0.65,
          irisGlow: 1.1, irisA: [1, 0.75, 0.2], irisB: [0.8, 0.25, 0.02], glow: 0.6 * f, glowColor: [1, 0.45, 0.05],
          sclera: [0.55, 0.3, 0.1], keyColor: [1, 0.65, 0.3], key: f, vignette: 0.6,
        }, w);
      },
      blink: (t) => (isMouth ? ramp(t, 0.1, 0.8) * (1 - ramp(t, api.dur - 1.2, api.dur - 0.6)) : null),
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 1.2, 1.5);
        const f = flick(t);
        ctx.globalAlpha = w;
        ctx.drawImage(layer(), 0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath();
        for (const h of holes) wallPath(ctx, api, h);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, W / 2, H * 0.55, H * 0.8, '255,120,10', 0.22 * f * w);
        ctx.restore();
      },
    };
  },

  // -------------------------------------------------------------- skull
  skull(api) {
    const A = api.geo.spacing;
    const R = api.rng;
    const socket = (cx, side) => {
      const pts = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        const rx = 0.6 + 0.06 * Math.cos(2 * a + 0.5), ry = 0.41 + 0.05 * s * side * c;
        const se = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
        pts.push([cx + rx * se(c, 0.8), 0.02 + ry * se(s, 0.85) - 0.06 * c * side]);
      }
      return pts;
    };
    const nasal = [
      [0, 0.34], [-0.05, 0.26], [-0.11, 0.14], [-0.16, 0.02], [-0.16, -0.07], [-0.11, -0.12], [-0.04, -0.1], [0, -0.04],
      [0.04, -0.1], [0.11, -0.12], [0.16, -0.07], [0.16, 0.02], [0.11, 0.14], [0.05, 0.26],
    ];
    const holes = [socket(-A, 1), socket(A, -1), nasal];
    const cracks = Array.from({ length: 4 }, () => {
      let X = R.range(-A - 0.6, A + 0.6), Y = 0.5;
      const pts = [[X, Y]];
      for (let i = 0; i < 8; i++) { X += R.range(-0.08, 0.08); Y -= R.range(0.03, 0.06); pts.push([X, Y]); }
      return pts;
    });
    const chatters = [R.range(5, 6.5), R.range(9, 10.5)];
    const gap = (t) => {
      let g = 0.012;
      for (const c of chatters) g += pulse(t, c, c + 0.05, c + 1.0, c + 1.1) * (0.03 + 0.03 * Math.abs(Math.sin((t - c) * 26)));
      return g;
    };
    const layer = staticLayer(api, (g, W, H) => {
      const [cx, cy] = api.wall(0, 0.15);
      const gr = g.createRadialGradient(cx, cy, H * 0.3, cx, cy, H * 3.0);
      gr.addColorStop(0, '#efe8d2');
      gr.addColorStop(0.5, '#cfc4a4');
      gr.addColorStop(1, '#5c5440');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      const r = makeRng(5);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(${r.chance(0.5) ? '90,80,60' : '255,250,235'},${r.range(0.03, 0.1)})`;
        g.beginPath(); g.arc(r.range(0, W), r.range(0, H), r.range(1, 6), 0, TAU); g.fill();
      }
      // cheekbone shadows under the sockets, brow highlights above
      for (const X of [-A, A]) { const [sx, sy] = api.wall(X, -0.45); glow(g, sx, sy, H * 0.5, '70,60,40', 0.35); }
      for (const X of [-A, A]) { const [sx, sy] = api.wall(X * 0.85, 0.5); glow(g, sx, sy, H * 0.45, '255,252,240', 0.3); }
      for (const X of [-A - 0.95, A + 0.95]) { const [sx, sy] = api.wall(X, 0); glow(g, sx, sy, H * 0.7, '40,32,20', 0.5); }
      g.strokeStyle = 'rgba(60,50,35,0.7)';
      g.lineWidth = 1.5;
      for (const c of cracks) { g.beginPath(); wallPath(g, api, c, false); g.stroke(); }
      // deep shading around each hole
      g.save();
      g.shadowColor = 'rgba(30,20,10,0.95)';
      g.shadowBlur = H * 0.08;
      g.strokeStyle = 'rgba(40,30,20,0.6)';
      g.lineWidth = H * 0.03;
      g.beginPath();
      for (const h of holes) wallPath(g, api, h);
      g.stroke();
      g.restore();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.beginPath();
      for (const h of holes) wallPath(g, api, h);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    });
    const teeth = (ctx, t) => {
      const { H } = api.view;
      const gp = gap(t);
      const widths = [0.7, 0.8, 0.95, 1.15, 1.25, 1.25, 1.15, 0.95, 0.8, 0.7];
      const total = widths.reduce((a, b) => a + b, 0);
      const row = (Ytop, Ybot, x0, x1, lower) => {
        let X = x0;
        const span = x1 - x0;
        for (const wdt of widths) {
          const tw = (wdt / total) * span;
          const curve = 0.05 * Math.pow((X + tw / 2) / (span / 2), 2);
          const yt = Ytop + (lower ? -curve : curve), yb = Ybot + (lower ? -curve : curve);
          const [a, b] = api.wall(X + tw * 0.05, yt), [c, d] = api.wall(X + tw * 0.95, yb);
          const g = ctx.createLinearGradient(a, 0, c, 0);
          g.addColorStop(0, '#b8ad8e'); g.addColorStop(0.45, '#f4eedc'); g.addColorStop(1, '#a89c7c');
          ctx.fillStyle = g;
          ctx.beginPath();
          const r = Math.min(c - a, Math.abs(d - b)) * 0.4;
          if (lower) ctx.roundRect(a, d, c - a, b - d, [r, r, 2, 2]); else ctx.roundRect(a, b, c - a, d - b, [2, 2, r, r]);
          ctx.fill();
          ctx.strokeStyle = 'rgba(60,48,30,0.85)';
          ctx.lineWidth = Math.max(1, H * 0.003);
          ctx.stroke();
          X += tw;
        }
      };
      // dark bite line between the rows, opens when the jaw chatters
      const [l, top] = api.wall(-0.7, -0.36), [r, bot] = api.wall(0.7, -0.4 - gp);
      ctx.fillStyle = '#080605';
      ctx.beginPath();
      ctx.ellipse((l + r) / 2, (top + bot) / 2, (r - l) / 2, Math.max(2, (bot - top) / 2 + H * 0.01), 0, 0, TAU);
      ctx.fill();
      row(-0.2, -0.38, -0.68, 0.68, false);
      row(-0.4 - gp, -0.56 - gp, -0.64, 0.64, true);
    };
    const isNose = api.idx === 0;
    return {
      noBlink: isNose,
      theme(th, t) {
        const w = api.env(t, 1.2, 1.5);
        mixTheme(th, {
          void: 0.95, pupilColor: [1, 0.12, 0.04], pupilGlow: 2.6, skin: [0.01, 0.005, 0.005], glow: 0.2, glowColor: [1, 0.1, 0.02],
          irisGlow: 0, vignette: 0.5,
        }, w);
        if (isNose) th.fade = Math.max(th.fade, w);
      },
      pupil: (t) => ({ size: 0.11, w: api.env(t, 1.2, 1.5) }),
      blink: (t) => (isNose ? ramp(t, 0.1, 0.8) * (1 - ramp(t, api.dur - 1.2, api.dur - 0.6)) : null),
      lids: (t) => ({ upper: 0.5, lower: 0.46, tilt: 0.1, w: api.env(t, 1, 1.5) * 0.7 }),
      draw(ctx, t) {
        const { W, H } = api.view;
        const w = api.env(t, 1.2, 1.5);
        ctx.globalAlpha = w;
        ctx.drawImage(layer(), 0, 0, W, H);
        if (isNose) teeth(ctx, t);
        ctx.globalAlpha = 1;
      },
    };
  },

  // ------------------------------------------------------------ message
  message(api) {
    const words = (api.params.words || ['I', 'SEE', 'YOU']).map((w) => String(w || ''));
    const word = words[api.idx + 1] || '';
    const start = 1.4 + (api.idx + 1) * 0.55;
    const fadeOut = [10.2, 11.2];
    const L = makeRng((api.seed + api.idx * 101) >>> 0);
    let drips = null, cacheKey = '', textCanvas = null, fontPx = 0;
    const R = api.rng;
    const wake = api.look([R.range(-3, 3), R.range(-0.8, 0.3), R.range(4, 7)]);
    const build = (W, H, dpr) => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      setFont(g, 100);
      const m = g.measureText(word || ' ');
      fontPx = Math.min(H * 0.5, (W * 0.84) / Math.max(1, m.width) * 100);
      setFont(g, fontPx);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const grad = g.createLinearGradient(0, H / 2 - fontPx / 2, 0, H / 2 + fontPx / 2);
      grad.addColorStop(0, '#d0140c');
      grad.addColorStop(1, '#6a0000');
      g.fillStyle = grad;
      g.shadowColor = 'rgba(255,0,0,0.55)';
      g.shadowBlur = fontPx * 0.12;
      g.fillText(word, W / 2, H / 2);
      // find the bottoms of the letters to grow drips from
      const img = g.getImageData(0, 0, c.width, c.height).data;
      const cands = [];
      const step = Math.max(2, Math.round(4 * dpr));
      for (let x = 0; x < c.width; x += step) {
        for (let y = c.height - 1; y > 0; y--) {
          if (img[(y * c.width + x) * 4 + 3] > 200) { cands.push([x / dpr, y / dpr]); break; }
        }
      }
      const n = Math.min(cands.length, L.int(9, 16));
      drips = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = cands[L.int(0, cands.length - 1)];
        drips.push({ x, y: y - 3, len: L.range(0.08, 0.42) * H, w: L.range(3, 9), d: L.range(0, 2.5), sp: L.range(0.6, 1.4) });
      }
      textCanvas = c;
    };
    return {
      noBlink: true,
      theme(th, t) {
        th.fade = Math.max(th.fade, ramp(t, 0.5, 1.3) * (1 - ramp(t, 11.0, 11.7)));
      },
      blink: (t) => ramp(t, 0.1, 0.7) * (1 - ramp(t, 11.3, 11.6)),
      lids: (t) => ({ upper: 0.6, lower: 0.52, tilt: -0.05, w: pulse(t, 11.3, 11.5, 12, 12.9) }),
      pupil: (t) => ({ size: 0.2, w: pulse(t, 11.3, 11.5, 12, 12.9) }),
      gaze: (t) => (t > 11 ? { yaw: wake[0], pitch: wake[1], w: api.env(t, 0.01, 1.2) } : null),
      draw(ctx, t) {
        if (!word || t < start) return;
        const { W, H, dpr } = api.view;
        const key = `${W}x${H}@${dpr}:${document.fonts?.check('100px Creepster') ? 1 : 0}`;
        if (key !== cacheKey) { cacheKey = key; build(W, H, dpr); }
        let a = 1 - ramp(t, fadeOut[0], fadeOut[1]);
        const d = t - start;
        if (d < 0.5) a *= noise1(t * 30, api.idx) > -0.2 ? 1 : 0.15;
        a *= api.env(t, 0.01, 0.8);
        const jx = noise1(t * 3, 7) * H * 0.002, jy = noise1(t * 3, 8) * H * 0.002;
        ctx.globalAlpha = a;
        ctx.drawImage(textCanvas, jx, jy, W, H);
        for (const p of drips) {
          const k = clamp((d - 0.6 - p.d) / 5 * p.sp);
          if (k <= 0) continue;
          const len = p.len * (1 - Math.pow(1 - k, 2));
          const g = ctx.createLinearGradient(0, p.y, 0, p.y + len);
          g.addColorStop(0, '#7a0000');
          g.addColorStop(1, '#b0100a');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(p.x - p.w / 2 + jx, p.y + jy);
          ctx.lineTo(p.x + p.w / 2 + jx, p.y + jy);
          ctx.lineTo(p.x + p.w * 0.3 + jx, p.y + len + jy);
          ctx.lineTo(p.x - p.w * 0.3 + jx, p.y + len + jy);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x + jx, p.y + len + jy, p.w * 0.62, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,120,110,0.35)';
          ctx.beginPath();
          ctx.arc(p.x - p.w * 0.2 + jx, p.y + len - p.w * 0.2 + jy, p.w * 0.18, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    };
  },

  // ------------------------------------------------------------ weeping
  weeping(api) {
    const R = api.rng;
    const look = api.look([R.range(-3, 3), R.range(-0.5, 0.4), R.range(4, 7)]);
    const down = api.look([R.range(-1.5, 1.5), -3, 4]);
    const keys = [
      { t: 0, a: down }, { t: 1, a: down, d: 2, ease: 'glide' }, { t: 7.5, a: look, d: 1.4, ease: 'glide' },
      { t: 10.5, a: down, d: 2.2, ease: 'glide' }, { t: 14, a: look, d: 1.2, ease: 'glide' }, { t: 16.5, a: down, d: 1.5, ease: 'glide' },
    ];
    const blinks = [3.2, 6.4, 9.6, 12.8, 16.2].map((b) => b + R.range(-0.3, 0.3));
    const L = makeRng((api.seed + api.idx * 313) >>> 0);
    const tears = Array.from({ length: L.int(3, 4) }, () => ({
      x: L.range(-0.62, 0.62), start: L.range(2.5, 9), sp: L.range(0.035, 0.07), wob: L.range(0, TAU), w: L.range(0.008, 0.014) * api.view.H, trail: [],
    }));
    return {
      theme(th, t) {
        const w = api.env(t, 2, 3);
        mixTheme(th, { veins: 0.95, veinColor: [0.5, 0.02, 0.02], sclera: [0.86, 0.72, 0.68], vignette: 1, key: 0.85, keyColor: [1, 0.85, 0.8] }, w);
        th.blood += 0.5 * ramp(t, 2, 10) * w;
      },
      lids: (t) => ({ upper: 0.3, lower: 0.4, tilt: -0.34, w: api.env(t, 2, 3) }),
      gaze(t) { const [yaw, pitch] = keyGaze(keys, t); return { yaw, pitch, w: api.env(t, 2, 3) }; },
      blink: (t) => Math.max(0, ...blinks.map((b) => blinkAt(t, b, 0.75, 0.15))),
      draw(ctx, t, dt) {
        const { H } = api.view;
        const w = api.env(t, 1, 2);
        const lower = api.view.lids ? api.view.lids.lower : 0.4;
        for (const tr of tears) {
          if (t < tr.start) continue;
          const [ox, oy] = api.eyePoint(tr.x, api.lowerLidY(tr.x, lower));
          const age = t - tr.start;
          const headY = oy + H * tr.sp * age * (1 + 0.3 * Math.sin(age * 0.8 + tr.wob)) * 0.9;
          const wobble = (y) => Math.sin(y / H * 9 + tr.wob) * H * 0.006;
          ctx.strokeStyle = `rgba(110,0,0,${0.85 * w})`;
          ctx.lineCap = 'round';
          ctx.lineWidth = tr.w * 0.55;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          for (let y = oy; y < headY; y += 6) ctx.lineTo(ox + wobble(y - oy), y);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,90,80,${0.25 * w})`;
          ctx.lineWidth = tr.w * 0.15;
          ctx.stroke();
          const hx = ox + wobble(headY - oy);
          ctx.fillStyle = `rgba(150,5,5,${0.95 * w})`;
          ctx.beginPath();
          ctx.ellipse(hx, headY, tr.w * 0.7, tr.w * 0.95, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = `rgba(255,140,130,${0.4 * w})`;
          ctx.beginPath();
          ctx.arc(hx - tr.w * 0.25, headY - tr.w * 0.3, tr.w * 0.2, 0, TAU);
          ctx.fill();
        }
      },
    };
  },
});
