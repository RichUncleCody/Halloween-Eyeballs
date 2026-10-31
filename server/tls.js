// Minimal self-signed certificate generator (no dependencies).
//
// Browsers only allow the Screen Wake Lock API (keeps the display awake) on
// "secure" pages: https:// or http://localhost. When screens load the show from
// another machine over plain http, serving https with a self-signed cert lets
// them click through the warning once and get a secure context.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const octets = (buf) => tlv(0x04, buf);
const bits = (buf) => tlv(0x03, Buffer.concat([Buffer.from([0]), buf]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const explicit = (n, body) => tlv(0xa0 | n, body);
const implicit = (n, buf) => tlv(0x80 | n, buf);

function integer(buf) {
  let b = Buffer.from(buf);
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(dotted) {
  const parts = dotted.split('.').map(Number);
  const out = [40 * parts[0] + parts[1]];
  for (const p of parts.slice(2)) {
    const stack = [p & 0x7f];
    let v = Math.floor(p / 128);
    while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

function time(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const rest = pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  return y < 2050 ? tlv(0x17, Buffer.from(String(y).slice(2) + rest)) : tlv(0x18, Buffer.from(String(y) + rest));
}

function ipBytes(ip) {
  if (ip.includes(':')) {
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    return Buffer.from(groups.flatMap((g) => { const v = parseInt(g || '0', 16); return [v >> 8, v & 0xff]; }));
  }
  return Buffer.from(ip.split('.').map(Number));
}

export function createSelfSigned({ commonName = 'halloween-eyeballs', hosts = [], ips = [], days = 397 } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const sigAlg = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const name = seq(set(seq(oid('2.5.4.3'), utf8(commonName))));
  const notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  const notAfter = new Date(notBefore.getTime() + days * 24 * 3600 * 1000);
  const dns = [...new Set(['localhost', ...hosts])];
  const ipList = [...new Set(['127.0.0.1', '::1', ...ips])];
  const san = seq(
    ...dns.map((h) => implicit(2, Buffer.from(h, 'ascii'))),
    ...ipList.map((ip) => implicit(7, ipBytes(ip))),
  );
  const extensions = seq(
    seq(oid('2.5.29.17'), octets(san)),                                   // subjectAltName
    seq(oid('2.5.29.19'), octets(seq())),                                 // basicConstraints CA:false
    seq(oid('2.5.29.37'), octets(seq(oid('1.3.6.1.5.5.7.3.1')))),         // extKeyUsage serverAuth
  );
  const serial = crypto.randomBytes(12);
  serial[0] &= 0x7f;
  const tbs = seq(
    explicit(0, integer(Buffer.from([2]))),
    integer(serial),
    sigAlg,
    name,
    seq(time(notBefore), time(notAfter)),
    name,
    spki,
    explicit(3, extensions),
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, sigAlg, bits(signature));
  const b64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (!a.internal) out.push(a.address);
  }
  return out;
}

// Load cert/key from disk, or generate (and cache) a self-signed pair.
export function loadOrCreateTls({ certFile, keyFile, dataDir, extraHosts = [] }) {
  if (certFile && keyFile) {
    return { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile), source: certFile };
  }
  const hosts = extraHosts.filter((h) => !/^[\d.:]+$/.test(h));
  const ips = [...localAddresses(), ...extraHosts.filter((h) => /^[\d.:]+$/.test(h))];
  const dir = dataDir && ensureDir(dataDir) ? dataDir : null;
  const cPath = dir && path.join(dir, 'selfsigned-cert.pem');
  const kPath = dir && path.join(dir, 'selfsigned-key.pem');
  if (cPath && fs.existsSync(cPath) && fs.existsSync(kPath)) {
    try {
      const cert = fs.readFileSync(cPath);
      const x = new crypto.X509Certificate(cert);
      const names = x.subjectAltName || '';
      const covered = hosts.every((h) => names.includes(`DNS:${h}`));
      if (new Date(x.validTo) > new Date(Date.now() + 7 * 864e5) && covered) {
        return { cert, key: fs.readFileSync(kPath), source: cPath };
      }
    } catch { /* regenerate */ }
  }
  const pair = createSelfSigned({ hosts, ips });
  if (cPath) {
    try {
      fs.writeFileSync(cPath, pair.cert);
      fs.writeFileSync(kPath, pair.key, { mode: 0o600 });
    } catch { /* read-only volume: fine, just not cached */ }
  }
  return { ...pair, source: cPath || 'memory' };
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; }
}
