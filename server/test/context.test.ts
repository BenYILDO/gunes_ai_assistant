import './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previousMeetingsContext, relatedMeetings, weekMeetingsContext } from '../src/meetings/context.js';
import { parseHelperLine, pickMic, speechLevel, type NativeInfo } from '../src/meetings/capture.js';
import { meetingPrepPrompt, weeklyReportPrompt } from '../src/agents/prompts.js';
import type { Meeting } from '../src/store/types.js';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const mk = (o: Partial<Meeting>): Meeting =>
  ({ id: 'm', title: 'Daily Scrum', source: 'live', status: 'done', step: '', started_at: '2026-11-05T09:00:00Z', duration_sec: 600, event_external_id: null, attendees: ['Ali Veli'], project_slug: null, wiki_slug: null, audio_file: null, transcript: [], speakers: [], summary: 'özet', analysis: { ozet: 'IFF alanları konuşuldu', konular: [], kararlar: ['Araç tipi boş kalacak'], aksiyonlar: [{ kim: 'Ali', ne: 'PDF örneği gönder', ne_zaman: 'Cuma' }] }, proposals: [], error: null, created_at: '2026-11-05T09:00:00Z', updated_at: '', ...o }) as Meeting;

test('aynı başlıklı geçmiş toplantı bulunur, alakasız olan elenir', () => {
  const a = mk({ id: 'a' });
  const b = mk({ id: 'b', title: 'Bütçe görüşmesi', attendees: ['Zeynep Kaya'] });
  const r = relatedMeetings([a, b], 'Daily Scrum', [], NOW);
  assert.deepEqual(r.map((m) => m.id), ['a']);
});
test('ortak katılımcı ve başlık sözcüğü puan verir', () => {
  const a = mk({ id: 'a', title: 'IFF otomasyon toplantısı', attendees: ['Ali Veli'] });
  assert.equal(relatedMeetings([a], 'IFF Otomasyonu Sprint', ['Ali Veli'], NOW).length, 1);
});
test('işlenmemiş, analizsiz, gelecekteki ve çok eski toplantılar alınmaz', () => {
  const bad = [mk({ status: 'error' }), mk({ analysis: null, summary: null }), mk({ started_at: '2026-12-01T09:00:00Z' }), mk({ started_at: '2026-01-01T09:00:00Z' })];
  assert.equal(relatedMeetings(bad, 'Daily Scrum', [], NOW).length, 0);
});
test('bağlam metni karar, aksiyon ve bekleyen öneriyi içerir', () => {
  const m = mk({ proposals: [{ id: 'p', kind: 'update_card', title: 'Kartı güncelle', reason: '', status: 'pending', payload: {} }] });
  const t = previousMeetingsContext([m], 'Daily Scrum', [], NOW);
  assert.match(t, /Araç tipi boş kalacak/);
  assert.match(t, /PDF örneği gönder/);
  assert.match(t, /Kartı güncelle/);
  assert.equal(previousMeetingsContext([], 'x', [], NOW), '');
});
test('haftalık bağlam: haftadaki toplantılar var, yoksa bunu söyler', () => {
  const since = Date.parse('2026-11-02T00:00:00Z');
  assert.match(weekMeetingsContext([mk({})], since), /Toplantı kararları \(1 toplantı\)/);
  assert.match(weekMeetingsContext([mk({ started_at: '2026-10-01T09:00:00Z' })], since), /işlediği toplantı yok/);
});
test('istemler: hazırlık geçmiş + soru bölümü, rapor toplantı kararları', () => {
  const p = meetingPrepPrompt({ subject: 'Daily Scrum', start: new Date(NOW), summary: '', externalId: 'e' }, { memory: '', board: '', wiki: '', previous: '# ÖNCEKİ İLGİLİ TOPLANTILAR' });
  assert.match(p, /ÖNCEKİ İLGİLİ TOPLANTILAR/);
  assert.match(p, /Size sorularım/);
  assert.match(p, /30 dakika/);
  assert.match(weeklyReportPrompt('x', { wiki: '' }), /Toplantı kararları/);
});

test('mikrofon seçimi: en yüksek konuşma seviyeli, hepsi sessizse null', () => {
  assert.equal(pickMic([{ file: 'a', level: 0.02 }, { file: 'b', level: 0.08 }]), 'b');
  assert.equal(pickMic([{ file: 'a', level: 0.001 }]), null);
  assert.equal(pickMic([]), null);
});
test('speechLevel: sessiz dosya ~0, konuşmalı dosya yüksek', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gunes-mic-'));
  const quiet = Buffer.alloc(16000 * 2 * 4);
  const loud = Buffer.alloc(16000 * 2 * 4);
  for (let i = 0; i < loud.length; i += 2) loud.writeInt16LE(Math.round(8000 * Math.sin(i / 7)), i);
  writeFileSync(join(dir, 'q.raw'), quiet);
  writeFileSync(join(dir, 'l.raw'), loud);
  assert.ok(speechLevel(join(dir, 'q.raw')) < 0.001);
  assert.ok(speechLevel(join(dir, 'l.raw')) > 0.1);
});
test('yardımcı satırları: çoklu mikrofon, biri açılmasa da sorun değil', () => {
  const info: NativeInfo = { meetingId: 'x', startedAt: 0, micOk: false, sysOk: 0, devices: [], error: null, fromCall: false, stopping: false };
  parseHelperLine('OK|mic-0|16000 Hz', info);
  parseHelperLine('ERR|mic-1|Initialize 0x1', info);
  assert.equal(info.micOk, true);
  assert.equal(info.error, null);
  const only: NativeInfo = { ...info, micOk: false, error: null, devices: [] };
  parseHelperLine('ERR|mic-0|Activate', only);
  assert.match(only.error ?? '', /Mikrofon açılamadı/);
});
