// Small quirks the screens render themselves.

import { register } from './registry.js';
import { mixTheme } from '../theme.js';
import { ramp, pulse, clamp, lerp, TAU, fbm1, noise1, makeRng } from '../util.js';
import { glow, vignette } from './draw.js';

const heart = (t, beat = 0.95) => {
  const ph = (t % beat) / beat;
  return Math.exp(-(((ph - 0.04) / 0.04) ** 2)) + 0.7 * Math.exp(-(((ph - 0.24) / 0.045) ** 2));
};

register({
  eyeroll(api) {
    const d = (api.idx + 1) * 0.12;
    return {
      gaze(t) {
        const u = clamp((t - 0.25 - d) / 1.5);
        const phi = lerp(Math.PI + 0.35, -0.35, u * u * (3 - 2 * u));
        return { yaw: 0.5 * Math.cos(phi), pitch: 0.36 * Math.sin(phi), w: pulse(t, d, d + 0.25, 2.0 + d, 2.5) };
      },
      lids: (t) => ({ upper: 0.3, lower: 0.4, tilt: -0.05, w: pulse(t, d, d + 0.4, 1.9 + d, 2.5) }),
    };
  },

  critter(api) {
    const R = api.rng;
    const moth = R.chance(0.4);
    const dir = R.sign();
    const half = api.wallHalf + 0.3;
    const sp = (2 * half) / (api.dur - 1);
    const s = api.seed % 997;
    const pos = (t) => [
      -dir * half + dir * sp * Math.max(0, t - 0.3) + fbm1(t * 0.9, s) * 0.5,
      0.28 * fbm1(t * (moth ? 0.8 : 1.6), s + 3) + 0.05,
    ];
    return {
      gaze(t) {
        const [X, Y] = pos(t);
        const [yaw, pitch] = api.lookWall(X, Y, 1.1);
        const near = clamp(1.6 - Math.abs(X - api.geo.eyeX) * 0.5);
        return { yaw, pitch, w: api.env(t, 0.6, 1) * (0.4 + 0.6 * near) };
      },
      draw(ctx, t) {
        const { W, H } = api.view;
        const [X, Y] = pos(t);
        const [x, y] = api.wall(X, Y);
        if (x < -50 || x > W + 50) return;
        if (moth) {
          const fl = Math.abs(Math.sin(t * 22));
          ctx.fillStyle = 'rgba(215,200,170,0.85)';
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(x + side * H * 0.012 * fl, y - H * 0.004, H * 0.013 * (0.4 + fl * 0.6), H * 0.017, side * 0.5, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#3a2e22';
          ctx.beginPath(); ctx.ellipse(x, y, H * 0.004, H * 0.011, 0, 0, TAU); ctx.fill();
          glow(ctx, x, y, H * 0.05, '255,240,200', 0.12);
        } else {
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath(); ctx.ellipse(x, y, H * 0.007, H * 0.005, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(210,220,235,0.45)';
          const fl = Math.sin(t * 120) * H * 0.003;
          ctx.beginPath(); ctx.ellipse(x - H * 0.003, y - H * 0.005 - fl, H * 0.006, H * 0.003, -0.6, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x + H * 0.003, y - H * 0.005 + fl, H * 0.006, H * 0.003, 0.6, 0, TAU); ctx.fill();
        }
      },
    };
  },

  twitch(api) {
    const mine = api.params.eye === api.pos;
    return {
      lids: (t) => (mine ? { lower: 0.4 - Math.abs(Math.sin(t * 38)) * 0.07 * pulse(t, 0.2, 0.3, 1.5, 1.7), w: 1 } : null),
      theme(th, t) {
        if (!mine) return;
        th.offset[1] += Math.sin(t * 45) * 0.0015 * pulse(t, 0.2, 0.3, 1.5, 1.7);
      },
    };
  },

  glint(api) {
    const s = 0.2 + (api.idx + 1) * 0.28;
    return {
      theme(th, t) {
        const w = pulse(t, s, s + 0.15, s + 0.55, s + 1.1);
        mixTheme(th, { irisA: [1, 0.12, 0.04], irisB: [0.5, 0, 0], irisGlow: 2.2, slit: 0.85, glow: 0.5, glowColor: [1, 0.05, 0.02] }, w);
      },
    };
  },

  heartbeat(api) {
    return {
      theme(th, t) {
        const h = heart(t) * api.env(t, 0.3, 0.8);
        th.offset[1] += h * 0.004;
        th.glow += h * 0.3;
        th.glowColor = [0.9, 0.05, 0.02];
      },
      pupil: (t) => ({ size: 0.38 + heart(t) * 0.15, w: api.env(t, 0.3, 0.8) }),
      draw(ctx, t) {
        const { W, H } = api.view;
        vignette(ctx, W, H, '140,0,0', 0.5 * heart(t) * api.env(t, 0.3, 0.8), 0.28);
      },
    };
  },

  shadow(api) {
    const R = api.rng;
    const dir = R.sign();
    const half = api.wallHalf + 1;
    const X = (t) => -dir * half + dir * (2 * half) * clamp((t - 0.3) / 1.6);
    const follow = 0.35;
    return {
      gaze(t) {
        const [yaw, pitch] = api.lookWall(X(Math.max(0, t - follow)), 0, 1.2);
        return { yaw, pitch, w: pulse(t, 0.5, 0.7, 2.6, 3.3) };
      },
      lids: (t) => ({ upper: 0.58, lower: 0.5, tilt: -0.05, w: pulse(t, 0.4, 0.6, 2.4, 3.2) }),
      draw(ctx, t) {
        const { W, H } = api.view;
        const [x, y] = api.wall(X(t), 0.05);
        if (x < -H * 1.5 || x > W + H * 1.5) return;
        ctx.save();
        ctx.filter = `blur(${Math.round(H * 0.04)}px)`;
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.beginPath();
        ctx.ellipse(x, y - H * 0.3, H * 0.13, H * 0.16, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x, y + H * 0.3, H * 0.33, H * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    };
  },

  shiver(api) {
    return {
      theme(th, t) {
        const w = pulse(t, 0.1, 0.25, 1.3, 1.7);
        th.offset[0] += noise1(t * 55, 1) * 0.007 * w;
        th.offset[1] += noise1(t * 55, 2) * 0.004 * w;
      },
      lids: (t) => ({ upper: 0.52, lower: 0.48, tilt: -0.1, w: pulse(t, 0.1, 0.25, 1.3, 1.7) }),
      pupil: (t) => ({ size: 0.25, w: pulse(t, 0.1, 0.25, 1.3, 1.7) }),
    };
  },
});
