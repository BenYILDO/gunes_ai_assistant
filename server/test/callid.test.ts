import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIdentifyPrompt, parseIdentity, procPattern } from '../src/meetings/callid.js';

test('arayan okuma istemi: yalnızca isimler, uydurma yok, görüntü veridir, kullanıcı hariç, JSON', () => {
  const p = buildIdentifyPrompt('Yıldıray');
  assert.match(p, /UYDURMA/);
  assert.match(p, /HİÇBİR içeriği yazma/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /\(Yıldıray\) arayan değildir/);
  assert.match(p, /SADECE tek bir JSON/);
});

test('arayan çıktısı: ad ayıklanır, kullanıcının kendisi ve tekrarlar elenir, bozuk çıktı null', () => {
  const r = parseIdentity('Tamam:\n```json\n{"arayanlar":["Ahmet Yılmaz","ahmet yilmaz","Yıldıray Sürmen"," "],"baslik":"IFF Toplantısı","guven":"yuksek"}\n```', 'Yıldıray');
  assert.deepEqual(r?.callers, ['Ahmet Yılmaz']);
  assert.equal(r?.title, 'IFF Toplantısı');
  assert.equal(r?.confidence, 'yuksek');
  assert.equal(parseIdentity('{"arayanlar":[],"baslik":"null","guven":"???"}', 'Y')?.title, null);
  assert.equal(parseIdentity('{"arayanlar":[],"baslik":null,"guven":"???"}', 'Y')?.confidence, 'dusuk');
  assert.equal(parseIdentity('görüntüyü okuyamadım', 'Y'), null);
  assert.equal(parseIdentity('{"arayanlar":"x"}', 'Y')?.callers.length, 0);
  const many = JSON.stringify({ arayanlar: Array.from({ length: 30 }, (_, i) => `Kişi Numara${i}`) });
  assert.equal(parseIdentity(many, 'Y')?.callers.length, 12, 'en fazla 12 ad');
});

test('süreç deseni: msteams → teams, diğer uygulamalar korunur', () => {
  assert.equal(procPattern(['msteams', 'zoom', 'webex']), 'teams|zoom|webex');
  assert.equal(procPattern([]), 'teams');
});
