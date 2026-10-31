import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPECIALS, QUIRKS, MOODS, PALETTES } from '../shared/catalog.js';
import { SERVER_QUIRKS } from '../server/director.js';

const fxDir = path.resolve(import.meta.dirname, '../public/js/fx');
const source = fs.readdirSync(fxDir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(fxDir, f), 'utf8')).join('\n');
const implemented = (id) => new RegExp(`^\\s+${id}\\(api\\) \\{`, 'm').test(source);

test('every special has a renderer', () => {
  for (const s of SPECIALS) assert.ok(implemented(s.id), `no client implementation for special "${s.id}"`);
});

test('every quirk is implemented on the server or the screens', () => {
  for (const q of QUIRKS) {
    if (q.kind === 'fx') assert.ok(implemented(q.id), `no client implementation for quirk "${q.id}"`);
    else assert.ok(SERVER_QUIRKS.includes(q.id), `no server implementation for quirk "${q.id}"`);
  }
});

test('ids are unique and entries are well formed', () => {
  const ids = [...SPECIALS, ...QUIRKS].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of [...SPECIALS, ...QUIRKS]) {
    assert.ok(s.title && s.emoji && s.dur > 0 && s.weight > 0, s.id);
  }
  for (const m of Object.values(MOODS)) assert.ok(m.upper > 0 && m.lower > 0);
  for (const p of Object.values(PALETTES)) assert.equal(p.irisA.length, 3);
});
