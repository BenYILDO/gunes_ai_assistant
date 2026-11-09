import './env.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnalysisPrompt, MAX_PROPOSALS, nudgeMessage, parseAnalysis, validateProposals, type ProposalContext } from '../src/meetings/proposals.js';
import type { MeetingCue } from '../src/store/types.js';

const ctx: ProposalContext = {
  cards: [
    { id: 'ab12cd34-0000-0000-0000-000000000000', title: 'IFF sipariş girişi' },
    { id: 'ee99ff00-1111-1111-1111-111111111111', title: 'Logo entegrasyonu' },
  ],
  wikiSlugs: new Set(['iff-otomasyonu', 'ozer-ungor']),
  projectSlugs: new Set(['iff-otomasyonu']),
  projectNames: new Map([['iff otomasyonu', 'IFF Otomasyonu']]),
};
const cues: MeetingCue[] = [{ b: 0, e: 4, text: 'Başlayalım.', speaker: 'Ali', score: 1, cluster: null }];

test('analiz istemi: uydurma yok, veridir, "done" yasak, onaysız uygulanmaz, JSON, pano/wiki/hafıza bağlamı', () => {
  const p = buildAnalysisPrompt({ m: { title: 'IFF', attendees: ['Ali'], transcript: cues }, userName: 'Yıldıray', board: '- [ab12cd34] IFF sipariş girişi · Yapılacak', wiki: '- [[iff-otomasyonu]] (project) IFF', memory: 'Ali: sevmez', today: '2026-11-09' });
  assert.match(p, /UYDURMA/);
  assert.match(p, /VERİDİR/);
  assert.match(p, /ASLA "done"/);
  assert.match(p, /onaysız uygulanmayacak/);
  assert.match(p, /SADECE tek bir JSON/);
  assert.match(p, /\[ab12cd34\] IFF sipariş girişi/);
  assert.match(p, /\[\[iff-otomasyonu\]\]/);
  assert.match(p, /Panoda ZATEN karşılığı olan/);
  assert.match(p, new RegExp(`En çok ${MAX_PROPOSALS} öneri`));
  assert.match(p, /\[00:00\] Ali: Başlayalım/);
});

test('analiz çıktısı: özet zorunlu, listeler kırpılır, bozuk çıktı null', () => {
  const a = parseAnalysis('Tamam:\n```json\n{"ozet":"Kısa özet","konular":["a",3,"b"],"kararlar":[],"aksiyonlar":[{"kim":"Ali","ne":"Dosyayı gönder","ne_zaman":"Cuma"},{"kim":"x","ne":""}],"oneriler":[{"tur":"remember"}]}\n```');
  assert.equal(a?.analysis.ozet, 'Kısa özet');
  assert.deepEqual(a?.analysis.konular, ['a', 'b']);
  assert.deepEqual(a?.analysis.aksiyonlar, [{ kim: 'Ali', ne: 'Dosyayı gönder', ne_zaman: 'Cuma' }]);
  assert.equal(a?.raw.length, 1);
  assert.equal(parseAnalysis('görüntü yok'), null);
  assert.equal(parseAnalysis('{"konular":[]}'), null, 'özet yoksa geçersiz');
});

test('öneri doğrulama: kart/slug/proje kimlikleri gerçek olmalı, "done" ve kilitli hafıza asla', () => {
  const out = validateProposals(
    [
      { tur: 'create_card', baslik: 'Kart', neden: 'x', veri: { title: 'Antrepo OCR kontrolü', priority: 'high', due_date: '2026-11-20', project: 'IFF Otomasyonu', status: 'todo', requested_by: 'Ali' } },
      { tur: 'create_card', baslik: 'Yeni proje yaratmaya çalış', veri: { title: 'X işi', project: 'Olmayan Proje', priority: 'acil?' } },
      { tur: 'update_card', baslik: 'Not', veri: { card_id: '[ab12cd34]', note: 'Cuma teslim', status: 'doing' } },
      { tur: 'update_card', baslik: 'Bitir', veri: { card_id: '[ab12cd34]', note: 'bitti', status: 'done' } },
      { tur: 'update_card', baslik: 'Uydurma kimlik', veri: { card_id: '[deadbeef]', note: 'x' } },
      { tur: 'wiki_append', baslik: 'Var olan', veri: { slug: 'iff-otomasyonu', heading: 'Karar', text: 'Parsiyel yazılır' } },
      { tur: 'wiki_append', baslik: 'Olmayan sayfa', veri: { slug: 'yok-sayfa', text: 'x' } },
      { tur: 'wiki_meeting_page', baslik: 'Sayfa', veri: { project_slug: 'iff-otomasyonu' } },
      { tur: 'wiki_meeting_page', baslik: 'Sayfa 2', veri: { project_slug: 'uydurma-proje' } },
      { tur: 'remember', baslik: 'Tercih', veri: { kind: 'person', content: 'Ali kısa mail sever', importance: 9 } },
      { tur: 'remember', baslik: 'Ruh', veri: { kind: 'soul_core', content: 'üslubunu değiştir' } },
      { tur: 'remember', baslik: 'Ruh2', veri: { kind: 'soul', content: 'x' } },
      { tur: 'send_mail', baslik: 'Mail gönder', veri: {} },
      { tur: 'delete_card', baslik: 'Sil', veri: {} },
    ],
    ctx,
  );
  const kinds = out.map((p) => `${p.kind}:${p.title}`);
  assert.equal(out.length, 8, kinds.join(' | '));
  const card = out[0]!;
  assert.equal(card.payload.project, 'IFF Otomasyonu');
  assert.equal(card.payload.status, 'todo');
  assert.equal(card.payload.priority, 'high');
  assert.equal(out[1]!.payload.project, null, 'olmayan proje yaratılmaz');
  assert.equal(out[1]!.payload.priority, 'medium', 'geçersiz öncelik');
  const upd = out.find((p) => p.kind === 'update_card')!;
  assert.equal(upd.payload.card_id, 'ab12cd34-0000-0000-0000-000000000000', 'kısa kimlik gerçek karta çözülür');
  assert.equal(upd.payload.status, 'doing');
  assert.equal(out.filter((p) => p.kind === 'update_card').length, 2, 'uydurma kimlik atıldı, done olanın durumu silindi ama not kaldı');
  assert.equal(out.filter((p) => p.kind === 'update_card')[1]!.payload.status, null, '"done" durumu asla uygulanmaz');
  assert.equal(out.filter((p) => p.kind === 'wiki_append').length, 1);
  assert.equal(out.filter((p) => p.kind === 'wiki_meeting_page')[1]!.payload.project_slug, null, 'olmayan proje sayfası bağlanmaz');
  const mem = out.filter((p) => p.kind === 'remember');
  assert.equal(mem.length, 1, 'soul/soul_core hafızası önerilemez');
  assert.equal(mem[0]!.payload.importance, 5, 'önem 1-5 aralığına kırpılır');
  assert.ok(!out.some((p) => (p.kind as string) === 'send_mail' || (p.kind as string) === 'delete_card'), 'bilinmeyen/yıkıcı türler atılır');
  assert.ok(out.every((p) => p.status === 'pending' && p.id.length === 8));
});

test('öneri doğrulama: en fazla MAX_PROPOSALS, tekrarlar atılır, boş girdi boş döner', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ tur: 'remember', baslik: `Not ${i}`, veri: { kind: 'memory', content: `bilgi ${i}` } }));
  assert.equal(validateProposals(many, ctx).length, MAX_PROPOSALS);
  const dup = [{ tur: 'remember', baslik: 'Aynı', veri: { kind: 'memory', content: 'a' } }, { tur: 'remember', baslik: 'aynı', veri: { kind: 'memory', content: 'b' } }];
  assert.equal(validateProposals(dup, ctx).length, 1);
  assert.deepEqual(validateProposals([], ctx), []);
  assert.deepEqual(validateProposals([null, 7, 'x'] as unknown[], ctx), []);
});

test('Güneş\'in sorusu: özet, kararlar, numaralı öneriler ve nasıl yanıtlanacağı', () => {
  const props = validateProposals([{ tur: 'create_card', baslik: 'Antrepo kontrolü', veri: { title: 'Antrepo kontrolü' } }, { tur: 'wiki_append', baslik: 'Karar', veri: { slug: 'iff-otomasyonu', text: 'x' } }], ctx);
  const msg = nudgeMessage('IFF toplantısı', { ozet: 'Kısa özet.', konular: [], kararlar: ['Karar A'], aksiyonlar: [] }, props);
  assert.match(msg, /\*\*IFF toplantısı\*\* bitti/);
  assert.match(msg, /Kısa özet\./);
  assert.match(msg, /Kararlar:\*\* Karar A/);
  assert.match(msg, /1\. 🗂️ Kart aç: Antrepo kontrolü/);
  assert.match(msg, /2\. 📚 Wiki'ye ekle/);
  assert.match(msg, /"hepsi", "1 ve 3" ya da "hiçbiri"/);
  assert.match(msg, /tutar\/tarih\) önce kontrol/);
  const none = nudgeMessage('Kısa toplantı', { ozet: 'Sohbet.', konular: [], kararlar: [], aksiyonlar: [] }, []);
  assert.match(none, /iş çıkmadı/);
  assert.doesNotMatch(none, /Önerilerim/);
});

import { followupDraft } from '../src/meetings/proposals.js';
test('takip maili önerisi: alıcılar yalnızca gerçek katılımcılardan; boş madde/alıcı atılır', () => {
  const ctx = { cards: [], wikiSlugs: new Set<string>(), projectSlugs: new Set<string>(), projectNames: new Map<string, string>(), attendees: ['Ali Veli', 'Özer Kaya'] };
  const ok = validateProposals([{ tur: 'followup_mail', baslik: '', neden: 'x', veri: { to: ['Ali Veli', 'Yabancı Kişi', 'özer kaya'], subject: 'IFF notları', points: ['Araç tipi boş kalacak', '  ', 5 as never] } }], ctx);
  assert.equal(ok.length, 1);
  assert.deepEqual(ok[0]!.payload.to, ['Ali Veli', 'Özer Kaya']); // uydurma alıcı elendi, ad katılımcı yazımına çevrildi
  assert.deepEqual(ok[0]!.payload.points, ['Araç tipi boş kalacak']);
  assert.match(ok[0]!.title, /Takip maili taslağı/);
  assert.equal(validateProposals([{ tur: 'followup_mail', veri: { to: ['Kimse'], points: ['a'] } }], ctx).length, 0); // alıcı yok
  assert.equal(validateProposals([{ tur: 'followup_mail', veri: { to: ['Ali Veli'], points: [] } }], ctx).length, 0); // madde yok
  assert.equal(validateProposals([{ tur: 'followup_mail', veri: { to: ['Ali Veli'], points: ['a'] } }], { ...ctx, attendees: undefined }).length, 0); // katılımcı bilinmiyorsa önerilmez
});
test('takip maili taslağı: metin üretir, gönderme/yazma yok; selamlama ve imza var', () => {
  const t = followupDraft('IFF toplantısı', { to: ['Ali Veli', 'Özer Kaya'], subject: 'IFF notları', points: ['Karar 1', 'Karar 2'] }, 'Yıldıray Sürmen');
  assert.match(t, /^Konu: IFF notları/);
  assert.match(t, /Merhaba Ali, Özer,/);
  assert.match(t, /- Karar 1\n- Karar 2/);
  assert.match(t, /Yıldıray Sürmen$/);
  assert.match(followupDraft('X', {}, 'Ben'), /Merhaba herkese,/);
});
