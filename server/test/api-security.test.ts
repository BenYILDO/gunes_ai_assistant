import './env.js';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { DATA_DIR } from '../src/config.js';
import { apiRouter } from '../src/api.js';
import { hostGuard, originGuard } from '../src/security.js';
import { meetingDir, SAFE_MEETING_ID } from '../src/meetings/pipeline.js';

// Gerçek sunucudaki ara katmanlarla aynı sırada gerçek bir Express uygulaması (rastgele portta)
const app = express();
let base = '';
let port = 0;
let server: ReturnType<typeof app.listen>;
before(async () => {
  await new Promise<void>((ok) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      app.use(hostGuard(port));
      app.use('/api', originGuard(port));
      app.use(express.json({ limit: '1mb' }));
      app.use('/api', apiRouter());
      base = `http://127.0.0.1:${port}`;
      ok();
    });
  });
});
after(() => server?.close());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });

test('toplantı kimliği: yol geçişi içeren kimlikler reddedilir, UUID ve yerel kimlikler geçer', () => {
  for (const bad of ['..', '../x', '..%2Fx', 'a/b', 'a\\b', '', 'x'.repeat(65), 'a b', 'a\0b', '.']) assert.equal(SAFE_MEETING_ID.test(bad), false, JSON.stringify(bad));
  for (const ok of ['3f1c9a5e-2b7d-4c1a-9e0f-1a2b3c4d5e6f', 'abc_123-DEF']) assert.equal(SAFE_MEETING_ID.test(ok), true, ok);
  assert.throws(() => meetingDir('../../etc'), /Geçersiz/);
  assert.match(meetingDir('3f1c9a5e-2b7d-4c1a-9e0f-1a2b3c4d5e6f'), /meetings/);
});

test('DELETE /meetings/<yol geçişi>: 400 döner ve data klasörü dışındaki dosyaya dokunmaz', async () => {
  const canary = join(DATA_DIR, 'canary-dir');
  mkdirSync(canary, { recursive: true });
  writeFileSync(join(canary, 'dosya.txt'), 'silinmemeli');
  for (const id of ['..%2Fcanary-dir', '..%2F..%2Fcanary-dir', '%2E%2E%2Fcanary-dir']) {
    const r = await fetch(`${base}/api/meetings/${id}`, { method: 'DELETE', headers: { Origin: base } });
    assert.equal(r.status, 400, id);
  }
  assert.equal(existsSync(join(canary, 'dosya.txt')), true);
  // klip ucu da aynı doğrulamadan geçer
  const clip = await fetch(`${base}/api/meetings/..%2Fcanary-dir/clip?b=0&e=1`);
  assert.ok([400, 404].includes(clip.status));
});

test('yeni yazma uçları yabancı Origin ile reddedilir (CSRF)', async () => {
  for (const path of ['/api/pet/feed', '/api/pet/buy', '/api/pet/enable', '/api/pet/place', '/api/pet/event', '/api/meetings/call/decline']) {
    const r = await post(path, { item: 'ball', on: true }, { Origin: 'https://evil.example.com' });
    assert.equal(r.status, 403, path);
  }
});

test('yabancı Host (DNS rebinding) reddedilir', async () => {
  // fetch Host başlığını değiştirmeye izin vermez; ham http ile gönderilir
  const status = await new Promise<number>((ok, no) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/pet', headers: { Host: 'evil.example.com' } }, (res) => {
      res.resume();
      ok(res.statusCode ?? 0);
    });
    req.on('error', no);
    req.end();
  });
  assert.equal(status, 403);
});

test('pet uçları: bozuk/kötü niyetli girdiler hata verir, çökertmez, veri bozmaz', async () => {
  assert.equal((await post('/api/pet/enable', { on: true })).status, 200);
  const before = await (await fetch(`${base}/api/pet`)).json();
  const bad: [string, unknown][] = [
    ['/api/pet/buy', { item: '__proto__' }],
    ['/api/pet/buy', { item: 'constructor' }],
    ['/api/pet/buy', { item: { toString: 1 } }],
    ['/api/pet/buy', {}],
    ['/api/pet/place', { item: 'ball', x: 'abc', b: null }],
    ['/api/pet/place', { item: 'house', x: 1e308, b: -1e308 }],
    ['/api/pet/place', { item: '__proto__', x: 0.5, b: 0.5 }],
    ['/api/pet/equip', { item: 'bowl', on: true }],
    ['/api/pet/species', { species: 'ejderha', buy: true }],
    ['/api/pet/unplace', { item: 'bowl' }],
    ['/api/pet/name', { name: { a: 1 } }],
    ['/api/pet/name', { name: '<img src=x onerror=alert(1)>'.repeat(10) }],
  ];
  for (const [path, body] of bad) {
    const r = await post(path, body);
    assert.ok(r.status < 500, `${path} ${JSON.stringify(body)} → ${r.status}`);
  }
  // sayaç olayı: tek çağrıda en çok 50 sayılır (dev sayı gönderilse de)
  const ev = await (await post('/api/pet/event', { kind: 'play', count: 1e9 })).json();
  assert.ok(ev.stats.plays - before.stats.plays <= 50);
  const after = await (await fetch(`${base}/api/pet`)).json();
  // yalnızca sayaç olayının açabileceği tek seferlik rozet ödülleri (en çok 20 puan) olabilir; satın alma/yerleştirme puan kazandırmaz
  assert.ok(after.coins - before.coins <= 20, `puan ${before.coins} → ${after.coins}`);
  assert.deepEqual(after.owned, before.owned);
  assert.ok(after.name.length <= 20); // ad kırpıldı
  assert.ok(after.stats.plays <= 50); // sayaç tek seferde sınırlı artar
  for (const p of after.placed) assert.ok(p.x >= 0 && p.x <= 1 && p.b >= 0 && p.b <= 1);
});

test('özellik kapalıyken pet uçları kazanç ve mağaza vermez', async () => {
  assert.equal((await post('/api/pet/enable', { on: false })).status, 200);
  const buy = await post('/api/pet/buy', { item: 'ball' });
  assert.equal(buy.status, 400);
  const coins0 = (await (await fetch(`${base}/api/pet`)).json()).coins;
  const feed = await (await post('/api/pet/feed', {})).json();
  assert.equal(feed.fed, false);
  assert.equal((await post('/api/pet/visit', {})).status, 200);
  assert.equal((await (await fetch(`${base}/api/pet`)).json()).coins, coins0); // kapalıyken hiçbir şey kazanılmaz
});
