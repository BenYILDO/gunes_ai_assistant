import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFocusPlan, freeSlots, zoned } from '../src/focus.js';
import type { Card, EventItem } from '../src/store/index.js';

const TZ = 'Europe/Istanbul'; // UTC+3 (yaz/kış saati yok)
const DAY = '2026-11-04';
const at = (hhmm: string) => zoned(DAY, hhmm, TZ);
const hm = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(11, 16); // yerel HH:MM

const opts = { day: DAY, tz: TZ, workStart: '09:00', workEnd: '18:00', lunch: '12:30-13:30' };

test('zoned: İstanbul 09:00 = 06:00 UTC', () => {
  assert.equal(new Date(at('09:00')).toISOString(), '2026-11-04T06:00:00.000Z');
});

test('freeSlots: toplantı, tampon ve öğle arası çıkarılır', () => {
  const slots = freeSlots([{ start: at('10:00'), end: at('11:00') }], opts);
  assert.deepEqual(
    slots.map((s) => `${hm(s.start)}-${hm(s.end)}`),
    ['09:00-09:55', '11:05-12:30', '13:30-18:00'],
  );
});

test('freeSlots: kısa (25 dk altı) boşluklar atılır, çakışan toplantılar birleşir', () => {
  const slots = freeSlots(
    [
      { start: at('09:00'), end: at('12:00') },
      { start: at('11:00'), end: at('12:10') },
      { start: at('13:40'), end: at('18:00') },
    ],
    { ...opts, lunch: '' },
  );
  // 12:15-13:35 arası boş; 18:00'e kadar toplantı
  assert.deepEqual(slots.map((s) => `${hm(s.start)}-${hm(s.end)}`), ['12:15-13:35']);
});

test('freeSlots: bugün için geçmiş zaman kullanılmaz', () => {
  const slots = freeSlots([], { ...opts, lunch: '', from: at('15:00') });
  assert.equal(hm(slots[0].start), '15:00');
});

const card = (o: Partial<Card> & { id: string; title: string }): Card =>
  ({ description: null, status: 'todo', priority: 'medium', project_id: null, due_date: null, waiting_on: null, people: [], tags: [], sources: [], created_by: 'gunes', close_reason: null, position: 0, created_at: '', updated_at: '', closed_at: null, requested_by: null, wiki_slug: null, ...o }) as Card;
const meeting = (subject: string, start: string, end: string | null): EventItem =>
  ({ id: subject, source: 'calendar', external_id: subject, occurred_at: new Date(at(start)).toISOString(), ends_at: end ? new Date(at(end)).toISOString() : null, subject, summary: subject, processed: false }) as EventItem;

test('plan: gecikmiş/kritik iş en erken boşluğa, bitenler ve bekleyenler dışarıda', () => {
  const plan = buildFocusPlan({
    ...opts,
    now: at('08:00'),
    cards: [
      card({ id: 'low', title: 'Düşük iş', priority: 'low' }),
      card({ id: 'late', title: 'Gecikmiş teklif', priority: 'medium', due_date: '2026-11-02' }),
      card({ id: 'crit', title: 'Kritik arıza', priority: 'critical' }),
      card({ id: 'wait', title: 'Cevap bekleniyor', status: 'waiting', priority: 'critical' }),
      card({ id: 'done', title: 'Bitti', status: 'done', priority: 'critical' }),
    ],
    events: [meeting('Haftalık', '09:00', '10:00')],
  });
  const ids = plan.items.map((i) => i.card_id);
  assert.ok(!ids.includes('wait') && !ids.includes('done'));
  assert.equal(ids[0], 'late'); // gecikme puanı kritikten yüksek
  assert.ok(ids.indexOf('late') < ids.indexOf('low'));
  assert.match(plan.items[0].reason, /gün gecikmiş/);
  assert.equal(hm(plan.items[0].start), '10:05'); // toplantı + 5 dk tampon
  // yerleşenler çakışmaz
  for (let i = 1; i < plan.items.length; i++) assert.ok(plan.items[i].start >= plan.items[i - 1].end);
});

test('plan: iptal ve tüm gün etkinlikler boşluğu daraltmaz; süre yoksa 60 dk varsayılır', () => {
  const plan = buildFocusPlan({
    ...opts,
    lunch: '',
    now: at('08:00'),
    cards: [],
    events: [meeting('İptal: Sunum', '09:00', '17:00'), meeting('Ofis dışı', '00:00', '23:59'), meeting('Süresiz', '14:00', null)],
  });
  assert.deepEqual(plan.meetings.map((m) => m.title), ['Süresiz']);
  assert.equal(hm(plan.meetings[0].end), '15:00');
  assert.equal(plan.free_minutes, 5 * 60 - 5 + 3 * 60 - 5); // 09:00-13:55 ve 15:05-18:00
});

test('plan: sığmayan önemli işler overflow olur', () => {
  const plan = buildFocusPlan({
    ...opts,
    lunch: '',
    now: at('17:00'),
    cards: [card({ id: 'a', title: 'A', priority: 'critical' }), card({ id: 'b', title: 'B', priority: 'critical' })],
    events: [],
  });
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].partial, false); // 60 dk istedi, 17:00-18:00 tam 60 dk
  assert.equal(plan.overflow.length, 1);
});
