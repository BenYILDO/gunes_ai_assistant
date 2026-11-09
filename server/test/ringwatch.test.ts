import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasCallWords, isToast, parseWinLine } from '../src/meetings/ringwatch.js';
import { adoptRing, IDLE, stepCall, type CallData } from '../src/meetings/callwatch.js';
import { popupText } from '../src/meetings/callpopup.js';

// Gerçek test aramasının günlüğünden (14:55): bildirim penceresi başlığı yalnızca "Microsoft Teams"
test('pencere satırı ayrıştırılır; başlıktaki "|" korunur; bozuk satır null', () => {
  const w = parseWinLine('ADD|ms-teams|6720|405AE|372x88|TeamsWebView|Microsoft Teams');
  assert.deepEqual(w, { type: 'win', kind: 'ADD', proc: 'ms-teams', pid: 6720, hwnd: '405AE', w: 372, h: 88, cls: 'TeamsWebView', title: 'Microsoft Teams' });
  const c = parseWinLine('ADD|ms-teams|6720|1A2B|1152x664|TeamsWebView|Tekin PIRE | Microsoft Teams') as { title: string };
  assert.equal(c.title, 'Tekin PIRE | Microsoft Teams');
  assert.equal(parseWinLine('BASE|ms-teams|1|AB|10x10|Cls|x')?.type, 'win');
  for (const bad of ['', 'ADD|eksik', 'ADD|a|b|c|dxe|f|g', 'KOMIK|ms-teams|1|AB|10x10|Cls|x']) assert.equal(parseWinLine(bad), null, bad);
});

test('TXT satırı: base64 JSON dizisi çözülür', () => {
  const b64 = Buffer.from(JSON.stringify(['Ahmet Yılmaz', 'Kabul et', 'Reddet']), 'utf8').toString('base64');
  const t = parseWinLine(`TXT|405AE|${b64}`);
  assert.deepEqual(t, { type: 'txt', hwnd: '405AE', texts: ['Ahmet Yılmaz', 'Kabul et', 'Reddet'] });
  assert.equal(parseWinLine('TXT|405AE|%%%bozuk'), null);
});

test('bildirim ayırt edici: yalnızca başlığı tam "Microsoft Teams" olan küçük Teams penceresi', () => {
  const toast = { proc: 'ms-teams', title: 'Microsoft Teams', w: 372, h: 88 };
  assert.ok(isToast(toast));
  assert.ok(!isToast({ ...toast, title: 'Tekin PIRE | Microsoft Teams' }), 'arama penceresi bildirim değil');
  assert.ok(!isToast({ ...toast, title: 'Sohbet | Birisi | Microsoft Teams' }), 'sohbet penceresi');
  assert.ok(!isToast({ ...toast, w: 1152, h: 664 }), 'büyük pencere');
  assert.ok(!isToast({ ...toast, w: 199, h: 34 }), 'küçültülmüş pencere');
  assert.ok(!isToast({ ...toast, proc: 'notepad' }), 'başka uygulama');
  assert.ok(isToast({ ...toast, proc: 'gunestoast' }, /gunestoast/i), 'süreç deseni ayarlanabilir');
});

test('arama sözcükleri: arama bildirimi mi, sohbet bildirimi mi', () => {
  assert.ok(hasCallWords(['Ahmet Yılmaz', 'Sizi arıyor', 'Kabul et', 'Reddet']));
  assert.ok(hasCallWords(['John', 'is calling', 'Accept', 'Decline']));
  assert.ok(!hasCallWords(['Yeni mesaj', 'Ahmet: toplantı yarın', 'Yanıtla yazın']) === false, 'yanıtla geçen metin arama sayılabilir (fail-open)');
  assert.ok(!hasCallWords(['Takvim', 'Hatırlatma', 'Toplantı 15 dk içinde başlıyor']));
});

test('çalma oturumu cevaplanınca gerçek aramaya devredilir; karar korunur, çalma yokken devir olmaz', () => {
  const ring: CallData = { id: 'ring:405AE', app: 'Teams', since: 1000, lastSeen: 1000, status: 'pending' };
  const obs = { sid: 'MSTeams:123', app: 'MSTeams' };
  const a = adoptRing(ring, obs, 9000)!;
  assert.equal(a.id, 'MSTeams:123');
  assert.equal(a.app, 'MSTeams');
  assert.equal(a.status, 'pending');
  assert.equal(a.since, 1000);
  assert.equal(adoptRing({ ...ring, status: 'joined' }, obs, 9000)!.status, 'joined', 'katıl kararı korunur');
  assert.equal(adoptRing({ ...ring, status: 'declined' }, obs, 9000)!.status, 'declined', 'reddedilen yeniden sorulmaz');
  assert.equal(adoptRing(ring, null, 9000), null, 'mikrofon açılmadıysa devir yok');
  assert.equal(adoptRing({ ...IDLE }, obs, 9000), null);
  assert.equal(adoptRing({ ...ring, id: 'MSTeams:9' }, obs, 9000), null, 'zaten gerçek bir arama');
});

test('çalma oturumu: bildirim sürerken canlı, mikrofon hiç açılmazsa süre dolunca biter; adoptRing sonrası debounce çalışır', () => {
  let s: CallData = { id: 'ring:1', app: 'Teams', since: 0, lastSeen: 0, status: 'pending' };
  s = stepCall(s, null, 5000);
  assert.equal(s.status, 'pending', '10 sn tolerans dolmadı');
  assert.equal(stepCall(s, null, 11000).status, 'idle', 'tolerans doldu');
  // cevaplandı: devir + debounce (detecting olmayan oturumda status korunur)
  const adopted = adoptRing({ id: 'ring:1', app: 'Teams', since: 0, lastSeen: 6000, status: 'detecting' }, { sid: 'T:1', app: 'MSTeams' }, 7000)!;
  assert.equal(stepCall(adopted, { sid: 'T:1', app: 'MSTeams' }, 7100).status, 'pending', 'çalma anından beri 1,5 sn geçmişti');
});

test('çalarken popup metni: çalıyor ifadesi, cevaplamazsanız atılır notu', () => {
  const t = popupText({ app: 'Teams', planned: false, eventSubject: null, screenshot: true, ringing: true });
  assert.match(t.body, /çalıyor/);
  assert.doesNotMatch(t.body, /mikrofonu açtı/);
  assert.doesNotMatch(t.body, /plansız/);
  assert.match(t.note, /cevaplamazsanız kaydı atarım/);
  const n = popupText({ app: 'MSTeams', planned: false, eventSubject: null, screenshot: true });
  assert.doesNotMatch(n.note, /cevaplamazsanız/);
});
