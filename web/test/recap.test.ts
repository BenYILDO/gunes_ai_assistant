import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecapWindow, lastWeekRange, mondayOf, recapLine, recapWorthShowing, weekRecap } from '../src/lib/recap.ts';

// 2026-11-10 Salı
const NOW = new Date(2026, 10, 10, 9, 0);
const at = (d: number, h = 12) => new Date(2026, 10, d, h, 0).toISOString();

test('geçen hafta aralığı: önceki Pazartesi 00:00 → bu Pazartesi 00:00', () => {
  assert.equal(mondayOf(NOW).getDate(), 9);
  const { start, end } = lastWeekRange(NOW);
  assert.equal(start.getDate(), 2);
  assert.equal(end.getDate(), 9);
  // Pazar günü hâlâ aynı haftanın Pazartesi'sine döner
  assert.equal(mondayOf(new Date(2026, 10, 15, 22, 0)).getDate(), 9);
});

test('özet: yalnızca geçen haftanın kartları, toplantıları, uygulanan önerileri ve rozetleri sayılır', () => {
  const cards = [{ closed_at: at(3) }, { closed_at: at(6) }, { closed_at: at(9, 1) }, { closed_at: at(1) }, { closed_at: null }];
  const meetings = [
    { status: 'done', started_at: at(4), created_at: at(4), proposals: [{ status: 'applied' }, { status: 'skipped' }, { status: 'applied' }] },
    { status: 'error', started_at: at(5), created_at: at(5) },
    { status: 'review', started_at: null, created_at: at(8, 9), proposals: [{ status: 'pending' }] },
    { status: 'done', started_at: at(10, 8), created_at: at(10, 8) }, // bu hafta
  ];
  const r = weekRecap(NOW, cards, meetings, { cards_1: '2026-11-03', streak_3: '2026-11-09', first_feed: '2026-10-20' });
  assert.equal(r.weekKey, '2026-11-02');
  assert.equal(r.cardsClosed, 2); // 3 ve 6 Kasım; 9 Kasım 01:00 bu haftaya ait, 1 Kasım geçen haftadan önce
  assert.equal(r.meetings, 2);
  assert.equal(r.proposalsApplied, 2);
  assert.deepEqual(r.achievements, ['cards_1']);
  assert.match(recapLine(r), /2 kart kapattın.*2 toplantıyı.*2 öneriyi.*1 rozet/);
  assert.equal(recapWorthShowing(r), true);
});

test('boş hafta: gösterilmez; pencere Pazartesi–Çarşamba', () => {
  const r = weekRecap(NOW, [], [], {});
  assert.equal(recapWorthShowing(r), false);
  assert.match(recapLine(r), /sakin/);
  assert.equal(isRecapWindow(new Date(2026, 10, 9)), true); // Pazartesi
  assert.equal(isRecapWindow(new Date(2026, 10, 11)), true); // Çarşamba
  assert.equal(isRecapWindow(new Date(2026, 10, 12)), false); // Perşembe
  assert.equal(isRecapWindow(new Date(2026, 10, 15)), false); // Pazar
});
