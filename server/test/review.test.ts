import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { MEETING_CHAT_TOOLS, toolPreset } from '../src/claude/runner.js';
import { gunesTool } from '../src/config.js';
import { getStore } from '../src/store/index.js';
import { cleanPersonName, recognize, sameName } from '../src/meetings/voices.js';
import { editCues, nameSpeaker, relabelSpeaker } from '../src/meetings/pipeline.js';
import { formatMeetingList, formatMeetingOverview, formatTranscript, nextStep } from '../src/meetings/review.js';
import type { Meeting, VoiceProfile } from '../src/store/types.js';

const meeting = (o: Partial<Meeting> = {}): Meeting =>
  ({
    id: 'abcdef12-0000-4000-8000-000000000000', title: 'IFF toplantısı', source: 'live', status: 'review', step: '', started_at: '2026-11-10T09:00:00Z', duration_sec: 600, event_external_id: null,
    attendees: ['Ali Veli', 'Özer Kaya'], project_slug: null, wiki_slug: null, audio_file: null,
    transcript: [
      { b: 3, e: 8, text: 'Merhaba herkese.', speaker: 'Ali Veli', score: 0.8, cluster: null },
      { b: 9, e: 14, text: 'Evin Akdağ burada mı?', speaker: null, score: null, cluster: 'ses-1' },
      { b: 15, e: 20, text: 'Evet buradayım.', speaker: null, score: null, cluster: 'ses-2' },
    ],
    speakers: [
      { id: 'Ali Veli', name: 'Ali Veli', kind: 'known', cues: 1, seconds: 5, samples: [] },
      { id: 'ses-1', name: null, kind: 'unknown', cues: 1, seconds: 5, samples: [], embedding: [1, 0] },
      { id: 'ses-2', name: null, kind: 'unknown', cues: 1, seconds: 5, samples: [], embedding: [0.9, 0.1] },
    ],
    summary: null, analysis: null, proposals: [], error: null, created_at: '2026-11-10T09:00:00Z', updated_at: '',
    ...o,
  }) as Meeting;

test('"(Ben)" işareti addan temizlenir; tek sözcük kalırsa kullanıcının tam adı olur', () => {
  assert.equal(cleanPersonName('Yıldıray Sürmen (Ben)'), 'Yıldıray Sürmen');
  assert.equal(cleanPersonName('Yıldıray Sürmen (ben)'), 'Yıldıray Sürmen');
  assert.equal(cleanPersonName('Yıldıray [Ben kendim]'), 'Yıldıray');
  assert.equal(cleanPersonName('Yıldıray (Ben)', 'Yıldıray Sürmen'), 'Yıldıray Sürmen');
  assert.equal(cleanPersonName('Evin Akdağ'), 'Evin Akdağ');
  assert.equal(cleanPersonName('Ali (Ben)', 'Yıldıray Sürmen'), 'Ali'); // başkasının adı değişmez
  assert.equal(sameName('Yıldıray Sürmen (Ben)', 'Yıldıray Sürmen'), true);
});

test('tanıma çıktısında profil adındaki "(Ben)" görünmez', () => {
  const p: VoiceProfile = { id: '1', name: 'Yıldıray Sürmen (Ben)', embedding: [1, 0], model: 'm', samples: 3, source: 'manual', created_at: '', updated_at: '' };
  const r = recognize([{ i: 0, v: [1, 0] }], [p], 0.4);
  assert.equal(r.get(0)?.speaker, 'Yıldıray Sürmen');
});

test('iki ayrı sese AYNI ad verilince tek profilde ve tek konuşmacıda birleşirler', async () => {
  const store = getStore();
  const m = await store.createMeeting({ title: 'x', source: 'live', status: 'review', attendees: [], transcript: meeting().transcript, speakers: meeting().speakers } as never);
  await nameSpeaker(m.id, 'ses-1', 'Evin Akdağ');
  const after = await nameSpeaker(m.id, 'ses-2', 'evin akdağ');
  const evin = after.speakers.filter((s) => s.name === 'Evin Akdağ');
  assert.equal(evin.length, 1); // tek konuşmacı
  assert.equal(evin[0]!.cues, 2); // iki sesin satırları bir arada
  assert.equal(after.speakers.some((s) => s.kind === 'unknown'), false);
  const profiles = (await store.listVoiceProfiles()).filter((p) => sameName(p.name, 'Evin Akdağ'));
  assert.equal(profiles.length, 1); // tek ses profili
  assert.equal(profiles[0]!.samples, 2);
});

test('kendi sesini "(Ben)" ile adlandırınca profil temiz adla kaydedilir', async () => {
  const store = getStore();
  const m = await store.createMeeting({ title: 'y', source: 'live', status: 'review', attendees: [], transcript: meeting().transcript, speakers: meeting().speakers } as never);
  const after = await nameSpeaker(m.id, 'ses-1', 'Yıldıray Sürmen (Ben)');
  assert.ok(after.speakers.some((s) => s.name === 'Yıldıray Sürmen'));
  assert.equal(after.speakers.some((s) => (s.name ?? '').includes('Ben')), false);
  const re = await relabelSpeaker(m.id, 'Ali Veli', 'Özer Kaya (Ben)');
  assert.ok(re.transcript.some((c) => c.speaker === 'Özer Kaya'));
});

test('satır düzeltme: özgün metin raw alanında kalır; geçersiz indeks, boş metin ve çok satır reddedilir; işlenirken düzenlenemez', async () => {
  const store = getStore();
  const m = await store.createMeeting({ title: 'z', source: 'live', status: 'review', attendees: [], transcript: meeting().transcript, speakers: [] } as never);
  const out = await editCues(m.id, [{ index: 1, text: 'Evin Akdağ burada mı toplantıda?' }]);
  assert.equal(out.transcript[1]!.text, 'Evin Akdağ burada mı toplantıda?');
  assert.equal(out.transcript[1]!.raw, 'Evin Akdağ burada mı?');
  const again = await editCues(m.id, [{ index: 1, text: 'Bir daha değişti' }]);
  assert.equal(again.transcript[1]!.raw, 'Evin Akdağ burada mı?'); // özgün metin ilk haliyle korunur
  await assert.rejects(editCues(m.id, [{ index: 99, text: 'x' }]), /Satır yok/);
  await assert.rejects(editCues(m.id, [{ index: 0, text: '   ' }]), /boş/);
  await assert.rejects(editCues(m.id, [{ index: 0, text: 'x'.repeat(801) }]), /boş ya da/);
  await assert.rejects(editCues(m.id, Array.from({ length: 26 }, () => ({ index: 0, text: 'a' }))), /1-25/);
  const busy = await store.createMeeting({ title: 'k', source: 'live', status: 'processing', attendees: [], transcript: meeting().transcript, speakers: [] } as never);
  await assert.rejects(editCues(busy.id, [{ index: 0, text: 'a' }]), /işlenirken/);
});

test('sohbet için toplantı biçimlendiricileri: kısa kimlik, tanınmayan ses, indeksli satırlar ve sıradaki adım', () => {
  const m = meeting();
  assert.match(formatMeetingList([m]), /\[abcdef12\] IFF toplantısı .*inceleme bekliyor.*2 tanınmayan ses/);
  const ov = formatMeetingOverview(m);
  assert.match(ov, /TANINMAYAN sesler.*ses-1.*ses-2/);
  assert.match(ov, /Sıradaki adım: 2 tanınmayan ses var/);
  const t = formatTranscript(m, 0, 2);
  assert.match(t, /\[0\] 00:03 Ali Veli: Merhaba herkese\./);
  assert.match(t, /Devamı için from_index=2/);
  assert.match(formatTranscript(m, 2, 10), /\[2\] 00:15 Bilinmeyen ses 2: Evet buradayım\./);
  // akış sırası: sesler → analiz → öneriler → wiki → tamam
  const named = { ...m, speakers: m.speakers.filter((s) => s.kind === 'known') };
  assert.match(nextStep(named as never), /meeting_analyze/);
  const withA = { ...named, analysis: { ozet: 'x', konular: [], kararlar: [], aksiyonlar: [] }, proposals: [{ id: 'p1', kind: 'remember', title: 't', reason: '', status: 'pending', payload: {} }] };
  assert.match(nextStep(withA as never), /1 öneri bekliyor.*meeting_apply_proposal/);
  const done = { ...withA, proposals: [{ ...withA.proposals[0]!, status: 'applied' }], wiki_slug: 'toplanti-x' };
  assert.equal(nextStep(done as never), 'inceleme tamam');
  assert.match(nextStep({ ...m, status: 'processing' } as never), /işleniyor/);
});

test('toplantı inceleme araçları YALNIZCA sohbette açık: ajanlar ve araştırmacı çağıramaz', () => {
  for (const p of ['collector', 'planner', 'meeting', 'researcher'] as const) {
    const { allowed, disallowed } = toolPreset(p);
    for (const t of MEETING_CHAT_TOOLS) {
      assert.ok(!allowed.includes(gunesTool(t)), `${p}: ${t} izinli`);
      assert.ok(disallowed.includes(gunesTool(t)), `${p}: ${t} yasak listesinde değil`);
    }
  }
  const chat = toolPreset('chat');
  assert.ok(chat.allowed.includes('mcp__gunes'));
  for (const t of MEETING_CHAT_TOOLS) assert.ok(!chat.disallowed.includes(gunesTool(t)), `chat: ${t} yasak`);
});

test('uygulama aracı açık kullanıcı onayı ister ve hiçbir araç mail göndermez', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  const apply = src.slice(src.indexOf("'meeting_apply_proposal'"), src.indexOf("'meeting_skip_proposal'"));
  assert.match(apply, /user_confirmed: z\.literal\(true\)/);
  assert.match(apply, /YALNIZCA kullanıcı/);
  const meetingTools = src.slice(src.indexOf("'list_meetings'"), src.indexOf('await ensureSoul(store)'));
  assert.doesNotMatch(meetingTools, /teams_send|send_mail|outlook_send|forward_mail/i);
});
