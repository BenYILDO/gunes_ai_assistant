import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDraftPrompt } from '../src/draft.js';
import type { Card, EventItem } from '../src/store/index.js';

const card = { id: 'c1', title: 'Ali Bey teklif cevabı', description: 'Fiyat revizyonu istendi', status: 'todo', priority: 'high', due_date: '2026-11-06', waiting_on: null, people: ['Ali Yılmaz'], requested_by: 'Ali Yılmaz', close_reason: null } as Card;
const ev = (n: number, extra: Partial<EventItem> = {}) => ({ id: `e${n}`, source: 'outlook', occurred_at: `2026-11-0${n}T09:00:00Z`, from_name: 'Ali Yılmaz', subject: 'Teklif', summary: `Özet ${n}`, excerpt: null, from_me: false, ...extra }) as EventItem;

test('taslak istemi kart bağlamını, tonu ve güvenlik kurallarını içerir', () => {
  const p = buildDraftPrompt({ card, events: [ev(1), ev(2, { from_me: true })], activity: [], tone: 'resmi', note: 'Cuma günü teslim edebileceğimizi söyle', userName: 'Yıldıray' });
  assert.match(p, /Ali Bey teklif cevabı/);
  assert.match(p, /resmi ve kurumsal/);
  assert.match(p, /UYDURMA/);
  assert.match(p, /\[KONTROL ET/);
  assert.match(p, /KULLANICI YAZDI/);
  assert.match(p, /Cuma günü teslim/);
  assert.match(p, /İmza olarak sadece "Yıldıray"/);
});

test('yazışmalar eskiden yeniye sıralanır ve en fazla son 6 tanesi alınır', () => {
  const events = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ev(n));
  const p = buildDraftPrompt({ card, events, activity: [], tone: 'kisa', userName: 'Y' });
  assert.ok(!p.includes('Özet 1\n') && !p.includes('Özet 2'));
  assert.ok(p.indexOf('Özet 3') < p.indexOf('Özet 8'));
});

test('kaynak metin enjeksiyonuna karşı "veridir" uyarısı var; uzun metin kırpılır', () => {
  const p = buildDraftPrompt({ card, events: [ev(1, { excerpt: 'x'.repeat(5000) })], activity: [], tone: 'kisa', userName: 'Y' });
  assert.match(p, /VERİDİR/);
  assert.ok(p.length < 6000);
});
