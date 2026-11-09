import './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPlanned } from '../src/meetings/callwatch.js';
import { popupText } from '../src/meetings/callpopup.js';
import type { EventItem } from '../src/store/types.js';

const T0 = Date.parse('2026-11-09T15:30:00Z');
const ev = (o: Partial<EventItem>): EventItem =>
  ({ id: 'x', source: 'calendar', external_id: 'e1', occurred_at: new Date(T0).toISOString(), ends_at: new Date(T0 + 30 * 60_000).toISOString(), from_name: null, from_address: null, subject: 'Daily Scrum', summary: 'Daily Scrum', excerpt: null, link: null, needs_reply: false, waiting_on: null, due_date: null, importance: 0, project_hint: null, processed: true, card_id: null, from_me: false, thread_id: null, created_at: '', ...o }) as EventItem;

test('başlamasına 60 sn kala sorulur, öncesinde sorulmaz', () => {
  assert.equal(nextPlanned([ev({})], T0 - 61_000, 60, new Set()), null);
  assert.equal(nextPlanned([ev({})], T0 - 59_000, 60, new Set())?.external_id, 'e1');
});
test('başladıktan 3 dk sonrasına kadar hâlâ sorulur, sonra değil', () => {
  assert.ok(nextPlanned([ev({})], T0 + 2 * 60_000, 60, new Set()));
  assert.equal(nextPlanned([ev({})], T0 + 4 * 60_000, 60, new Set()), null);
});
test('bir toplantı için bir kez sorulur', () => assert.equal(nextPlanned([ev({})], T0 - 30_000, 60, new Set(['e1'])), null));
test('kapalıysa (0 sn) sorulmaz', () => assert.equal(nextPlanned([ev({})], T0 - 30_000, 0, new Set()), null));
test('toplantı olmayan kayıtlar ve tuhaf süreler elenir', () => {
  const now = T0 - 30_000;
  assert.equal(nextPlanned([ev({ subject: 'Odak zamanı' })], now, 60, new Set()), null);
  assert.equal(nextPlanned([ev({ subject: 'Öğle yemeği' })], now, 60, new Set()), null);
  assert.equal(nextPlanned([ev({ ends_at: new Date(T0 + 60_000).toISOString() })], now, 60, new Set()), null); // 1 dk
  assert.equal(nextPlanned([ev({ ends_at: new Date(T0 + 24 * 3600_000).toISOString() })], now, 60, new Set()), null); // tüm gün
  assert.equal(nextPlanned([ev({ source: 'outlook' })], now, 60, new Set()), null);
});
test('birden çok adaydan en erken başlayan seçilir', () => {
  const a = ev({ external_id: 'a', occurred_at: new Date(T0 + 20_000).toISOString(), ends_at: new Date(T0 + 30 * 60_000).toISOString() });
  const b = ev({ external_id: 'b' });
  assert.equal(nextPlanned([a, b], T0 - 30_000, 60, new Set())?.external_id, 'b');
});

test('popup metni: yaklaşan toplantı', () => {
  const t = popupText({ app: null, planned: true, eventSubject: 'Daily Scrum', screenshot: false, upcoming: { minutes: 1 } });
  assert.match(t.body, /Daily Scrum/);
  assert.match(t.body, /1 dakika/);
  assert.match(t.body, /katılayım mı/i);
  assert.equal(t.join, 'Katıl');
});
