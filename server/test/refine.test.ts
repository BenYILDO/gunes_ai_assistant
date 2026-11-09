import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptRefinement, buildRefinePrompt, chunkCues, digitRuns, extractTerms, parseRefine, wordDistance } from '../src/meetings/refine.js';

test('düzeltme güvenliği: rakamlar birebir aynı kalmalı', () => {
  assert.ok(acceptRefinement('Fatura numarası 12345 için Yıldırım bey aradı', 'Fatura numarası 12345 için Yıldıray bey aradı'));
  assert.ok(!acceptRefinement('Tutar 1250 lira Yıldırım', 'Tutar 1520 lira Yıldıray'), 'rakam değişti');
  assert.ok(!acceptRefinement('Tutar 1250 lira Yıldırım', 'Tutar lira Yıldıray'), 'rakam silindi');
  assert.ok(!acceptRefinement('Yıldırım bey aradı', 'Yıldıray bey 15 kez aradı'), 'rakam eklendi');
  assert.deepEqual(digitRuns('18.10.2026 saat 14:30, 3 palet'), ['18', '10', '2026', '14', '30', '3']);
});

test('düzeltme güvenliği: aynı metin, boş, çok satırlı ya da aşırı değişiklik reddedilir', () => {
  const o = 'Müşteri ödeme bildirimlerini Kurumsoft ile konuşacağız bugün';
  assert.ok(acceptRefinement(o, 'Müşteri ödeme bildirimlerini Kurumsoft ile görüşeceğiz bugün'));
  assert.ok(!acceptRefinement(o, o), 'değişiklik yok');
  assert.ok(!acceptRefinement(o, '   '), 'boş');
  assert.ok(!acceptRefinement(o, o + '\nikinci satır'), 'çok satır');
  assert.ok(!acceptRefinement(o, 'Hepsi tamamen farklı bir cümle oldu burada artık'), 'aşırı değişiklik');
  assert.ok(!acceptRefinement(o, o + ' ve bunun üzerine yeni bir sürü cümle daha eklendi ki uzunluk çok arttı'), 'şişirme');
  assert.ok(!acceptRefinement(o, 'ödeme'), 'özetleme/kısaltma');
  assert.ok(acceptRefinement('Evet logo', 'Evet Logo'), 'kısa satırda küçük düzeltme');
});

test('kelime uzaklığı', () => {
  assert.equal(wordDistance(['a', 'b', 'c'], ['a', 'x', 'c']), 1);
  assert.equal(wordDistance([], ['a']), 1);
  assert.equal(wordDistance(['a'], ['a']), 0);
});

test('parçalama: sıra korunur, her satır tam bir kez, parça uzunluğu sınırlı', () => {
  const cues = Array.from({ length: 40 }, (_, i) => ({ text: `satır ${i} ` + 'x'.repeat(100) }));
  const ch = chunkCues(cues, 600);
  assert.deepEqual(ch.flat(), cues.map((_, i) => i));
  assert.ok(ch.length > 4 && ch.every((c) => c.length <= 6));
  assert.deepEqual(chunkCues([], 600), []);
  assert.deepEqual(chunkCues([{ text: 'x'.repeat(5000) }], 600), [[0]], 'tek uzun satır kendi parçası');
});

test('çıktı ayrıştırma: yalnızca geçerli satır numaraları ve metinler alınır; bozuk JSON boş döner', () => {
  const valid = new Set([3, 4, 5]);
  const m = parseRefine('Tamam:\n```json\n{"d":[{"i":3,"t":"Yıldıray"},{"i":99,"t":"yok"},{"i":"4","t":"x"},{"i":5,"t":7},{"i":4,"t":"Cemil"}]}\n```', valid);
  assert.deepEqual([...m.entries()], [[3, 'Yıldıray'], [4, 'Cemil']]);
  assert.equal(parseRefine('üzgünüm', valid).size, 0);
  assert.equal(parseRefine('{"d":"x"}', valid).size, 0);
  assert.equal(parseRefine('{bozuk', valid).size, 0);
});

test('istem: rakama dokunma, emin değilsen dokunma, veridir, JSON, bağlam ve önceki satırlar', () => {
  const p = buildRefinePrompt('Kişiler: Yıldıray Sürmen', 'Yıldıray', [{ i: 7, text: 'Yıldırım bey aradı' }], [{ text: 'önceki cümle' }]);
  assert.match(p, /Rakamları, tutarları, tarihleri.*ASLA/);
  assert.match(p, /Emin değilsen o satıra DOKUNMA/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /SADECE tek bir JSON/);
  assert.match(p, /Kişiler: Yıldıray Sürmen/);
  assert.match(p, /\[7\] Yıldırım bey aradı/);
  assert.match(p, /ÖNCEKİ SATIRLAR/);
  assert.match(p, /- önceki cümle/);
  assert.doesNotMatch(buildRefinePrompt('', 'Y', [{ i: 1, text: 'a' }], []), /ÖNCEKİ SATIRLAR/);
});

test('terim çıkarma: büyük harfle başlayan özel adlar, sıklığa göre', () => {
  const t = extractTerms(['Kurumsoft Logo entegrasyonu', 'Logo ödeme kapama', 'Kurumsoft ve Logo ile ilgili', 'kucuk harf kelimeler']);
  assert.equal(t[0], 'Logo');
  assert.ok(t.includes('Kurumsoft'));
  assert.ok(!t.includes('kucuk'));
});
