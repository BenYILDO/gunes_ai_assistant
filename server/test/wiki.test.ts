import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLinks, slugify } from '../src/wiki.js';

test('slugify Türkçe karakterleri çevirir', () => {
  assert.equal(slugify('Güneş Şirketi — Ödeme Çözümü'), 'gunes-sirketi-odeme-cozumu');
  assert.equal(slugify('  İstanbul  Depo  '), 'istanbul-depo');
});

test('extractLinks [[...]] bağlantılarını tekilleştirir', () => {
  assert.deepEqual(extractLinks('Bkz. [[Proje A]], [[proje-a|A]] ve [[Ali Yılmaz#not]]'), ['proje-a', 'ali-yilmaz']);
});
