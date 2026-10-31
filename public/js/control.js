// Control panel: everything here goes through the same HTTP API you can
// call from scripts, Home Assistant, a Stream Deck, etc.

const $ = (s) => document.querySelector(s);
const tokenInput = $('#token');
tokenInput.value = localStorage.getItem('eyeballs-token') || '';
tokenInput.addEventListener('change', () => localStorage.setItem('eyeballs-token', tokenInput.value));

let catalog = null;
let state = null;

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = err ? 'show err' : 'show';
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.className = ''; }, 1800);
}

async function post(url, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tokenInput.value) headers.Authorization = `Bearer ${tokenInput.value}`;
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || `Error ${r.status}`, true); return null; }
    refresh();
    return j;
  } catch (err) {
    toast('Server unreachable', true);
    return null;
  }
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function fxButton(item, kind) {
  const cb = el('input', { type: 'checkbox', title: 'Include in auto rotation' });
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    const disabled = new Set(state.config.disabled);
    if (cb.checked) disabled.delete(item.id); else disabled.add(item.id);
    post('/api/config', { disabled: [...disabled] });
  });
  const b = el('button', { class: 'fxbtn', 'data-id': item.id, title: `${item.title} (${item.dur}s)`, onclick: async () => {
    const r = await post(`/api/trigger/${item.id}`);
    if (r) toast(`${item.emoji} ${item.title}`);
  } }, el('span', { class: 'e' }, item.emoji), el('span', {}, item.title), cb);
  b._cb = cb;
  return b;
}

async function init() {
  catalog = await (await fetch('/api/catalog')).json();
  const sp = $('#specials');
  for (const s of catalog.specials) sp.append(fxButton(s, 'special'));
  const q = $('#quirks');
  for (const s of catalog.quirks) q.append(fxButton(s, 'quirk'));
  const moods = $('#moods');
  for (const m of Object.keys(catalog.moods)) {
    moods.append(el('button', { onclick: () => post('/api/mood', { mood: m, hold: 20 }).then((r) => r && toast(`Mood: ${m} (20 s)`)) }, m));
  }
  const modes = $('#modes');
  for (const m of catalog.modes) modes.append(el('button', { 'data-mode': m.id, onclick: () => post('/api/mode', { mode: m.id }) }, m.title));
  const pals = $('#palettes');
  for (const [id, p] of Object.entries(catalog.palettes)) {
    const sw = el('span', { class: 'swatch' });
    const c = (v) => `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`;
    sw.style.background = `radial-gradient(${c(p.irisA)}, ${c(p.irisB)})`;
    pals.append(el('button', { onclick: () => post('/api/palette', { palette: id }) }, sw, p.title));
  }
  pals.append(el('button', { onclick: () => post('/api/palette', {}) }, '🎲 Surprise'));
  await refresh();
  setInterval(refresh, 2000);
}

function fmtAgo(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}
function fmtIn(s) { return s <= 0 ? 'any moment' : s < 90 ? `${s}s` : `${Math.round(s / 60)} min`; }

async function refresh() {
  try {
    state = await (await fetch('/api/state', { cache: 'no-store' })).json();
  } catch {
    $('#screens').innerHTML = '<p>⚠️ Server unreachable</p>';
    return;
  }
  const scr = $('#screens');
  scr.innerHTML = '';
  for (const pos of ['L', 'C', 'R']) {
    const cs = state.clients.filter((c) => c.pos === pos && !c.preview);
    const st = cs[0]?.status || {};
    scr.append(el('div', { class: `scr ${cs.length ? 'up' : 'down'}` },
      el('b', {}, pos),
      el('small', {}, cs.length ? `${cs.length > 1 ? cs.length + ' screens · ' : ''}${st.fps ? st.fps + ' fps' : 'connected'}` : 'not connected'),
      el('small', {}, cs.length ? `keep-awake: ${st.wake || '?'}` : ''),
    ));
  }
  const active = state.active.filter((a) => a.kind === 'special')[0];
  const rows = [
    ['Now', active ? `${(catalog.specials.find((s) => s.id === active.id) || {}).emoji || ''} ${active.id} (${active.endsIn}s left)` : state.asleep ? '😴 asleep' : 'ambient'],
    ['Gaze mode', `${state.mode} (${state.modeEndsIn}s)`],
    ['Next special', state.config.auto ? fmtIn(state.nextSpecialIn) : 'auto off'],
    ['Next quirk', state.config.auto ? fmtIn(state.nextQuirkIn) : 'auto off'],
    ['Palette', [...new Set(Object.values(state.palette).map((p) => (typeof p === 'string' ? p : 'custom')))].join(' / ')],
    ['Uptime', `${Math.floor(state.uptime / 3600)}h ${Math.floor((state.uptime % 3600) / 60)}m`],
  ];
  const dl = $('#statusList');
  dl.innerHTML = '';
  for (const [k, v] of rows) dl.append(el('dt', {}, k), el('dd', {}, v));

  const disabled = new Set(state.config.disabled);
  for (const b of document.querySelectorAll('.fxbtn')) {
    const id = b.dataset.id;
    b._cb.checked = !disabled.has(id);
    b.classList.toggle('off', disabled.has(id));
    b.classList.toggle('playing', state.active.some((a) => a.id === id));
  }
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === state.mode);
  $('#sleepBtn').textContent = state.asleep ? '⏰ Wake up' : '😴 Sleep';

  const f = $('#cfgForm');
  if (!f.contains(document.activeElement)) {
    f.auto.checked = state.config.auto;
    f.specialMean.value = state.config.specialMean;
    f.quirkMean.value = state.config.quirkMean;
    f.chapterMinutes.value = state.config.chapterMinutes;
  }

  const h = $('#history');
  h.innerHTML = '';
  for (const e of state.history.slice(0, 24)) {
    const it = (catalog.specials.find((s) => s.id === e.id) || catalog.quirks.find((s) => s.id === e.id));
    h.append(el('li', {}, el('b', {}, `${it ? it.emoji + ' ' + it.title : e.id}`), ` · ${e.kind}${e.manual ? ' (manual)' : ''} · ${fmtAgo(e.t)}`));
  }
}

// generic POST buttons
for (const b of document.querySelectorAll('[data-post]')) {
  b.addEventListener('click', () => {
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    post(b.dataset.post).then((r) => r && toast(b.textContent.trim()));
  });
}
$('#sleepBtn').addEventListener('click', () => post(state?.asleep ? '/api/wake' : '/api/sleep'));

$('#msgForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const words = [f.L.value, f.C.value, f.R.value].map((w) => w.trim());
  post('/api/trigger/message', words.some(Boolean) ? { words } : {}).then((r) => r && toast('🩸 Writing on the wall'));
});

$('#cfgForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  post('/api/config', {
    auto: f.auto.checked, specialMean: Number(f.specialMean.value), quirkMean: Number(f.quirkMean.value), chapterMinutes: Number(f.chapterMinutes.value),
  }).then((r) => r && toast('Saved'));
});

// gaze pad: top-down view of the room, monitors along the top edge
const pad = $('#pad'), dot = $('#dot');
let lastLook = 0;
function lookFromEvent(e, force) {
  const r = pad.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  dot.style.display = 'block';
  dot.style.left = `${px * 100}%`;
  dot.style.top = `${py * 100}%`;
  const now = performance.now();
  if (!force && now - lastLook < 120) return;
  lastLook = now;
  const x = (px - 0.5) * 22, z = Math.max(0.6, py * 14);
  post('/api/look', { x, y: Number($('#lookY').value), z, hold: Number($('#lookHold').value) || 6, ease: force ? 'dart' : 'track' });
}
let dragging = false;
pad.addEventListener('pointerdown', (e) => { dragging = true; pad.setPointerCapture(e.pointerId); lookFromEvent(e, true); });
pad.addEventListener('pointermove', (e) => { if (dragging) lookFromEvent(e, false); });
pad.addEventListener('pointerup', () => { dragging = false; });

$('#previewBtn').addEventListener('click', () => {
  const p = $('#preview');
  if (p.firstChild) { p.innerHTML = ''; $('#previewBtn').textContent = 'Show'; return; }
  p.append(el('iframe', { src: '/wall', title: 'preview' }));
  $('#previewBtn').textContent = 'Hide';
});

init();
