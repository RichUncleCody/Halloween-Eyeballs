// 2-D drawing helpers for sprites and overlays (bats, spiders, ghosts,
// lightning, fog...). All sizes are in CSS pixels.

import { TAU, clamp } from '../util.js';

export function glow(ctx, x, y, r, rgb, a) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export function vignette(ctx, W, H, rgb, alpha, inner = 0.3) {
  if (alpha <= 0.002) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(1, `rgba(${rgb},${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function flash(ctx, W, H, rgb, alpha) {
  if (alpha <= 0.002) return;
  ctx.fillStyle = `rgba(${rgb},${clamp(alpha)})`;
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------- bat
// s = half wingspan in px, flap in [-1, 1] (1 = wings up)
export function drawBat(ctx, x, y, s, flap, tilt = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0c0812';
  ctx.strokeStyle = 'rgba(150,120,190,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  const f = flap;
  for (const side of [-1, 1]) {
    const sh = [side * s * 0.1, -s * 0.06];
    const wr = [side * s * 0.52, -s * 0.12 - s * 0.32 * f];
    const tip = [side * s * 1.0, s * 0.02 - s * 0.55 * f];
    const f1 = [side * s * 0.78, s * 0.12 - s * 0.36 * f];
    const f2 = [side * s * 0.5, s * 0.16 - s * 0.16 * f];
    const bj = [side * s * 0.12, s * 0.16];
    ctx.beginPath();
    ctx.moveTo(...sh);
    ctx.quadraticCurveTo(side * s * 0.3, wr[1] - s * 0.12, ...wr);
    ctx.lineTo(...tip);
    const scallop = (a, b) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - s * 0.09;
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
    };
    scallop(tip, f1);
    scallop(f1, f2);
    scallop(f2, bj);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // body + head + ears
  ctx.beginPath();
  ctx.ellipse(0, s * 0.04, s * 0.11, s * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -s * 0.15, s * 0.09, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.18); ctx.lineTo(-s * 0.07, -s * 0.33); ctx.lineTo(-s * 0.02, -s * 0.21);
  ctx.moveTo(s * 0.08, -s * 0.18); ctx.lineTo(s * 0.07, -s * 0.33); ctx.lineTo(s * 0.02, -s * 0.21);
  ctx.fill();
  ctx.fillStyle = '#ff3a1a';
  ctx.beginPath();
  ctx.arc(-s * 0.035, -s * 0.16, Math.max(1, s * 0.02), 0, TAU);
  ctx.arc(s * 0.035, -s * 0.16, Math.max(1, s * 0.02), 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- spider
// s = body radius in px. walk: phase for legs; curl: 0 walking .. 1 legs curled (dangling)
export function drawSpider(ctx, x, y, s, walk, curl = 0, angle = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#140d0d';
  const base = [-0.95, -0.35, 0.25, 0.8];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const sw = Math.sin(walk + i * 1.6 + (side > 0 ? Math.PI : 0)) * 0.22 * (1 - curl);
      const a = base[i] + sw;
      const reach = s * (3.1 - curl * 1.4);
      const kx = side * Math.cos(a) * reach * 0.52;
      const ky = Math.sin(a) * reach * 0.52 - s * (0.9 + curl * 0.3);
      const fx = side * Math.cos(a + curl * 0.5) * reach * (1 - curl * 0.35);
      const fy = Math.sin(a) * reach + s * (0.6 - curl * 1.2);
      ctx.lineWidth = s * 0.17;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.3, s * 0.0);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.lineWidth = s * 0.08;
      ctx.strokeStyle = 'rgba(120,90,90,0.25)';
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.strokeStyle = '#140d0d';
    }
  }
  // abdomen
  const ga = ctx.createRadialGradient(-s * 0.3, s * 0.7, s * 0.1, 0, s * 1.0, s * 1.3);
  ga.addColorStop(0, '#4a3434');
  ga.addColorStop(0.5, '#1a1010');
  ga.addColorStop(1, '#070404');
  ctx.fillStyle = ga;
  ctx.beginPath();
  ctx.ellipse(0, s * 1.05, s * 0.95, s * 1.15, 0, 0, TAU);
  ctx.fill();
  // hourglass
  ctx.fillStyle = '#b3120e';
  ctx.beginPath();
  ctx.moveTo(-s * 0.22, s * 0.75); ctx.lineTo(s * 0.22, s * 0.75); ctx.lineTo(0, s * 1.05);
  ctx.lineTo(s * 0.22, s * 1.35); ctx.lineTo(-s * 0.22, s * 1.35); ctx.lineTo(0, s * 1.05);
  ctx.closePath();
  ctx.fill();
  // head
  const gh = ctx.createRadialGradient(-s * 0.15, -s * 0.25, s * 0.05, 0, -s * 0.1, s * 0.65);
  gh.addColorStop(0, '#3c2a2a');
  gh.addColorStop(1, '#0a0606');
  ctx.fillStyle = gh;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.12, s * 0.58, s * 0.52, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff2a1a';
  for (const [ex, ey, r] of [[-0.16, -0.38, 0.08], [0.16, -0.38, 0.08], [-0.32, -0.3, 0.05], [0.32, -0.3, 0.05]]) {
    ctx.beginPath();
    ctx.arc(ex * s, ey * s, Math.max(0.8, r * s), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------- ghost
export function drawGhost(ctx, x, y, s, t, alpha = 1, mouth = 0.25, face = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  glow(ctx, 0, s * 0.2, s * 2.4, '170,210,255', 0.22);
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.bezierCurveTo(-s, -s * 1.45, s, -s * 1.45, s, 0);
  const hemY = s * 1.35;
  ctx.lineTo(s * 1.05, hemY);
  const waves = 5;
  for (let k = 0; k < waves; k++) {
    const x0 = s * 1.05 - (k * 2.1 * s) / waves;
    const x1 = s * 1.05 - ((k + 1) * 2.1 * s) / waves;
    const lift = Math.sin(t * 4 + k * 1.7) * s * 0.12;
    ctx.quadraticCurveTo((x0 + x1) / 2, hemY - s * 0.32 + lift, x1, hemY + Math.sin(t * 3 + k) * s * 0.08);
  }
  ctx.lineTo(-s, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -s * 1.1, 0, hemY);
  g.addColorStop(0, 'rgba(250,252,255,0.95)');
  g.addColorStop(0.6, 'rgba(215,232,255,0.8)');
  g.addColorStop(1, 'rgba(170,200,255,0.15)');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(180,220,255,0.9)';
  ctx.shadowBlur = s * 0.6;
  ctx.fill();
  ctx.shadowBlur = 0;
  // face
  const fx = face * s * 0.18;
  ctx.fillStyle = 'rgba(15,15,35,0.9)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.34 + fx, -s * 0.38, s * 0.15, s * 0.22, 0, 0, TAU);
  ctx.ellipse(s * 0.34 + fx, -s * 0.38, s * 0.15, s * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(fx, s * 0.12, s * (0.12 + mouth * 0.2), s * (0.06 + mouth * 0.42), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// -------------------------------------------------------------- lightning
// Midpoint-displacement bolt between two points. `rnd` is a () => [0,1) source.
export function boltPoints(rnd, x0, y0, x1, y1, rough = 0.3, depth = 6) {
  let pts = [[x0, y0], [x1, y1]];
  let disp = Math.hypot(x1 - x0, y1 - y0) * rough;
  for (let d = 0; d < depth; d++) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const nx = -(by - ay), ny = bx - ax;
      const L = Math.hypot(nx, ny) || 1;
      const o = (rnd() - 0.5) * disp;
      out.push(pts[i], [(ax + bx) / 2 + (nx / L) * o, (ay + by) / 2 + (ny / L) * o]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
    disp *= 0.55;
  }
  return pts;
}

export function drawBolt(ctx, pts, width, alpha = 1, glowRgb = '150,180,255', coreRgb = '255,255,255') {
  if (alpha <= 0.01 || pts.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, a, c] of [[width * 7, 0.08, glowRgb], [width * 3, 0.3, glowRgb], [width, 1, coreRgb]]) {
    ctx.strokeStyle = `rgba(${c},${a * alpha})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------- fog
const fogCache = new Map();
export function fogSprite(rgb = '200,200,210') {
  if (fogCache.has(rgb)) return fogCache.get(rgb);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // a lumpy blob made of overlapping soft circles
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const x = 128 + (rnd() - 0.5) * 120, y = 128 + (rnd() - 0.5) * 70, r = 40 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},0.22)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  fogCache.set(rgb, c);
  return c;
}

// -------------------------------------------------------------- glow eyes
// A pair of glowing eyes in the dark. open: 0..1, look: -1..1
export function drawGlowEyes(ctx, x, y, size, sep, rgb, open, look = 0, shape = 'round', alpha = 1) {
  if (open <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const ex = x + side * sep / 2;
    glow(ctx, ex, y, size * 3.2, rgb, 0.22 * alpha * open);
  }
  ctx.restore();
  ctx.save();
  for (const side of [-1, 1]) {
    const ex = x + side * sep / 2;
    ctx.save();
    ctx.translate(ex, y);
    if (shape === 'angry') ctx.rotate(side * -0.25);
    ctx.scale(1, open * (shape === 'slit' ? 0.75 : 0.62));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    g.addColorStop(0, `rgba(255,255,230,${alpha})`);
    g.addColorStop(0.35, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},${alpha * 0.25})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${0.85 * alpha})`;
    ctx.beginPath();
    if (shape === 'slit') ctx.ellipse(look * size * 0.45, 0, size * 0.14, size * 0.85, 0, 0, TAU);
    else ctx.arc(look * size * 0.45, 0, size * 0.36, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ------------------------------------------------------------- particles
export class Particles {
  constructor(max = 300) { this.list = []; this.max = max; this.carry = 0; }
  spawn(rate, dt, make) {
    this.carry += rate * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      if (this.list.length < this.max) this.list.push(make());
    }
  }
  step(dt, fn) {
    const out = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age < p.life && fn(p, dt) !== false) out.push(p);
    }
    this.list = out;
  }
}

export function setFont(ctx, px, family = 'Creepster, Impact, "Arial Black", sans-serif') {
  ctx.font = `${Math.round(px)}px ${family}`;
}
