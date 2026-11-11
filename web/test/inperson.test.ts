import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GREETING, greetingText, parseNames } from '../src/lib/inperson.ts';

test('duyuru: {ad} kullanıcının adıyla değişir; boş metin varsayılana döner', () => {
  assert.match(greetingText('', 'Yıldıray'), /Güneş.*Yıldıray için çalışan/);
  assert.ok(!greetingText('', 'Yıldıray').includes('{ad}'));
  assert.equal(greetingText('Merhaba {ad}, {AD}!', 'Ali'), 'Merhaba Ali, Ali!');
  assert.equal(greetingText('   ', 'Ali'), greetingText('', 'Ali'));
  assert.match(greetingText('{ad} burada', ''), /sahibim/); // ad bilinmiyorsa boş kalmaz
});

test('varsayılan duyuru: kim olduğunu, dinlediğini ve durdurulabileceğini söyler; yanıltıcı gizlilik sözü vermez', () => {
  assert.match(DEFAULT_GREETING, /Güneş/);
  assert.match(DEFAULT_GREETING, /dinle/);
  assert.match(DEFAULT_GREETING, /durur/);
  assert.doesNotMatch(DEFAULT_GREETING, /dışarı|bulut|kimseyle paylaşıl/i);
});

test('çok uzun duyuru 600 karakterde kesilir', () => {
  assert.equal(greetingText('a'.repeat(900), 'Ali').length, 600);
});

test('katılımcı adları: virgül/noktalı virgül/satır ayrımı, tekrarsız (Türkçe büyük-küçük), en çok 30', () => {
  assert.deepEqual(parseNames('Ali Veli, Ayşe  Kaya; mehmet\nİLKER'), ['Ali Veli', 'Ayşe Kaya', 'mehmet', 'İLKER']);
  assert.deepEqual(parseNames('Işık, ışık, ISIK'), ['Işık', 'ISIK']); // I ≠ ı farkı: tr büyük-küçük
  assert.deepEqual(parseNames(' , ;; '), []);
  assert.equal(parseNames(Array.from({ length: 50 }, (_, i) => `Kişi ${i}`).join(',')).length, 30);
});

test('sesli duyuru varsayılan KAPALI gelir (Ayarlar → Yüz yüze toplantı\'dan açılır)', async () => {
  const { getSettings } = await import('../src/lib/settings.ts');
  assert.equal(getSettings().inPersonAnnounce, false);
  assert.equal(getSettings().inPersonText, '');
});
