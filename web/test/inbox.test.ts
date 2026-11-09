import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNudge, hideUntil, inQuietHours, isHidden, prepFor, pruneHidden, shouldPopup, untilText } from '../src/lib/inbox.ts';

test('önem: acil/gecikme high, toplantı meeting, diğeri normal', () => {
  assert.equal(classifyNudge('Acil: Ahmet Bey dönüş bekliyor'), 'high');
  assert.equal(classifyNudge('Sipariş gecikti'), 'high');
  assert.equal(classifyNudge('Toplantı hazırlığı · 15:30 Daily Scrum'), 'meeting');
  assert.equal(classifyNudge('Toplantı özeti · IFF'), 'meeting');
  assert.equal(classifyNudge('Bir fikrim var'), 'normal');
  assert.equal(classifyNudge('Merhaba', 'Bu iş kritik, bugün bitmeli'), 'high');
});

test('sessiz saatler: aynı gün ve gece yarısını aşan aralık', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m);
  assert.equal(inQuietHours(at(12), '12:00', '14:00'), true);
  assert.equal(inQuietHours(at(14), '12:00', '14:00'), false);
  assert.equal(inQuietHours(at(23), '22:00', '08:00'), true);
  assert.equal(inQuietHours(at(3), '22:00', '08:00'), true);
  assert.equal(inQuietHours(at(8), '22:00', '08:00'), false);
  assert.equal(inQuietHours(at(15), '22:00', '08:00'), false);
  assert.equal(inQuietHours(at(10), '09:00', '09:00'), false);
});

test('popup: önemli her zaman, diğerleri yalnız sessiz değilken', () => {
  assert.equal(shouldPopup('high', { hours: true, call: true }), true);
  assert.equal(shouldPopup('normal', { hours: true, call: false }), false);
  assert.equal(shouldPopup('meeting', { hours: false, call: true }), false);
  assert.equal(shouldPopup('normal', { hours: false, call: false }), true);
});

test('hazırlık nudge eşleşmesi', () => {
  const list = [{ title: 'Bir fikrim var' }, { title: 'Toplantı hazırlığı · 15:30 Daily Scrum' }];
  assert.equal(prepFor(list, 'Daily Scrum')?.title, list[1]!.title);
  assert.equal(prepFor(list, 'Bütçe'), null);
  assert.equal(prepFor(list, ''), null);
});

test('kalan süre metni', () => {
  const now = 1_000_000;
  assert.equal(untilText(now, now), 'şimdi');
  assert.equal(untilText(now - 60_000, now), 'şimdi');
  assert.equal(untilText(now + 20_000, now), 'şimdi');
  assert.equal(untilText(now + 5 * 60_000, now), '5 dk sonra');
  assert.equal(untilText(now + 65 * 60_000, now), '1 sa 5 dk sonra');
  assert.equal(untilText(now + 120 * 60_000, now), '2 sa sonra');
});

test('gizleme: ertelenen süre dolunca geri gelir, silinenler temizlenir', () => {
  let h = hideUntil({}, 'a', 5000);
  h = hideUntil(h, 'b');
  assert.equal(isHidden(h, 'a', 4000), true);
  assert.equal(isHidden(h, 'a', 6000), false);
  assert.equal(isHidden(h, 'b', 6000), true);
  assert.equal(isHidden(h, 'zzz', 0), false);
  const p = pruneHidden(h, new Set(['a']), 4000);
  assert.deepEqual(Object.keys(p), ['a']);
});
