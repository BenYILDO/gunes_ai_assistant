import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fold, rank, terms, type SearchDoc } from '../src/search.js';

const docs: SearchDoc[] = [
  { type: 'wiki', id: 'depo-projesi', title: 'Depo Projesi', summary: 'İstanbul depo geçişi', body: 'WMS entegrasyonu ve toplantıyı Cuma yaptık.' },
  { type: 'card', id: 'c1', title: 'Güneş Lojistik teklifini gönder', summary: 'Ali Yılmaz', body: 'Teklif hazırlandı' },
  { type: 'event', id: 'e1', title: 'RE: Fatura', summary: 'Muhasebe', body: 'Fatura ödemesi gecikti' },
  { type: 'memory', id: 'm1', title: 'tercih', body: 'Yıldıray sabah brifingini sever' },
];

test('fold Türkçe karakterleri sadeleştirir ve uzunluğu korur', () => {
  assert.equal(fold('ÇİĞDEM Şükrü'), 'cigdem sukru');
  assert.equal(fold('ışık').length, 4);
});

test('terms kısa/tekrarlı terimleri atar', () => {
  assert.deepEqual(terms('a Depo depo, WMS!'), ['depo', 'wms']);
});

test('aksansız sorgu aksanlı metni bulur', () => {
  assert.equal(rank(docs, 'gunes')[0]?.id, 'c1');
  assert.equal(rank(docs, 'yildiray')[0]?.id, 'm1');
});

test('sorgu kökü ekli kelimeyi bulur (toplantı → toplantıyı)', () => {
  assert.equal(rank(docs, 'toplanti')[0]?.id, 'depo-projesi');
});

test('tüm terimler gerekir (VE) ve başlık eşleşmesi önde gelir', () => {
  assert.equal(rank(docs, 'depo wms').length, 1);
  assert.equal(rank(docs, 'depo wms zzz').length, 0);
  const hits = rank(docs, 'fatura');
  assert.equal(hits[0].id, 'e1');
  assert.ok(hits[0].snippet.toLowerCase().includes('fatura'));
});

test('boş sorgu sonuç vermez', () => {
  assert.deepEqual(rank(docs, ' '), []);
});
