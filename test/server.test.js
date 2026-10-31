import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyes-'));
  proc = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), HTTPS_PORT: '0', DATA_DIR: dataDir },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/healthz`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => proc?.kill());

test('serves the eye pages and assets', async () => {
  for (const p of ['/L', '/c', '/R/', '/', '/control', '/wall', '/js/main.js', '/shared/catalog.js', '/fonts/Creepster-Regular.ttf']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
  }
  const html = await (await fetch(`${base}/L`)).text();
  assert.match(html, /js\/main\.js/);
});

test('blocks path traversal', async () => {
  for (const p of ['/..%2fserver%2findex.js', '/shared/..%2f..%2fpackage.json', '/js/../../server/index.js']) {
    const r = await fetch(base + p);
    assert.notEqual(r.status, 200, p);
  }
});

test('time, catalog, state', async () => {
  const t = await (await fetch(`${base}/api/time`)).json();
  assert.ok(Math.abs(t.now - Date.now()) < 5000);
  const c = await (await fetch(`${base}/api/catalog`)).json();
  assert.ok(c.specials.length >= 30);
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.ok(s.mode && s.config && Array.isArray(s.clients));
});

test('streams the show over SSE and accepts triggers', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/events?pos=L`, { signal: ctrl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = res.body.getReader();
  const seen = [];
  let buf = '';
  const triggered = fetch(`${base}/api/trigger/bats`, { method: 'POST' }).then((r) => r.json());
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !(seen.includes('hello') && seen.includes('fx'))) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      seen.push(ev.type);
      if (ev.eye) assert.equal(ev.eye, 'L', 'per-eye events are filtered to this screen');
    }
  }
  ctrl.abort();
  assert.ok((await triggered).ok);
  assert.ok(seen.includes('hello'), 'got hello');
  assert.ok(seen.includes('fx'), 'got the triggered effect');
});

test('rejects unknown effects and bad input', async () => {
  let r = await fetch(`${base}/api/trigger/definitely-not`, { method: 'POST' });
  assert.equal(r.status, 404);
  r = await fetch(`${base}/api/mood`, { method: 'POST', body: JSON.stringify({ mood: 'nope' }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 400);
  r = await fetch(`${base}/api/trigger/bats`);
  assert.equal(r.status, 405);
});

test('look, mood, palette, config, sleep/wake', async () => {
  const post = (p, b = {}) => fetch(base + p, { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } });
  assert.equal((await post('/api/look', { x: 2, y: 0, z: 4, hold: 2 })).status, 200);
  assert.equal((await post('/api/mood', { mood: 'angry', hold: 2 })).status, 200);
  assert.equal((await post('/api/palette', { palette: 'violet' })).status, 200);
  assert.equal((await post('/api/palette', { palette: 'plaid' })).status, 400);
  const c = await (await post('/api/config', { specialMean: 120 })).json();
  assert.equal(c.config.specialMean, 120);
  assert.equal((await post('/api/sleep')).status, 200);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).asleep, true);
  assert.equal((await post('/api/wake')).status, 200);
});
