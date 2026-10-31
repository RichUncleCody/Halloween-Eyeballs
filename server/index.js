// Halloween Eyeballs server: serves the screens, keeps their clocks in sync,
// and streams the Director's show to them over Server-Sent Events.
// Zero dependencies: just Node's standard library.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Director } from './director.js';
import { loadOrCreateTls, localAddresses } from './tls.js';
import {
  EYES, SPECIALS, QUIRKS, MODES, MOODS, PALETTES, MESSAGES, SPECIAL_MAP, QUIRK_MAP,
} from '../shared/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');

const env = process.env;
const PORT = Number(env.PORT || 8080);
const HTTPS_PORT = env.HTTPS_PORT === undefined ? 8443 : Number(env.HTTPS_PORT);
const DATA_DIR = env.DATA_DIR || path.join(ROOT, 'data');
const TOKEN = env.CONTROL_TOKEN || '';
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// A content hash of everything the browser loads. Screens reload themselves
// when they reconnect to a server running different code.
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p); else h.update(name).update(fs.readFileSync(p));
    }
  };
  walk(PUBLIC); walk(SHARED);
  return `${PKG.version}-${h.digest('hex').slice(0, 10)}`;
})();

// ------------------------------------------------------------------ config
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
function loadConfig() {
  const cfg = {};
  if (env.SPECIAL_MEAN_SECONDS) cfg.specialMean = Number(env.SPECIAL_MEAN_SECONDS);
  if (env.QUIRK_MEAN_SECONDS) cfg.quirkMean = Number(env.QUIRK_MEAN_SECONDS);
  if (env.PALETTE_MINUTES) cfg.chapterMinutes = Number(env.PALETTE_MINUTES);
  if (env.AUTO) cfg.auto = !/^(0|false|no|off)$/i.test(env.AUTO);
  if (env.DISABLED) cfg.disabled = env.DISABLED.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch { /* no saved config yet */ }
  return cfg;
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn('[config] could not save:', err.message);
  }
}

// --------------------------------------------------------------------- SSE
const clients = new Set();
let clientSeq = 0;

function broadcast(ev) {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) {
    if (ev.eye && c.pos !== '*' && c.pos !== ev.eye) continue;
    c.res.write(line);
  }
}

const director = new Director({ send: broadcast, config: loadConfig(), onConfig: saveConfig });

function openStream(req, res, url) {
  const raw = (url.searchParams.get('pos') || '*').toUpperCase();
  const pos = EYES.includes(raw) ? raw : '*';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.socket?.setNoDelay?.(true);
  const client = {
    id: ++clientSeq, res, pos,
    preview: url.searchParams.get('preview') === '1',
    ua: String(req.headers['user-agent'] || '').slice(0, 160),
    ip: req.socket.remoteAddress,
    since: Date.now(),
    status: {},
  };
  clients.add(client);
  res.write('retry: 2000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'hello', build: BUILD, id: client.id, pos, now: Date.now(), state: director.snapshot() })}\n\n`);
  req.on('close', () => clients.delete(client));
}

setInterval(() => {
  for (const c of clients) c.res.write(`: ping ${Date.now()}\n\n`);
}, 15000).unref();

function clientList() {
  return [...clients].map((c) => ({
    id: c.id, pos: c.pos, preview: c.preview, ip: c.ip, ua: c.ua,
    connectedFor: Math.round((Date.now() - c.since) / 1000), status: c.status,
  }));
}

// ------------------------------------------------------------------ static
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}-${BUILD}"`;
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) ? p : null;
}

function notFound(res) { json(res, 404, { error: 'not found' }); }

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch {
        resolve(Object.fromEntries(new URLSearchParams(data)));
      }
    });
    req.on('error', () => resolve({}));
  });
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const h = String(req.headers.authorization || '');
  return h === `Bearer ${TOKEN}` || url.searchParams.get('token') === TOKEN || req.headers['x-control-token'] === TOKEN;
}

const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const eyeList = (v) => {
  if (!v) return EYES;
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((s) => String(s).trim().toUpperCase()).filter((e) => EYES.includes(e));
  return list.length ? list : EYES;
};

// --------------------------------------------------------------------- API
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const route = parts[0] || '';
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Control-Token',
    });
    return res.end();
  }

  if (method === 'GET') {
    switch (route) {
      case 'time': return json(res, 200, { now: Date.now() });
      case 'state': return json(res, 200, { build: BUILD, ...director.status(), clients: clientList() });
      case 'catalog':
        return json(res, 200, { specials: SPECIALS, quirks: QUIRKS, modes: MODES, moods: MOODS, palettes: PALETTES, messages: MESSAGES });
      default:
        return json(res, 405, { error: 'use POST for actions', see: '/api/catalog' });
    }
  }

  if (method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  const body = await readBody(req);
  if (route === 'status') {
    // Screens report their health (fps, wake lock) so the control panel can show it.
    const c = [...clients].find((x) => x.id === Number(body.id));
    if (c) c.status = { ...body, at: Date.now() };
    return json(res, 200, { ok: true });
  }
  if (!authorized(req, url)) return json(res, 401, { error: 'missing or wrong control token' });

  try {
    switch (route) {
      case 'trigger': {
        const id = parts[1] || body.id;
        const params = body.params || {};
        if (Array.isArray(body.words)) params.words = body.words;
        if (typeof body.words === 'string') params.words = body.words.split(/[,\s]+/).filter(Boolean);
        if (body.dur) params.dur = body.dur;
        if (body.eye) params.eye = String(body.eye).toUpperCase();
        if (id === 'random') {
          const d = director.pickSpecial();
          return json(res, 200, { ok: true, fx: director.runSpecial(d.id, params, { manual: true }) });
        }
        if (SPECIAL_MAP[id]) return json(res, 200, { ok: true, fx: director.runSpecial(id, params, { manual: true }) });
        if (QUIRK_MAP[id]) return json(res, 200, { ok: true, quirk: director.runQuirk(id, params, { manual: true }) });
        return json(res, 404, { error: `unknown effect "${id}"`, see: '/api/catalog' });
      }
      case 'stop': return json(res, 200, { ok: true, stopped: director.stopAll() });
      case 'look': {
        const p = Array.isArray(body.to) ? body.to : [num(body.x, 0), num(body.y, 0), num(body.z, 5)];
        return json(res, 200, { ok: true, ...director.look(p, { hold: num(body.hold, 5), ease: body.ease || 'dart', dur: body.dur ? num(body.dur) : undefined, eyes: eyeList(body.eyes) }) });
      }
      case 'blink': return json(res, 200, { ok: true, ...director.blinkNow({ eyes: eyeList(body.eyes), kind: body.kind || 'normal' }) });
      case 'mood': return json(res, 200, { ok: true, ...director.setMood(body.mood || parts[1] || 'neutral', { eyes: eyeList(body.eyes), dur: num(body.dur, 600), hold: num(body.hold, 0) }) });
      case 'mode': {
        const id = body.mode || parts[1];
        if (!MODES.find((m) => m.id === id)) return json(res, 400, { error: 'unknown mode', modes: MODES.map((m) => m.id) });
        director.pickMode(id);
        return json(res, 200, { ok: true, mode: id });
      }
      case 'palette': {
        const spec = body.palette || parts[1] || (body.L || body.C || body.R ? { L: body.L, C: body.C, R: body.R } : null);
        const check = (p) => p == null || typeof p === 'object' || PALETTES[p];
        if (spec && typeof spec === 'string' && !PALETTES[spec]) return json(res, 400, { error: 'unknown palette', palettes: Object.keys(PALETTES) });
        if (spec && typeof spec === 'object' && !EYES.every((e) => check(spec[e]))) return json(res, 400, { error: 'unknown palette', palettes: Object.keys(PALETTES) });
        return json(res, 200, { ok: true, eyes: director.changePalette(spec || undefined) });
      }
      case 'sleep': director.sleep(); return json(res, 200, { ok: true, asleep: true });
      case 'wake': director.wake(); return json(res, 200, { ok: true, asleep: false });
      case 'config': return json(res, 200, { ok: true, config: director.setConfig(body) });
      case 'reload': broadcast({ type: 'reload', at: Date.now() }); return json(res, 200, { ok: true });
      default: return json(res, 404, { error: 'unknown action', see: '/api/catalog' });
    }
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
}

// ------------------------------------------------------------------ router
const PAGES = { '': 'index.html', control: 'control.html', wall: 'wall.html' };

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return notFound(res); }
  const p = decodeURIComponent(url.pathname);

  if (p === '/events') return openStream(req, res, url);
  if (p.startsWith('/api/')) return api(req, res, url);
  if (p === '/healthz') return json(res, 200, { ok: true, build: BUILD, clients: clients.size });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });

  const clean = p.replace(/^\/+|\/+$/g, '');
  if (/^[lcr]$/i.test(clean)) return sendFile(req, res, path.join(PUBLIC, 'eye.html'));
  if (Object.hasOwn(PAGES, clean)) return sendFile(req, res, path.join(PUBLIC, PAGES[clean]));
  if (clean.startsWith('shared/')) {
    const f = safeJoin(SHARED, clean.slice(7));
    return f ? sendFile(req, res, f) : notFound(res);
  }
  const f = safeJoin(PUBLIC, clean);
  return f ? sendFile(req, res, f) : notFound(res);
}

// ------------------------------------------------------------------- start
const server = http.createServer(handle);
server.keepAliveTimeout = 65000;
server.listen(PORT, () => {
  console.log(`🎃 Halloween Eyeballs ${BUILD}`);
  console.log(`   http://localhost:${PORT}/L   /C   /R    control panel: /control   preview: /wall`);
  if (fs.existsSync('/.dockerenv')) console.log(`   (in Docker: use this computer's LAN address, e.g. http://192.168.x.x:${PORT}/)`);
  else for (const a of localAddresses().filter((x) => !x.includes(':'))) console.log(`   http://${a}:${PORT}/`);
});

if (HTTPS_PORT > 0) {
  try {
    const tls = loadOrCreateTls({
      certFile: env.TLS_CERT, keyFile: env.TLS_KEY, dataDir: DATA_DIR,
      extraHosts: (env.TLS_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    const secure = https.createServer({ cert: tls.cert, key: tls.key }, handle);
    secure.keepAliveTimeout = 65000;
    secure.listen(HTTPS_PORT, () => console.log(`   https://localhost:${HTTPS_PORT}/  (cert: ${tls.source})`));
    secure.on('error', (err) => console.warn('[https] disabled:', err.message));
  } catch (err) {
    console.warn('[https] disabled:', err.message);
  }
}

director.start();

function shutdown() {
  director.stop();
  for (const c of clients) c.res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
