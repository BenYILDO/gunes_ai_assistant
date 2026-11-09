import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePopupLine, popupText } from '../src/meetings/callpopup.js';

test('popup metni: takvim eşleşmesi varsa toplantı adı, yoksa plansız arama', () => {
  const planned = popupText({ app: 'MSTeams', planned: true, eventSubject: 'Daily Scrum', screenshot: true });
  assert.equal(planned.title, 'Bir arama fark ettim');
  assert.match(planned.body, /MSTeams mikrofonu açtı/);
  assert.match(planned.body, /Takvimde bu saatte Daily Scrum var/);
  assert.match(planned.body, /katılmamı ister misiniz\?$/);
  const unplanned = popupText({ app: null, planned: false, eventSubject: null, screenshot: false });
  assert.match(unplanned.body, /plansız bir arama/);
  assert.doesNotMatch(unplanned.body, /mikrofonu açtı/);
  assert.equal(planned.join, 'Katıl');
});

test('popup notu: gizlilik açıklaması ekran görüntüsü ayarına göre, saklama süresi her zaman', () => {
  const on = popupText({ app: 'Zoom', planned: false, eventSubject: null, screenshot: true }).note;
  const off = popupText({ app: 'Zoom', planned: false, eventSubject: null, screenshot: false }).note;
  assert.match(on, /görüntüsünü Claude/);
  assert.match(on, /saklanmaz/);
  assert.doesNotMatch(off, /Claude/);
  for (const n of [on, off]) {
    assert.match(n, /Ekran paylaşımı gerekmez/);
    assert.match(n, /30 gün/);
  }
});

test('popup metni: çok uzun toplantı adı kırpılır', () => {
  const t = popupText({ app: 'Zoom', planned: true, eventSubject: 'A'.repeat(300), screenshot: false });
  assert.ok(t.body.length < 260);
});

test('popup kararı: yalnızca JOIN/DECLINE/TIMEOUT satırları geçerli, başka çıktı karar sayılmaz', () => {
  assert.equal(parsePopupLine('JOIN\r'), 'join');
  assert.equal(parsePopupLine(' DECLINE '), 'decline');
  assert.equal(parsePopupLine('TIMEOUT'), 'timeout');
  for (const x of ['join', 'JOINED', '', 'DBG click', 'yes']) assert.equal(parsePopupLine(x), null, x);
});
