import './env.js';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { activeCallApps, appLabel, IDLE, matchEvent, parseConsentStore, stepCall, type CallData } from '../src/meetings/callwatch.js';
import { AUDIO_FILE, purgeCandidates, removeAudioFiles } from '../src/meetings/retention.js';
import { meetingDir } from '../src/meetings/pipeline.js';
import type { EventItem, Meeting } from '../src/store/types.js';

// Gerçek `reg query ... /s` çıktısından (bu makinede alındı) + sentetik "şu an kullanımda" kayıtlar
const REG = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone
    Value    REG_SZ    Allow

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\MSTeams_8wekyb3d8bbwe
    Value    REG_SZ    Allow
    LastSetTime    REG_QWORD    0x1dc4febef95df1b
    LastUsedTimeStart    REG_QWORD    0x1dd7013ee558a0c
    LastUserAnnotatedLabel    REG_DWORD    0x2
    LastUsedTimeStop    REG_QWORD    0x1dd7014dad1fcff
    PersistedInDatabase    REG_DWORD    0x1

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged
    Value    REG_SZ    Allow

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged\\C:#Users#Y#AppData#Roaming#Zoom#bin#Zoom.exe
    Value    REG_SZ    Allow
    LastUsedTimeStart    REG_QWORD    0x1dd7020000000001
    LastUsedTimeStop    REG_QWORD    0x0

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged\\C:#Program Files (x86)#Microsoft#Edge#Application#msedge.exe
    Value    REG_SZ    Allow
    LastUsedTimeStart    REG_QWORD    0x1dd7020000000002
    LastUsedTimeStop    REG_QWORD    0x0

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\Claude_pzs8sxrjxfjjc
    LastUsedTimeStart    REG_QWORD    0x1dd7020000000003
    LastUsedTimeStop    REG_QWORD    0x0
`;

test('reg çıktısı ayrıştırılır; kök ve NonPackaged üst anahtarları uygulama sayılmaz', () => {
  const e = parseConsentStore(REG);
  assert.equal(e.length, 4);
  assert.deepEqual(e.map((x) => appLabel(x.key)), ['MSTeams', 'Zoom.exe', 'msedge.exe', 'Claude']);
  assert.ok(e[0]!.stop > e[0]!.start, 'Teams çağrısı bitmiş');
  assert.equal(e[1]!.stop, 0n);
});

test('arama uygulaması: yalnızca şu an mikrofonu kullanan ve izinli olanlar (Edge/Claude yok)', () => {
  const act = activeCallApps(parseConsentStore(REG), ['msteams', 'zoom', 'webex']);
  assert.deepEqual(act.map((a) => a.label), ['Zoom.exe']);
  assert.equal(activeCallApps(parseConsentStore(REG), ['msedge']).length, 1, 'izin listesine eklenirse tarayıcı da sayılır');
  assert.equal(activeCallApps([], ['zoom']).length, 0);
});

test('durum makinesi: kısa mikrofon açılışı yok sayılır, süreklisi pending olur', () => {
  const o = { sid: 'zoom:1', app: 'Zoom.exe' };
  let s: CallData = stepCall(IDLE, o, 0);
  assert.equal(s.status, 'detecting');
  s = stepCall(s, o, 1000);
  assert.equal(s.status, 'detecting', 'debounce dolmadı');
  s = stepCall(s, o, 1800);
  assert.equal(s.status, 'pending');
  // anlık açılıp kapanma
  let t = stepCall(IDLE, o, 0);
  t = stepCall(t, null, 25000);
  assert.equal(t.status, 'idle');
});

test('durum makinesi: reddedilen/katılınan arama için tekrar sorulmaz; yeni arama yeniden sorar', () => {
  const o = { sid: 'teams:1', app: 'MSTeams' };
  let s = stepCall(stepCall(IDLE, o, 0), o, 5000);
  assert.equal(s.status, 'pending');
  s = { ...s, status: 'declined' };
  s = stepCall(s, o, 8000);
  assert.equal(s.status, 'declined', 'aynı arama sürerken sorulmaz');
  s = stepCall(s, null, 9000);
  assert.equal(s.status, 'declined', 'kısa kopma (20 sn tolerans) aramayı bitirmez');
  s = stepCall(s, null, 40000);
  assert.equal(s.status, 'idle', 'mikrofon uzun süre kapalı: arama bitti');
  const n = stepCall(s, { sid: 'teams:2', app: 'MSTeams' }, 50000);
  assert.equal(n.status, 'detecting', 'yeni arama');
});

const ev = (start: string, end: string | null, subject = 'Toplantı'): EventItem => ({ source: 'calendar', external_id: subject, occurred_at: start, ends_at: end, subject, summary: subject }) as EventItem;

test('takvim eşleştirme: başlamadan 15 dk önce ... bittikten 10 dk sonra; en yakın başlangıç; yoksa plansız', () => {
  const t = Date.parse('2026-11-09T09:35:00Z');
  const daily = ev('2026-11-09T09:30:00Z', '2026-11-09T10:00:00Z', 'Daily Scrum');
  assert.equal(matchEvent([daily], t)?.subject, 'Daily Scrum');
  assert.equal(matchEvent([daily], Date.parse('2026-11-09T09:16:00Z'))?.subject, 'Daily Scrum', '14 dk önce');
  assert.equal(matchEvent([daily], Date.parse('2026-11-09T09:10:00Z')), null, '20 dk önce: plansız');
  assert.equal(matchEvent([daily], Date.parse('2026-11-09T10:09:00Z'))?.subject, 'Daily Scrum');
  assert.equal(matchEvent([daily], Date.parse('2026-11-09T10:20:00Z')), null);
  assert.equal(matchEvent([ev('2026-11-09T09:00:00Z', null, 'Uzun')], Date.parse('2026-11-09T09:50:00Z'))?.subject, 'Uzun', 'bitiş yoksa 60 dk varsayılır');
  const two = [ev('2026-11-09T09:00:00Z', '2026-11-09T11:00:00Z', 'A'), ev('2026-11-09T09:30:00Z', '2026-11-09T10:00:00Z', 'B')];
  assert.equal(matchEvent(two, t)?.subject, 'B', 'başlangıcı en yakın olan');
  assert.equal(matchEvent([{ ...daily, source: 'outlook' } as EventItem], t), null, 'yalnızca takvim kayıtları');
});

const meet = (over: Partial<Meeting>): Meeting => ({ id: 'm1', title: 't', source: 'live', status: 'done', step: '', started_at: null, duration_sec: null, event_external_id: null, attendees: [], project_slug: null, wiki_slug: null, audio_file: 'x', transcript: [], speakers: [], summary: null, error: null, created_at: '2026-10-01T00:00:00Z', updated_at: '', ...over });

test('saklama: 30 günü dolan ve işi biten toplantıların sesi silinir; klasördekine ve işlenenlere dokunulmaz', () => {
  const now = Date.parse('2026-11-09T00:00:00Z');
  const list = [
    meet({ id: 'eski' }),
    meet({ id: 'yeni', created_at: '2026-10-20T00:00:00Z' }),
    meet({ id: 'klasor', source: 'folder' }),
    meet({ id: 'isleniyor', status: 'processing' }),
    meet({ id: 'dinleniyor', status: 'recording' }),
    meet({ id: 'silinmis', audio_file: null }),
    meet({ id: 'hata', status: 'error' }),
  ];
  assert.deepEqual(purgeCandidates(list, 30, now).map((m) => m.id), ['eski', 'hata']);
  assert.deepEqual(purgeCandidates(list, 0, now), [], '0 = hiç silme');
  assert.deepEqual(purgeCandidates(list, 60, now), [], '60 günde henüz dolmadı');
});

test('ses silme: yalnızca ses ve vektör dosyaları gider, transkript kalır', () => {
  assert.ok(AUDIO_FILE.test('audio.wav') && AUDIO_FILE.test('original.mp4') && AUDIO_FILE.test('live.webm') && AUDIO_FILE.test('vektorler.json'));
  assert.ok(!AUDIO_FILE.test('transcript.vtt') && !AUDIO_FILE.test('notlar.txt'));
  const dir = meetingDir('test-saklama');
  mkdirSync(dir, { recursive: true });
  for (const f of ['audio.wav', 'original.mp4', 'live.webm', 'vektorler.json', 'transcript.vtt', 'notlar.txt']) writeFileSync(join(dir, f), 'x');
  assert.equal(removeAudioFiles('test-saklama'), 4);
  assert.ok(existsSync(join(dir, 'transcript.vtt')) && existsSync(join(dir, 'notlar.txt')));
  assert.ok(!existsSync(join(dir, 'audio.wav')) && !existsSync(join(dir, 'original.mp4')));
  assert.equal(removeAudioFiles('olmayan-klasor'), 0);
});
