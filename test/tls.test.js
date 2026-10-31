import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import https from 'node:https';
import { createSelfSigned } from '../server/tls.js';

test('generates a certificate Node can parse and serve', async () => {
  const { cert, key } = createSelfSigned({ hosts: ['eyes.local'], ips: ['10.1.2.3'] });
  const x = new crypto.X509Certificate(cert);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.match(x.subjectAltName, /DNS:eyes\.local/);
  assert.match(x.subjectAltName, /IP Address:10\.1\.2\.3/);
  assert.ok(x.verify(x.publicKey), 'self-signature verifies');
  assert.ok(new Date(x.validTo) > new Date(Date.now() + 300 * 864e5));

  const server = https.createServer({ cert, key }, (req, res) => res.end('boo'));
  await new Promise((r) => server.listen(0, r));
  const body = await new Promise((resolve, reject) => {
    https.get({ port: server.address().port, rejectUnauthorized: false }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b));
    }).on('error', reject);
  });
  server.close();
  assert.equal(body, 'boo');
});
