import './env.js';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { candidateProfiles, centroid, clusterUnknown, cosine, foldName, normalize, recognize, sameName, summarizeSpeakers } from '../src/meetings/voices.js';
import { buildSummaryPrompt, buildWikiPage, parseSummary, parseVtt, transcriptText } from '../src/meetings/pipeline.js';
import { insideDir } from '../src/meetings/api.js';
import type { Meeting, MeetingCue, VoiceProfile } from '../src/store/types.js';

/** Basit, deterministik "ses": taban yön + küçük gürültü */
const axis = (dim: number, i: number, noise = 0, seed = 1) => {
  const v = new Array<number>(dim).fill(0);
  v[i] = 1;
  let s = seed;
  for (let k = 0; k < dim; k++) {
    s = (s * 16807) % 2147483647;
    v[k]! += ((s / 2147483647) - 0.5) * noise;
  }
  return normalize(v);
};
const prof = (name: string, v: number[], samples = 10): VoiceProfile => ({ id: name, name, embedding: v, model: 'm', samples, source: 'teams', created_at: '', updated_at: '' });

test('foldName/sameName: Türkçe harf ve yazım farkı aynı kişi', () => {
  assert.equal(foldName('Yıldıray Sürmen'), 'yildiray surmen');
  assert.ok(sameName('Yildiray SURMEN', 'Yıldıray Sürmen'));
  assert.ok(sameName('Yıldıray', 'Yildiray SURMEN'), 'tek sözcüklü ad tam adla eşleşir');
  assert.ok(!sameName('Ali Yılmaz', 'Ali Veli'), 'aynı ad, farklı soyad eşleşmez');
  assert.ok(!sameName('Özer Üngör', 'Necmi Güngör'));
  assert.ok(!sameName('', 'Ali'));
});

test('candidateProfiles: yalnızca katılımcılar (+kullanıcı); eşleşme yoksa hepsi', () => {
  const ps = [prof('Yildiray SURMEN', axis(8, 0)), prof('Ozer UNGOR', axis(8, 1)), prof('Birsen SEBIBOGA', axis(8, 2))];
  assert.deepEqual(candidateProfiles(ps, ['Özer Üngör'], 'Yıldıray').map((p) => p.name).sort(), ['Ozer UNGOR', 'Yildiray SURMEN']);
  assert.equal(candidateProfiles(ps, ['Tanımadığım Kişi'], 'Yıldıray').length, 1, 'yalnızca kullanıcı eşleşir');
  assert.equal(candidateProfiles(ps, [], 'Yıldıray').length, 3, 'katılımcı listesi yoksa kısıtlama yok');
  assert.equal(candidateProfiles(ps, ['Yok Yok'], 'Hiç Kimse').length, 3, 'hiç eşleşme yoksa hepsi');
});

test('recognize: eşik üstü ad, altı tanınmadı', () => {
  const ps = [prof('A', axis(8, 0)), prof('B', axis(8, 1))];
  const rec = recognize([{ i: 0, v: axis(8, 0, 0.1, 3) }, { i: 1, v: axis(8, 5, 0.1, 4) }], ps, 0.4);
  assert.equal(rec.get(0)!.speaker, 'A');
  assert.equal(rec.get(1)!.speaker, null);
  assert.ok(rec.get(1)!.score! < 0.4);
});

test('clusterUnknown: iki farklı sesi ayırır, aynı sesi birleştirir', () => {
  const vs = [
    ...[1, 2, 3, 4].map((s, k) => ({ i: k, v: axis(16, 3, 0.15, s) })),
    ...[5, 6, 7].map((s, k) => ({ i: 10 + k, v: axis(16, 9, 0.15, s) })),
  ];
  const cl = clusterUnknown(vs);
  assert.equal(cl.length, 2);
  assert.equal(cl[0]!.members.length, 4, 'büyük grup önde');
  assert.deepEqual(cl[1]!.members.sort(), [10, 11, 12]);
  assert.equal(cl[0]!.id, 'ses-1');
  assert.ok(cosine(cl[0]!.centroid, cl[0]!.centroid) > 0.999);
});

test('summarizeSpeakers: tanınanlar ve tanınmayan gruplar, süreye göre sıralı', () => {
  const cues: MeetingCue[] = [
    { b: 0, e: 10, text: 'a', speaker: 'Ali', score: 0.7, cluster: null },
    { b: 10, e: 40, text: 'b', speaker: null, score: 0.2, cluster: 'ses-1' },
    { b: 40, e: 45, text: 'c', speaker: 'Ali', score: 0.7, cluster: null },
  ];
  const sp = summarizeSpeakers(cues, [{ id: 'ses-1', members: [1], centroid: [1, 0] }]);
  assert.equal(sp[0]!.id, 'ses-1');
  assert.equal(sp[0]!.kind, 'unknown');
  assert.equal(sp[0]!.seconds, 30);
  assert.ok(sp[0]!.embedding);
  assert.equal(sp[1]!.name, 'Ali');
  assert.equal(sp[1]!.cues, 2);
  assert.ok(sp[1]!.samples.length >= 1 && !sp[1]!.embedding);
});

test('centroid ağırlıklı ve birim uzunlukta', () => {
  const c = centroid([{ v: [1, 0], w: 9 }, { v: [0, 1], w: 1 }]);
  assert.ok(c[0]! > c[1]!);
  assert.ok(Math.abs(cosine(c, c) - 1) < 1e-9);
});

test('insideDir: kayıt klasörü dışına çıkılamaz', () => {
  const root = join(tmpdir(), 'gunes-kayit');
  assert.ok(insideDir(root, join(root, 'a', 'b.mp4')));
  assert.ok(!insideDir(root, join(root, '..', 'gizli', 'x.mp4')));
  assert.ok(!insideDir(root, `${root}-baska${sep}x.mp4`), 'ön ek aldatmacası');
  assert.ok(!insideDir(root, join(tmpdir(), 'baska', 'x.mp4')));
});

test('parseVtt: saat/dakika biçimleri ve çok satırlı metin', () => {
  const v = parseVtt('WEBVTT\n\n00:00:01.500 --> 00:00:04.000\nMerhaba\nnasılsınız\n\n01:02:03.250 --> 01:02:05.000\nSon.\n');
  assert.equal(v.length, 2);
  assert.equal(v[0]!.b, 1.5);
  assert.equal(v[0]!.text, 'Merhaba nasılsınız');
  assert.equal(v[1]!.b, 3723.25);
});

const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'abcdef12-0000', title: 'IFF Döküman İşleme', source: 'upload', status: 'review', step: '', started_at: '2026-08-05T12:00:00Z', duration_sec: 1834,
  event_external_id: 'ev1', attendees: ['Yıldıray Sürmen', 'Özer Üngör'], project_slug: 'iff-otomasyonu', wiki_slug: null, audio_file: null,
  transcript: [
    { b: 5, e: 9, text: 'Başlayalım.', speaker: 'Yıldıray Sürmen', score: 0.7, cluster: null },
    { b: 9, e: 14, text: 'Tamam.', speaker: null, score: 0.2, cluster: 'ses-1' },
  ],
  speakers: [{ id: 'Yıldıray Sürmen', name: 'Yıldıray Sürmen', kind: 'known', cues: 1, seconds: 4, samples: [] }, { id: 'ses-1', name: null, kind: 'unknown', cues: 1, seconds: 5, samples: [] }],
  summary: null, error: null, created_at: '2026-08-05T12:40:00Z', updated_at: '2026-08-05T12:40:00Z', ...over,
});

test('özet istemi: uydurma yasağı, "veridir", tanımayan sesi tahmin etme, bilinmeyen etiketi', () => {
  const p = buildSummaryPrompt(meeting(), 'Yıldıray');
  assert.match(p, /UYDURMA/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /Bilinmeyen ses.*TAHMİN ETME/);
  assert.match(p, /kurum\/taraf ekleme/);
  assert.match(p, /Bilinmeyen ses 1: Tamam/);
  assert.match(p, /Yıldıray Sürmen: Başlayalım/);
  assert.match(p, /SADECE tek bir JSON/);
});

test('transkript metni: aynı konuşmacı ardışıksa etiket tekrarlanmaz; uzun metin kesilir', () => {
  const cues: MeetingCue[] = [1, 2, 3].map((n) => ({ b: n, e: n + 1, text: `s${n}`, speaker: 'Ali', score: 1, cluster: null }));
  assert.equal((transcriptText(cues).match(/Ali:/g) ?? []).length, 1);
  assert.match(transcriptText([{ b: 0, e: 1, text: 'x'.repeat(500), speaker: 'A', score: 1, cluster: null }], 100), /kesildi/);
});

test('parseSummary: bozuk çıktıda null, geçerli JSON ayrıştırılır', () => {
  assert.equal(parseSummary('özür dilerim'), null);
  assert.equal(parseSummary('{"kararlar":[]}'), null, 'özet yoksa geçersiz');
  assert.equal(parseSummary('```json\n{"ozet":"Kısa özet","kararlar":["x"]}\n```')?.ozet, 'Kısa özet');
});

test('wiki sayfası: proje ve kişi bağlantıları, takvim referansı, kayıt referansı', () => {
  const m = meeting();
  const p = buildWikiPage({
    m, s: { ozet: 'Özet metni.', kararlar: ['Karar 1'], aksiyonlar: [{ kim: 'Özer Üngör', ne: 'Dosyayı gönder', ne_zaman: 'Cuma' }] }, slug: 'toplanti-2026-08-05-iff', projectSlug: 'iff-otomasyonu',
    personSlugs: new Map([['Yıldıray Sürmen', 'yildiray-surmen']]),
    event: { subject: 'YZ ile IFF', occurred_at: '2026-08-05T12:00:00Z', link: 'https://outlook/e1' } as never,
  });
  assert.match(p.md, /\[\[iff-otomasyonu\]\]/);
  assert.match(p.md, /\[\[yildiray-surmen\]\]/);
  assert.match(p.md, /Özer Üngör\*\*: Dosyayı gönder \(Cuma\)/);
  assert.match(p.md, /Takvim kaydı: YZ ile IFF.*https:\/\/outlook\/e1/);
  assert.match(p.md, /kimlik abcdef12/);
  assert.match(p.md, /doğrulanmalı/);
  assert.equal(p.date, '2026-08-05');
});

test('wiki sayfası tarihi: bağlı takvim kaydı varsa onun tarihi, yoksa kayıt tarihi', () => {
  const base = { s: { ozet: 'x' }, slug: 's', projectSlug: null, personSlugs: new Map<string, string>() };
  const a = buildWikiPage({ ...base, m: meeting({ started_at: null, created_at: '2026-11-09T10:00:00Z' }), event: { subject: 'K', occurred_at: '2026-08-05T12:00:00Z', link: null } as never });
  assert.equal(a.date, '2026-08-05');
  const b = buildWikiPage({ ...base, m: meeting({ started_at: null, created_at: '2026-11-09T10:00:00Z' }), event: null });
  assert.equal(b.date, '2026-11-09');
});
