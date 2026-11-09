import test from 'node:test';
import assert from 'node:assert/strict';
import { arcPoint, easeInOut, facingOf, jumpHeight, perchTarget, pickCard, strollTarget, usableCard, walkSeconds } from '../src/lib/petMotion.ts';

const vp = { w: 1280, h: 800 };

test('yürüme süresi mesafeyle orantılı, en az 0,4 sn', () => {
  assert.equal(walkSeconds(150, 75), 2);
  assert.equal(walkSeconds(-150, 75), 2);
  assert.equal(walkSeconds(1, 75), 0.4);
});
test('yay: uçlar tam hedefte, ortada yukarıda', () => {
  const a = { x: 0, y: 300 };
  const b = { x: 200, y: 100 };
  assert.deepEqual(arcPoint(a, b, 0, 80), { x: 0, y: 300 });
  const end = arcPoint(a, b, 1, 80);
  assert.ok(Math.abs(end.x - 200) < 1e-9 && Math.abs(end.y - 100) < 1e-9);
  const mid = arcPoint(a, b, 0.5, 80);
  assert.ok(mid.y < (300 + 100) / 2 - 70); // doğrusal ortadan en az ~80 px yukarıda
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
});
test('zıplama yüksekliği sınırlı', () => {
  assert.ok(jumpHeight(0, 0) >= 50);
  assert.equal(jumpHeight(5000, 5000), 140);
});
test('kartın üstüne konma: kenardan taşmaz, ayaklar kartın üst kenarına gömülü', () => {
  const card = { left: 400, top: 300, width: 320, height: 90 };
  const t = perchTarget(card, 128, 120, vp, 8, 0.5);
  assert.equal(t.y, 300 - 120 + 8);
  assert.ok(t.x >= 400 && t.x + 128 <= 720);
  assert.equal(perchTarget(card, 128, 120, vp, 8, 0).x, 400);
  assert.equal(perchTarget(card, 128, 120, vp, 8, 1).x, 720 - 128);
  // kart kediden dar ise kartın soluna oturur, negatif olmaz
  assert.ok(perchTarget({ left: 10, top: 300, width: 100, height: 80 }, 128, 120, vp).x >= 0);
});
test('kullanılabilir kart: görünür, yeterince geniş', () => {
  assert.equal(usableCard({ left: 20, top: 300, width: 300, height: 80 }, vp), true);
  assert.equal(usableCard({ left: 20, top: 40, width: 300, height: 80 }, vp), false); // üst çubuğun altında
  assert.equal(usableCard({ left: 20, top: 790, width: 300, height: 80 }, vp), false); // ekran dışı
  assert.equal(usableCard({ left: 20, top: 300, width: 90, height: 80 }, vp), false); // dar
});
test('kart seçimi: mevcut kart hariç; aday yoksa null', () => {
  const c = (id: string, top: number) => ({ id, rect: { left: 30, top, width: 300, height: 80 } });
  assert.equal(pickCard([c('a', 300), c('b', 400)], vp, 'a', () => 0)?.id, 'b');
  assert.equal(pickCard([c('a', 300)], vp, 'a'), null);
  assert.equal(pickCard([c('a', 20)], vp, null), null);
});
test('gezinme hedefi: yeterince uzak; bakış yönü', () => {
  assert.ok(Math.abs(strollTarget(500, 0, 1000, () => 0.52) - 500) >= 120);
  assert.equal(strollTarget(100, 0, 1000, () => 0.05), 1000); // hep yakın düşerse uzak uca gider
  assert.equal(facingOf(0, 100), 1);
  assert.equal(facingOf(100, 0), -1);
  assert.equal(facingOf(100, 101, -1), -1);
});

import { alongOf, dropTarget } from '../src/lib/petMotion.ts';
test('yüzey üstündeki yatay konum 0..1', () => {
  const r = { left: 100, top: 300, width: 328, height: 80 };
  assert.equal(alongOf(r, 100, 128), 0);
  assert.equal(alongOf(r, 300, 128), 1);
  assert.equal(alongOf(r, 200, 128), 0.5);
  assert.equal(alongOf(r, 0, 128), 0);
  assert.equal(alongOf({ left: 0, top: 0, width: 100, height: 10 }, 0, 128), 0.5);
});
test('bırakma hedefi: kartın içine bırakılırsa kart, çizgiye yakınsa kenar, havadaysa null', () => {
  const card = { kind: 'card' as const, rect: { left: 100, top: 300, width: 200, height: 90 } };
  const edge = { kind: 'edge' as const, rect: { left: 50, top: 200, width: 600, height: 120 } };
  const S = [edge, card];
  assert.equal(dropTarget(S, { left: 136, top: 300, W: 128, H: 120 })?.kind, 'card'); // ortası kartın içinde
  assert.equal(dropTarget(S, { left: 300, top: 100, W: 128, H: 120 })?.kind, 'edge'); // ayakları (220) kenara (200) yakın
  assert.equal(dropTarget(S, { left: 300, top: 0, W: 128, H: 120 }), null); // 120 uzakta
  assert.equal(dropTarget(S, { left: 700, top: 100, W: 128, H: 120 }), null); // yatayda dışında
});

import { patrolFacing } from '../src/lib/petMotion.ts';
test('çizgide gezinme: sola gidilirken sola, sağa gidilirken sağa döner', () => {
  assert.equal(patrolFacing(0.8, 0.2, 400, 1), -1);
  assert.equal(patrolFacing(0.2, 0.8, 400, -1), 1);
  assert.equal(patrolFacing(0.5, 0.5, 400, -1), -1); // yerinde durunca yön korunur
  assert.equal(patrolFacing(0.5, 0.505, 400, 1), 1); // çok kısa mesafede yön değişmez
});
