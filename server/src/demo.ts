/**
 * Arayüzü denemek için örnek veri (sadece yerel modda): npm run demo
 * Supabase bağlıysa hiçbir şey yapmaz.
 */
import { ensureSoul } from './agents/soul.js';
import { getStore } from './store/index.js';
import { exportWiki } from './wiki.js';

const store = getStore();
if (store.mode !== 'local') {
  console.log('Supabase bağlı — demo verisi sadece yerel modda yüklenir.');
  process.exit(0);
}
await ensureSoul(store);
const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const wms = await store.upsertProject('WMS Entegrasyonu');
const edi = await store.upsertProject('EDI Geçişi');
const ai = await store.upsertProject('Yapay Zekâ Asistanı');

const cards = [
  { title: 'Müşteri X için EDI test dosyalarını onayla', status: 'inbox', priority: 'critical', project_id: edi.id, requested_by: 'Deniz Kaya', wiki_slug: 'edi-gecisi', due_date: day(0), people: ['Deniz Kaya'], sources: [{ type: 'outlook', title: 'RE: EDI test sonuçları' }], description: '> "Cuma\'ya kadar onay gelmezse canlıya geçişi bir hafta ertelemek zorundayız."' },
  { title: 'Depo ekibine el terminali eğitim tarihini bildir', status: 'inbox', priority: 'medium', project_id: wms.id, people: ['Ece Demir'], sources: [{ type: 'teams', title: 'Depo Operasyon sohbeti' }] },
  { title: 'Bütçe revizyonu sunumunu hazırla', status: 'todo', priority: 'high', due_date: day(2), requested_by: 'Murat Aydın', people: ['Murat Aydın'], sources: [{ type: 'outlook', title: '2027 IT bütçesi' }] },
  { title: 'WMS API dokümantasyonunu incele', status: 'todo', priority: 'medium', project_id: wms.id },
  { title: 'Rota optimizasyonu PoC sonuçlarını raporla', status: 'doing', priority: 'high', project_id: ai.id, due_date: day(1) },
  { title: 'Güneş arayüzünü tamamla', status: 'doing', priority: 'medium', project_id: ai.id, created_by: 'user' },
  { title: 'Tedarikçiden lisans teklifi bekleniyor', status: 'waiting', priority: 'medium', waiting_on: 'them', people: ['Selin Yıldız'], due_date: day(-1), sources: [{ type: 'outlook', title: 'Lisans yenileme teklifi' }] },
  { title: 'Siber güvenlik denetim raporu', status: 'waiting', priority: 'low', waiting_on: 'Bilgi Güvenliği' },
  { title: 'VPN erişim talebine cevap ver', status: 'review', priority: 'medium', close_reason: 'Dün 16:40\'ta cevap verdiğinizi gönderilmiş maillerde gördüm; karşı taraf "teşekkürler, çalışıyor" dedi.', people: ['Can Öztürk'] },
  { title: 'Sunucu bakım penceresini duyur', status: 'done', priority: 'low', closed_at: ago(20) },
] as const;

for (const [i, c] of cards.entries()) {
  const card = await store.createCard({ ...c, people: [...('people' in c ? c.people : [])], sources: [...('sources' in c ? c.sources : [])] as never, position: i, created_by: 'created_by' in c ? c.created_by : 'gunes' } as never);
  await store.updateCard(card.id, { created_at: ago(i * 7 + 1), updated_at: ago(i * 3 + 1) });
  await store.addActivity({ card_id: card.id, actor: 'gunes', kind: 'created', message: 'Güneş kartı açtı.' });
}

await store.createBriefing({
  kind: 'morning',
  headline: 'Günaydın Yıldıray Bey, bugün 2 öncelikli iş ve cevap bekleyen 3 mail var.',
  content: `## 🔥 Bugün öncelikli
- **Müşteri X EDI onayı** bugün bitmeli; Deniz Kaya Cuma'dan sonra canlıya geçişi erteleyeceklerini yazmış.
- **Rota optimizasyonu PoC raporu** yarın teslim.

## ✉️ Sizden cevap bekleyenler
- Ece Demir: el terminali eğitim tarihi (Teams, 2 gün önce)
- Murat Aydın: bütçe revizyonu için toplantı saati

## ⏳ Sizin beklediğiniz
- Selin Yıldız'dan lisans teklifi — **dün dönmesi gerekiyordu**

## 📅 Bugünün toplantıları
- 10:30 WMS haftalık durum · 14:00 Bütçe ön görüşme

## 💭 Güneş'in notu
- EDI geçişinde finans ekibi henüz hiçbir yazışmada yok. Faturalama akışı da etkilenecekse erken dahil etmek iyi olabilir. *(güven: orta)*`,
  stats: { urgent: 2, awaiting_my_reply: 3, waiting_on_others: 2, meetings_today: 2, new_cards: 3 },
});
await store.createBriefing({ kind: 'tracker', headline: 'Deniz Kaya test dosyalarının ikinci versiyonunu gönderdi.', content: '- EDI kartına ek yapıldı.', stats: {} });

await store.createSuggestion({ kind: 'reminder', title: 'Ece Demir\'in eğitim tarihi sorusu 2 gündür cevapsız', body: 'Teams\'te 2 gün önce sordu, cevap görmedim.', card_id: null });
await store.createSuggestion({ kind: 'followup', title: 'Selin Yıldız\'dan lisans teklifi gecikti', body: 'Dün gelmesi gerekiyordu. Kısa bir hatırlatma maili taslağı hazırlayabilirim.', card_id: null });
await store.createSuggestion({ kind: 'question', title: 'EDI geçişinde finans ekibi neden döngüde değil?', body: 'Faturalama akışı etkilenecekse erken dahil etmek riskleri azaltır. Bilerek yapıldıysa söylemeniz yeterli.', card_id: null });

await store.createMemory({ kind: 'person', key: 'Deniz Kaya', content: 'Müşteri X tarafında EDI projesinin teknik sorumlusu. Tarihlere çok sadık, gecikmeyi hemen yazar.', importance: 4 });
await store.createMemory({ kind: 'lesson', content: 'Bülten ve sistem bildirimlerinden kart açmamalıyım.', importance: 4 });
await store.createMemory({ kind: 'project', key: 'EDI Geçişi', content: 'Müşteri X ile EDI geçişi; canlıya geçiş Cuma hedefleniyor.', original_excerpt: 'Cuma\'ya kadar onay gelmezse canlıya geçişi bir hafta ertelemek zorundayız.', importance: 5 });
await store.addJournal('Sabah taramasında 14 yeni mail ve 6 Teams mesajı gördüm. 3 kart açtım, EDI kartının önceliğini kritiğe çektim. Finans ekibinin EDI yazışmalarında hiç olmaması dikkatimi çekti.');
await store.setState('last_collect', ago(1.2));
await store.setState('last_morning', ago(2));
const r = await store.startRun('morning');
await store.finishRun(r.id, { status: 'ok' });
await store.upsertWikiPage({
  slug: 'genel-bakis',
  title: 'Genel bakış',
  kind: 'overview',
  summary: 'Aktif projeler ve kişiler',
  content: '## Aktif projeler\n- [[edi-gecisi]] — canlıya geçiş Cuma\n- [[wms-entegrasyonu]] — el terminali eğitimi bekliyor\n\n## Sık yazışılanlar\n- [[deniz-kaya]] (Müşteri X)\n- [[ece-demir]] (Depo Operasyon)',
  links: ['edi-gecisi', 'wms-entegrasyonu', 'deniz-kaya', 'ece-demir'],
  sources: [],
});
await store.upsertWikiPage({
  slug: 'edi-gecisi',
  title: 'EDI Geçişi',
  kind: 'project',
  summary: 'Müşteri X ile EDI entegrasyonu; canlıya geçiş Cuma hedefleniyor',
  content: '## Amaç\nMüşteri X sipariş ve irsaliye akışının EDI üzerinden otomatikleşmesi.\n\n## Durum\nTest dosyaları onay bekliyor. **Risk:** onay gecikirse canlıya geçiş bir hafta kayar.\n\n> "Cuma\'ya kadar onay gelmezse canlıya geçişi bir hafta ertelemek zorundayız." (mail, [[deniz-kaya]])\n\n## Kimler\n- [[deniz-kaya]] — Müşteri X teknik sorumlu\n\n## Zaman çizelgesi\n| Tarih | Olay | Kaynak |\n|---|---|---|\n| 28 Eki | Test dosyaları v1 gönderildi | mail |\n| 2 Kas | v2 geldi, onay bekleniyor | mail |\n\n## Açık sorular\n- Finans ekibi faturalama akışına dahil edilecek mi?',
  links: ['deniz-kaya'],
  sources: [{ type: 'outlook', title: 'RE: EDI test sonuçları' }],
});
await store.upsertWikiPage({
  slug: 'deniz-kaya',
  title: 'Deniz Kaya',
  kind: 'person',
  summary: 'Müşteri X — EDI teknik sorumlusu',
  content: '## Rol\nMüşteri X tarafında EDI projesinin teknik sorumlusu.\n\n## İşler\n- [[edi-gecisi]]\n\n## İletişim notları\nTarihlere çok sadık; gecikmeyi hemen yazıyor.',
  links: ['edi-gecisi'],
  sources: [],
});
const ev = await store.insertEvents([
  { source: 'teams', external_id: 'demo-t1', occurred_at: ago(3), from_name: 'Bahadır Bey', from_address: null, subject: 'Fiyat verileri', summary: 'Bahadır Bey şube bazlı güncel fiyat verilerini istiyor.', excerpt: null, link: null, needs_reply: true, waiting_on: 'me', due_date: null, importance: 4, project_hint: 'Fiyat otomasyonu', thread_id: 'chat-demo-1' },
]);
void ev;
const at = (hUtc: number) => { const d = new Date(); d.setUTCHours(hUtc, 0, 0, 0); return d.toISOString(); };
await store.insertEvents([
  { source: 'calendar', external_id: 'demo-c1', occurred_at: at(12), from_name: null, from_address: null, subject: 'WMS haftalık durum', summary: 'WMS haftalık durum toplantısı', excerpt: null, link: null, needs_reply: false, waiting_on: null, due_date: null, importance: 3, project_hint: 'WMS', processed: true },
  { source: 'calendar', external_id: 'demo-c2', occurred_at: at(14), from_name: null, from_address: null, subject: 'Bütçe ön görüşme', summary: 'Bütçe ön görüşme', excerpt: null, link: null, needs_reply: false, waiting_on: null, due_date: null, importance: 3, project_hint: null, processed: true },
]);
const evRow = (await store.listEvents({ limit: 50 })).find((e) => e.external_id === 'demo-t1')!;
await store.updateEvents([evRow.id], { processed: true });
const target = (await store.listCards()).find((c) => c.title.startsWith('Rota'))!;
await store.createPendingAction({
  action: 'confirm_link',
  target_id: target.id,
  title: "Bahadır Bey'in şube fiyat verisi talebi, 'Rota optimizasyonu PoC' kartıyla aynı iş mi?",
  reason: `Kart: ${target.title}`,
  payload: { event_ids: [evRow.id], new_card_title: 'Bahadır Bey için şube fiyat verilerini hazırla', requested_by: 'Bahadır Bey' },
});
await exportWiki(store);
console.log('Demo verisi yüklendi → data/local-db.json');
