import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../server/director.js';
import { EYES, SPECIALS, QUIRKS, PALETTES, MODES, MOODS, LEAD_MS } from '../shared/catalog.js';
import { mulberry32 } from '../public/js/util.js';

function make(config = {}) {
  let t = 1_000_000;
  const events = [];
  const d = new Director({ send: (e) => events.push(e), config, random: mulberry32(42), now: () => t });
  return { d, events, advance: (ms) => { t += ms; }, now: () => t };
}

const validEvent = (e, now) => {
  assert.ok(typeof e.type === 'string');
  assert.ok(Number.isFinite(e.at), `at is a number for ${e.type}`);
  assert.ok(e.at >= now, `${e.type} scheduled in the past`);
  if (e.eye !== undefined) assert.ok(EYES.includes(e.eye), `bad eye ${e.eye}`);
  if (e.type === 'gaze') {
    assert.equal(e.to.length, 3);
    assert.ok(e.to.every(Number.isFinite));
    assert.ok(e.dur > 0);
    assert.ok(['dart', 'glide', 'linear'].includes(e.ease));
  }
  if (e.type === 'lids') for (const k of ['upper', 'lower', 'tilt']) assert.ok(Number.isFinite(e[k]));
  if (e.type === 'pupil') assert.ok(e.size > 0 && e.size < 1);
};

test('every gaze mode produces gaze events for every eye', () => {
  for (const m of MODES) {
    const { d, events, now, advance } = make();
    d.mode = m.id;
    for (let i = 0; i < 12; i++) { const wait = d.modeStep(now() + LEAD_MS); assert.ok(wait > 0); advance(wait); }
    const gz = events.filter((e) => e.type === 'gaze');
    for (const e of EYES) assert.ok(gz.some((g) => g.eye === e), `${m.id}: eye ${e} never moved`);
    for (const e of events) validEvent(e, 1_000_000);
  }
});

test('every quirk runs and emits valid events', () => {
  for (const q of QUIRKS) {
    const { d, events, now } = make();
    const r = d.runQuirk(q.id);
    assert.ok(r.dur > 0, q.id);
    assert.ok(events.length > 0, `${q.id} emitted nothing`);
    for (const e of events) validEvent(e, now());
  }
});

test('specials are announced ahead of time with seed and duration', () => {
  for (const s of SPECIALS) {
    const { d, events, now } = make();
    const fx = d.runSpecial(s.id);
    assert.equal(fx.type, 'fx');
    assert.equal(fx.id, s.id);
    assert.equal(fx.dur, s.dur);
    assert.ok(fx.at >= now() + LEAD_MS - 1);
    assert.ok(Number.isInteger(fx.seed));
    assert.ok(events.includes(fx));
    assert.ok(d.busyUntil >= fx.at + s.dur * 1000);
  }
});

test('message special gets three upper-case words', () => {
  const { d } = make();
  const fx = d.runSpecial('message', { words: ['happy', 'birthday', 'sam'] });
  assert.deepEqual(fx.params.words, ['HAPPY', 'BIRTHDAY', 'SAM']);
  const auto = d.runSpecial('message');
  assert.equal(auto.params.words.length, 3);
});

test('starting a special ends the previous one', () => {
  const { d, events } = make();
  const a = d.runSpecial('bats');
  d.runSpecial('ghost');
  assert.ok(events.some((e) => e.type === 'fxEnd' && e.key === a.key));
  assert.equal(d.fx.length, 1);
});

test('auto picker respects disabled list and avoids repeats', () => {
  const { d, advance } = make({ disabled: ['bats', 'ghost'] });
  const seen = [];
  for (let i = 0; i < 200; i++) {
    const s = d.pickSpecial();
    assert.ok(!['bats', 'ghost'].includes(s.id));
    d.runSpecial(s.id);
    seen.push(s.id);
    advance(60_000);
  }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], 'immediate repeat');
  // Within any window of 10 picks there are no duplicates (recency exclusion).
  for (let i = 0; i + 10 <= seen.length; i++) assert.equal(new Set(seen.slice(i, i + 10)).size, 10);
  assert.ok(new Set(seen).size >= SPECIALS.length - 2 - 1, 'variety over time');
});

test('config is clamped and validated', () => {
  const { d } = make();
  const c = d.setConfig({ specialMean: 1, quirkMean: 99999, auto: false, disabled: ['x', 3] });
  assert.equal(c.specialMean, 20);
  assert.equal(c.quirkMean, 3600);
  assert.equal(c.auto, false);
  assert.deepEqual(c.disabled, ['x']);
});

test('palettes, moods, look, sleep and wake', () => {
  const { d, events, now } = make();
  const eyes = d.changePalette();
  for (const e of EYES) assert.ok(PALETTES[eyes[e]]);
  assert.ok(events.some((e) => e.type === 'palette'));
  d.changePalette('ice');
  assert.deepEqual(d.palette, { L: 'ice', C: 'ice', R: 'ice' });
  d.setMood('angry');
  assert.deepEqual(d.eyes.L.lids, MOODS.angry);
  assert.throws(() => d.setMood('nope'));
  d.look([1, 0, 4], { hold: 3 });
  assert.ok(d.gazeHoldUntil > now());
  d.sleep();
  assert.equal(d.asleep, true);
  assert.ok(events.some((e) => e.type === 'sleep' && e.asleep === true));
  d.wake();
  assert.equal(d.asleep, false);
  for (const e of events) validEvent(e, now());
});

test('snapshot lists active effects for late joiners', () => {
  const { d } = make();
  d.runSpecial('storm');
  const s = d.snapshot();
  assert.equal(s.fx.length, 1);
  assert.equal(s.fx[0].id, 'storm');
  for (const e of EYES) assert.ok(s.eyes[e].target);
});
