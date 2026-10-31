// One screen of the show. /L, /C or /R picks which eye this is.

import { EYES, SPECIAL_MAP, QUIRK_MAP, MESSAGES } from '/shared/catalog.js';
import { EyeRenderer } from './gl.js';
import { Clock } from './clock.js';
import { EyeAnimator, Geometry, softClamp, MAX_YAW, MAX_PITCH } from './eye.js';
import { ThemeState } from './theme.js';
import { FxManager } from './fx/manager.js';
import { REGISTRY } from './fx/registry.js';
import './fx/all.js';
import { Awake } from './wakelock.js';
import { clamp, lerpAngles } from './util.js';

const qs = new URLSearchParams(location.search);
const fromPath = location.pathname.replace(/\//g, '').toUpperCase();
const fromQuery = (qs.get('pos') || '').toUpperCase();
const POS = EYES.includes(fromQuery) ? fromQuery : EYES.includes(fromPath) ? fromPath : 'C';
const PREVIEW = qs.get('preview') === '1';
const EMBEDDED = window !== window.top || qs.get('hud') === '0';
const OFFLINE = qs.get('offline') === '1';
const GAP = Number(qs.get('gap') ?? 0.04);
const SIZE = Number(qs.get('size') ?? 1);
const QUALITY = clamp(Number(qs.get('q') ?? 1), 0.2, 2);
const SEED = { L: 3.71, C: 11.23, R: 23.97 }[POS];
const INNER = { L: 1, C: 0, R: -1 }[POS];

document.title = `👁 ${POS} · Halloween Eyeballs`;

const bg = document.getElementById('bg');
const glc = document.getElementById('gl');
const fxc = document.getElementById('fx');
const hud = document.getElementById('hud');
const dbg = document.getElementById('debug');
const bgx = bg.getContext('2d');
const fxx = fxc.getContext('2d');

const view = { W: innerWidth, H: innerHeight, dpr: 1, eyeScale: 0.78, inner: INNER, offset: [0, 0] };
const geo = new Geometry(POS, innerWidth / innerHeight, GAP);
const anim = new EyeAnimator(POS, geo);
const theme = new ThemeState('amber');
const clock = new Clock();
const fx = new FxManager({ pos: POS, geo, view: () => view, anim });
const awake = new Awake();
const state = { mode: '-', connected: false, clientId: null, build: null, events: 0 };

let renderer;
try {
  renderer = new EyeRenderer(glc);
  renderer.maxPixels *= QUALITY * QUALITY;
  if (PREVIEW) renderer.maxPixels = 0.35e6;
} catch (err) {
  document.getElementById('error').textContent = `😵 ${err.message}`;
  throw err;
}

function layout() {
  view.W = innerWidth;
  view.H = innerHeight;
  view.dpr = Math.min(window.devicePixelRatio || 1, PREVIEW ? 1 : 2);
  const aspect = view.W / view.H;
  geo.set(aspect, GAP);
  view.eyeScale = Math.min(0.8, 0.45 * aspect) * SIZE;
  for (const c of [bg, fxc]) {
    c.width = Math.round(view.W * view.dpr);
    c.height = Math.round(view.H * view.dpr);
  }
}
addEventListener('resize', layout);
layout();
document.fonts?.load('100px Creepster').catch(() => {});

// ------------------------------------------------------------------ events
function onEvent(ev) {
  const now = clock.now();
  state.events++;
  switch (ev.type) {
    case 'hello':
      state.clientId = ev.id;
      if (state.build && ev.build !== state.build) { location.reload(); return; }
      state.build = ev.build;
      applySnapshot(ev.state, now);
      break;
    case 'gaze': case 'blink': case 'lids': case 'pupil': case 'sleep': case 'cancel':
      if (ev.eye && ev.eye !== POS) return;
      anim.push(ev, now);
      break;
    case 'fx': fx.start(ev); break;
    case 'fxEnd': fx.end(ev.key, ev.at); break;
    case 'palette': theme.setPalette(ev.eyes[POS], ev.at, ev.dur, now); break;
    case 'mode': state.mode = ev.mode; anim.lastServer = now; break;
    case 'reload': setTimeout(() => location.reload(), Math.random() * 400); break;
  }
}

function applySnapshot(s, now) {
  if (!s) return;
  state.mode = s.mode;
  anim.snapTo(s.eyes?.[POS] || {}, s.asleep);
  anim.lastServer = now;
  if (s.palette?.[POS]) theme.setPalette(s.palette[POS], now, 1, now);
  const keys = new Set((s.fx || []).map((f) => f.key));
  fx.active = fx.active.filter((a) => keys.has(a.ev.key) || a.ev.key.startsWith('local'));
  for (const f of s.fx || []) fx.start(f);
}

let es = null;
function connect() {
  if (OFFLINE) return;
  es = new EventSource(`/events?pos=${POS}${PREVIEW ? '&preview=1' : ''}`);
  es.onopen = () => { state.connected = true; anim.connected = true; clock.sync(); };
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (err) { console.error(err); } };
  es.onerror = () => {
    state.connected = false;
    anim.connected = false;
    if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(connect, 3000); }
  };
}

if (!OFFLINE) {
  clock.sync().finally(connect);
  setInterval(() => clock.sync(5), 60000);
  setInterval(reportStatus, 10000);
}

function reportStatus() {
  if (!state.clientId) return;
  fetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: state.clientId, pos: POS, fps: Math.round(fps), wake: awake.label,
      size: `${view.W}x${view.H}`, render: `${glc.width}x${glc.height}`, rtt: Math.round(clock.rtt || 0),
    }),
  }).catch(() => {});
}

// ------------------------------------------------------------- local tests
// ?fx=bats plays an effect locally on a loop; &t=4.5 freezes it at 4.5 s.
let localSeq = 0;
function localFx(id, params = {}, at = clock.now() + 150) {
  const def = SPECIAL_MAP[id] || QUIRK_MAP[id];
  if (!def || !REGISTRY[id]) { console.warn('no such effect', id); return null; }
  if (id === 'message' && !params.words) params.words = MESSAGES[localSeq % MESSAGES.length].words;
  if (!params.eye) params.eye = POS;
  const ev = { type: 'fx', kind: 'local', id, key: `local${++localSeq}`, at, dur: Number(params.dur) || def.dur, seed: Number(qs.get('seed') || 1234 + localSeq), params };
  fx.start(ev);
  return ev;
}
window.eyes = { fx: localFx, stop: () => fx.clear(), anim, manager: fx, clock, theme };

const testFx = qs.get('fx');
if (testFx) {
  const freeze = qs.get('t');
  const startAt = clock.now() + 100;
  const ev = localFx(testFx, {}, startAt);
  if (freeze !== null && ev) clock.frozenAt = startAt + Number(freeze) * 1000;
  else if (ev) setInterval(() => { if (!fx.active.length) localFx(testFx); }, 1000);
}
if (qs.get('freeze')) clock.frozenAt = clock.now();
if (qs.has('look')) {
  const [x, y, z] = qs.get('look').split(',').map(Number);
  anim.snapTo({ target: [x || 0, y || 0, z || 5] });
  anim.lastServer = Infinity;
}

// ------------------------------------------------------------------- frame
let last = performance.now();
let fps = 60, slowFor = 0, fastFor = 0, lastDrop = -1e9;
let bgDirty = false, fxDirty = false;

function frame() {
  requestAnimationFrame(frame);
  const pnow = performance.now();
  const dtMs = Math.min(100, pnow - last);
  last = pnow;
  fps += (1000 / Math.max(1, dtMs) - fps) * 0.05;
  adapt(dtMs, pnow);
  clock.tick(dtMs);
  const now = clock.now();
  const dt = dtMs / 1000;

  anim.update(now);
  fx.prune(now);
  const th = theme.build(now);
  let gaze = anim.gaze.slice();
  let raw = false;
  const lids = { ...anim.lids };
  let pupil = anim.pupilOut;
  let forced = 0;
  let noBlink = false;

  const live = [];
  for (const a of fx.active) {
    const t = fx.time(a, now);
    if (t === null) continue;
    live.push([a.inst, t, a.ev.id]);
    const inst = a.inst;
    try {
      inst.update?.(t, dt);
      inst.theme?.(th, t);
      const g = inst.gaze?.(t);
      if (g && g.w > 0) { gaze = lerpAngles(gaze, [g.yaw, g.pitch], clamp(g.w)); if (g.raw) raw = true; }
      const l = inst.lids?.(t);
      if (l && l.w > 0) {
        const w = clamp(l.w);
        for (const k of ['upper', 'lower', 'tilt']) if (l[k] !== undefined) lids[k] += (l[k] - lids[k]) * w;
      }
      const p = inst.pupil?.(t);
      if (p && p.w > 0) pupil += (p.size - pupil) * clamp(p.w);
      const b = inst.blink?.(t);
      if (b != null) forced = Math.max(forced, b);
      if (inst.noBlink) noBlink = true;
    } catch (err) {
      console.error('effect error', a.ev.id, err);
      a.api.cutAt = 0;
    }
  }

  const yaw = raw ? gaze[0] : softClamp(gaze[0], MAX_YAW);
  const pitch = raw ? gaze[1] : softClamp(gaze[1], MAX_PITCH);
  const blink = Math.max(noBlink ? 0 : anim.blinkAmount, forced, anim.sleep);
  const pf = clamp(pitch, -0.6, 0.6);
  view.offset = th.offset;
  view.gaze = [yaw, pitch];
  view.blink = blink;
  view.lids = lids;

  renderer.render({
    ...th,
    time: (now % 3600000) / 1000,
    inner: INNER,
    scale: view.eyeScale,
    gaze: [yaw, pitch],
    upper: Math.max(0.02, lids.upper + 0.42 * pf * th.lidFollow),
    lower: Math.max(0.05, lids.lower - 0.16 * pf * th.lidFollow),
    tilt: lids.tilt,
    blink,
    pupil: clamp(pupil * th.pupilScale, 0.04, 0.98),
    seed: SEED,
  });

  // 2-D layers: under (bg) and over (fx) the eye.
  const d = view.dpr;
  if (bgDirty) { bgx.setTransform(1, 0, 0, 1, 0, 0); bgx.clearRect(0, 0, bg.width, bg.height); bgDirty = false; }
  if (fxDirty) { fxx.setTransform(1, 0, 0, 1, 0, 0); fxx.clearRect(0, 0, fxc.width, fxc.height); fxDirty = false; }
  for (const [inst, t] of live) {
    try {
      if (inst.drawBg) { bgx.setTransform(d, 0, 0, d, 0, 0); bgx.save(); inst.drawBg(bgx, t, dt); bgx.restore(); bgDirty = true; }
      if (inst.draw) { fxx.setTransform(d, 0, 0, d, 0, 0); fxx.save(); inst.draw(fxx, t, dt); fxx.restore(); fxDirty = true; }
    } catch (err) { console.error('draw error', err); }
  }

  if (dbg.style.display === 'block') drawDebug(now, live);
}

// Lower the render resolution if this machine can't keep up.
function adapt(dtMs, pnow) {
  if (dtMs > 23) { slowFor += dtMs; fastFor = 0; } else { fastFor += dtMs; slowFor = Math.max(0, slowFor - dtMs * 0.5); }
  if (slowFor > 2500 && renderer.scale > 0.4) {
    renderer.scale = Math.max(0.4, renderer.scale * 0.85);
    slowFor = 0;
    lastDrop = pnow;
  } else if (fastFor > 20000 && renderer.scale < 1 && pnow - lastDrop > 90000) {
    renderer.scale = Math.min(1, renderer.scale * 1.1);
    fastFor = 0;
  }
}

function drawDebug(now, live) {
  dbg.textContent = [
    `eye ${POS}   ${Math.round(fps)} fps   render ${glc.width}x${glc.height} (x${renderer.scale.toFixed(2)})`,
    `server ${state.connected ? 'connected' : OFFLINE ? 'offline mode' : 'DISCONNECTED'}   rtt ${Math.round(clock.rtt || 0)} ms   events ${state.events}`,
    `mode ${state.mode}   keep-awake: ${awake.label}`,
    `gaze ${view.gaze.map((v) => (v * 57.3).toFixed(1)).join(', ')}°   blink ${view.blink.toFixed(2)}`,
    `fx: ${live.map(([, t, id]) => `${id} ${t.toFixed(1)}s`).join('  ') || '-'}`,
  ].join('\n');
}

requestAnimationFrame(frame);

// ---------------------------------------------------------------- chrome
let hudTimer = 0;
function showHud() {
  if (PREVIEW || EMBEDDED) return;
  hud.innerHTML = `<b>${POS}</b> · ${state.connected ? '● live' : OFFLINE ? 'offline' : '○ connecting…'} · keep-awake: ${awake.label}<br>` +
    `click = fullscreen · D = debug`;
  hud.classList.add('show');
  document.body.classList.remove('idle');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { hud.classList.remove('show'); document.body.classList.add('idle'); }, 6000);
}
addEventListener('mousemove', showHud);
addEventListener('click', () => {
  awake.enable();
  if (!PREVIEW && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
});
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (e.key === 'd' || e.key === 'D') {
    dbg.style.display = dbg.style.display === 'block' ? 'none' : 'block';
  }
  awake.enable();
});
if (!PREVIEW) {
  awake.enable();
  setTimeout(showHud, 800);
}
