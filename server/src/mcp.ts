/**
 * Güneş MCP sunucusu.
 * Claude (ajanlar, arayüzdeki sohbet ve repodaki Claude Code oturumları) panoya,
 * olaylara ve hafızaya sadece bu araçlar üzerinden yazar. Böylece her yazma
 * şema ile doğrulanır ve güvenlik kuralları (ör. Güneş kartı "Bitti"ye taşıyamaz)
 * kodda uygulanır.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildBoardContext, ensureSoul, formatEvents, STATUS_TR } from './agents/soul.js';
import { extractLinks, slugify } from './wiki.js';
import { config } from './config.js';
import { getStore, type Card, type CardStatus, type SourceRef } from './store/index.js';

const store = getStore();
/** Araçları kimin çağırdığı: ajan çalışmaları 'gunes', Claude Code oturumları da 'gunes' sayılır. */
const ACTOR = 'gunes' as const;

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const fail = (text: string) => ({ content: [{ type: 'text' as const, text: `HATA: ${text}` }], isError: true });

async function resolveCard(idOrPrefix: string): Promise<Card> {
  const cards = await store.listCards({ includeDone: true });
  const hits = cards.filter((c) => c.id.startsWith(idOrPrefix.trim()));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`Kart bulunamadı: ${idOrPrefix}`);
  throw new Error(`Birden fazla kart eşleşti, daha uzun id verin: ${idOrPrefix}`);
}

async function resolveEventIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const events = await store.listEvents({ limit: 5000, sinceDays: 120 });
  return ids
    .map((p) => events.find((e) => e.id.startsWith(p.trim()))?.id)
    .filter((x): x is string => Boolean(x));
}

async function projectId(name?: string | null) {
  if (!name) return null;
  return (await store.upsertProject(name.trim())).id;
}

const sourceSchema = z.object({
  type: z.enum(['outlook', 'teams', 'calendar', 'chat', 'other']),
  external_id: z.string().optional(),
  link: z.string().optional(),
  title: z.string().optional(),
  date: z.string().optional(),
});
const agentStatus = z.enum(['inbox', 'todo', 'doing', 'waiting', 'review']);
const priority = z.enum(['low', 'medium', 'high', 'critical']);

const server = new McpServer({ name: 'gunes', version: '0.1.0' });

// ---------------------------------------------------------------- Olaylar
server.registerTool(
  'record_events',
  {
    description:
      'Outlook/Teams/takvimden çıkarılan iş açısından anlamlı öğeleri kaydeder. Aynı kaynak+external_id zaten varsa atlanır. Bültenleri ve otomatik bildirimleri KAYDETME.',
    inputSchema: {
      events: z
        .array(
          z.object({
            source: z.enum(['outlook', 'teams', 'calendar', 'other']),
            external_id: z.string().describe('Mesajın/etkinliğin connector tarafından verilen kimliği'),
            occurred_at: z.string().describe('ISO tarih-saat'),
            from_name: z.string().nullable().optional(),
            from_address: z.string().nullable().optional(),
            subject: z.string().nullable().optional(),
            summary: z.string().describe('1-3 cümlelik Türkçe özet: kim, ne istiyor/ne oldu'),
            excerpt: z
              .string()
              .nullable()
              .optional()
              .describe('Kritik cümlelerin ORİJİNAL hali (söz, tarih, rakam, karar içerenler)'),
            link: z.string().nullable().optional(),
            needs_reply: z.boolean().default(false),
            waiting_on: z.enum(['me', 'them']).nullable().optional(),
            due_date: z.string().nullable().optional().describe('YYYY-MM-DD'),
            importance: z.number().int().min(1).max(5).default(3),
            project_hint: z.string().nullable().optional(),
            from_me: z.boolean().default(false).describe('Mesajı KULLANICININ KENDİSİ mi gönderdi (gönderilen mail / kendi Teams mesajı)'),
            thread_id: z
              .string()
              .nullable()
              .optional()
              .describe('Konuşma dizisi: Outlook conversationId; yoksa "subj:" + RE/FW ön ekleri atılmış konu. Teams: chatId (URI içindeki)'),
          }),
        )
        .max(100),
    },
  },
  async ({ events }) => {
    const r = await store.insertEvents(
      events.map((e) => ({
        source: e.source,
        external_id: e.external_id,
        occurred_at: e.occurred_at,
        from_name: e.from_name ?? null,
        from_address: e.from_address ?? null,
        subject: e.subject ?? null,
        summary: e.summary,
        excerpt: e.excerpt ?? null,
        link: e.link ?? null,
        needs_reply: e.needs_reply,
        waiting_on: e.waiting_on ?? null,
        due_date: e.due_date || null,
        importance: e.importance,
        project_hint: e.project_hint ?? null,
        from_me: e.from_me,
        thread_id: e.thread_id || null,
      })),
    );
    return ok(`${r.inserted} yeni olay kaydedildi, ${r.skipped} tanesi zaten vardı.`);
  },
);

server.registerTool(
  'list_unprocessed_events',
  { description: 'Henüz panoya işlenmemiş olayları listeler.', inputSchema: {} },
  async () => {
    const ev = await store.listEvents({ unprocessed: true, limit: 150 });
    if (!ev.length) return ok('İşlenmemiş olay yok.');
    return ok(await formatEvents(store, ev));
  },
);

server.registerTool(
  'search_events',
  {
    description: 'Geçmiş olaylarda (son N gün) metin arar. Bir konunun geçmişini hatırlamak için kullan.',
    inputSchema: { query: z.string(), days: z.number().int().min(1).max(120).default(45) },
  },
  async ({ query, days }) => {
    const q = query.toLocaleLowerCase('tr');
    const ev = (await store.listEvents({ sinceDays: days, limit: 5000 })).filter((e) =>
      [e.subject, e.summary, e.excerpt, e.from_name, e.project_hint].some((f) => f?.toLocaleLowerCase('tr').includes(q)),
    );
    if (!ev.length) return ok('Eşleşen olay yok.');
    return ok(
      ev
        .slice(-40)
        .map((e) => `[${e.id.slice(0, 8)}] ${e.occurred_at.slice(0, 10)} ${e.from_name ?? ''}: ${e.subject ?? ''} — ${e.summary}`)
        .join('\n'),
    );
  },
);

server.registerTool(
  'mark_events_processed',
  {
    description: 'Olayları işlenmiş olarak işaretler. Bir kartla ilişkiliyse card_id ver.',
    inputSchema: { event_ids: z.array(z.string()).min(1), card_id: z.string().optional() },
  },
  async ({ event_ids, card_id }) => {
    const ids = await resolveEventIds(event_ids);
    const card = card_id ? await resolveCard(card_id) : null;
    await store.updateEvents(ids, { processed: true, ...(card ? { card_id: card.id } : {}) });
    return ok(`${ids.length} olay işlendi olarak işaretlendi.`);
  },
);

// ---------------------------------------------------------------- Pano
server.registerTool(
  'list_board',
  { description: 'Kanban panosunun güncel halini (açık kartlar, projeler) gösterir.', inputSchema: {} },
  async () => ok(await buildBoardContext(store)),
);

server.registerTool(
  'get_card',
  { description: 'Bir kartın tüm ayrıntısını ve geçmişini getirir.', inputSchema: { id: z.string() } },
  async ({ id }) => {
    try {
      const c = await resolveCard(id);
      const act = await store.listActivity(c.id);
      return ok(
        JSON.stringify({ ...c, activity: act.slice(0, 15).map((a) => `${a.created_at.slice(0, 16)} ${a.actor}: ${a.message}`) }, null, 1),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

server.registerTool(
  'create_card',
  {
    description:
      'Yeni kanban kartı açar. Açmadan önce list_board ile benzer kart olup olmadığını kontrol et; varsa update_card kullan. Başlık kısa ve eylem odaklı olsun ("X\'e teklif cevabı gönder").',
    inputSchema: {
      title: z.string().min(3).max(140),
      description: z.string().optional().describe('Bağlam, kim ne istedi, orijinal kritik cümle'),
      status: agentStatus.default('inbox'),
      priority: priority.default('medium'),
      project: z.string().optional().describe('Proje adı; yoksa oluşturulur'),
      due_date: z.string().optional().describe('YYYY-MM-DD'),
      waiting_on: z.string().optional().describe("'me', 'them' veya kişi adı"),
      requested_by: z.string().optional().describe('İşi isteyen / kimden geldiği (ad soyad). Kullanıcının kendi işiyse boş bırak.'),
      wiki_slug: z.string().optional().describe('İlgili proje wiki sayfasının slug’ı'),
      people: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),
      sources: z.array(sourceSchema).default([]),
      event_ids: z.array(z.string()).default([]).describe('Bu kartın dayandığı olaylar; işlenmiş olarak işaretlenir'),
    },
  },
  async (a) => {
    const card = await store.createCard({
      title: a.title,
      description: a.description ?? null,
      status: a.status,
      priority: a.priority,
      project_id: await projectId(a.project),
      due_date: a.due_date || null,
      waiting_on: a.waiting_on ?? null,
      people: a.people,
      tags: a.tags,
      sources: a.sources as SourceRef[],
      requested_by: a.requested_by ?? null,
      wiki_slug: a.wiki_slug ?? null,
      created_by: 'gunes',
      position: Date.now() / 1e12,
    });
    await store.addActivity({ card_id: card.id, actor: ACTOR, kind: 'created', message: 'Güneş kartı açtı.' });
    const ids = await resolveEventIds(a.event_ids);
    if (ids.length) await store.updateEvents(ids, { processed: true, card_id: card.id });
    return ok(`Kart açıldı: [${card.id.slice(0, 8)}] ${card.title}`);
  },
);

server.registerTool(
  'update_card',
  {
    description:
      'Var olan kartı günceller (başlık, açıklama, öncelik, tarih, kişiler, kaynak ekleme). Durum değiştirmek için move_card kullan. note verirsen kart geçmişine eklenir.',
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: priority.optional(),
      project: z.string().optional(),
      due_date: z.string().nullable().optional(),
      waiting_on: z.string().nullable().optional(),
      requested_by: z.string().optional(),
      wiki_slug: z.string().optional(),
      add_people: z.array(z.string()).optional(),
      add_tags: z.array(z.string()).optional(),
      add_sources: z.array(sourceSchema).optional(),
      event_ids: z.array(z.string()).optional(),
      note: z.string().optional().describe('Bu güncellemenin nedeni / ilerleme notu'),
    },
  },
  async (a) => {
    try {
      const c = await resolveCard(a.id);
      const patch: Partial<Card> = {};
      if (a.title) patch.title = a.title;
      if (a.description !== undefined) patch.description = a.description;
      if (a.priority) patch.priority = a.priority;
      if (a.project) patch.project_id = await projectId(a.project);
      if (a.due_date !== undefined) patch.due_date = a.due_date || null;
      if (a.waiting_on !== undefined) patch.waiting_on = a.waiting_on;
      if (a.requested_by) patch.requested_by = a.requested_by;
      if (a.wiki_slug) patch.wiki_slug = a.wiki_slug;
      if (a.add_people) patch.people = [...new Set([...c.people, ...a.add_people])];
      if (a.add_tags) patch.tags = [...new Set([...c.tags, ...a.add_tags])];
      if (a.add_sources) patch.sources = [...c.sources, ...(a.add_sources as SourceRef[])];
      await store.updateCard(c.id, patch);
      await store.addActivity({
        card_id: c.id,
        actor: ACTOR,
        kind: a.note ? 'note' : 'updated',
        message: a.note ?? `Güncellendi: ${Object.keys(patch).join(', ')}`,
      });
      const ids = await resolveEventIds(a.event_ids ?? []);
      if (ids.length) await store.updateEvents(ids, { processed: true, card_id: c.id });
      return ok(`Kart güncellendi: [${c.id.slice(0, 8)}] ${patch.title ?? c.title}`);
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

server.registerTool(
  'move_card',
  {
    description:
      "Kartın sütununu değiştirir. Güneş kartı 'done' (Bitti) yapamaz; iş bitmiş görünüyorsa 'review' (Kapatılabilir) sütununa gerekçesiyle taşı, kullanıcı onaylasın.",
    inputSchema: { id: z.string(), status: agentStatus, reason: z.string().min(3) },
  },
  async ({ id, status, reason }) => {
    try {
      const c = await resolveCard(id);
      if (c.status === 'done') return fail('Kart kullanıcı tarafından kapatılmış; yeniden açmak için kullanıcıya sor.');
      await store.updateCard(c.id, {
        status: status as CardStatus,
        ...(status === 'review' ? { close_reason: reason } : {}),
      });
      await store.addActivity({
        card_id: c.id,
        actor: ACTOR,
        kind: 'moved',
        message: `${STATUS_TR[c.status]} → ${STATUS_TR[status]}: ${reason}`,
      });
      return ok(`Kart taşındı: ${c.title} → ${STATUS_TR[status]}`);
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

// ---------------------------------------------------------------- Öneri & brifing
server.registerTool(
  'add_suggestion',
  {
    description:
      'Kullanıcıya öneri/hatırlatma/soru bırakır. kind: reminder (unutulan iş), followup (takip edilmesi gereken), risk, question (sorgulayıcı soru — brifing başına en fazla 2), idea.',
    inputSchema: {
      kind: z.enum(['reminder', 'risk', 'question', 'followup', 'idea']),
      title: z.string().max(160),
      body: z.string().optional().describe('Kanıt ve gerekçe; güven seviyesini belirt'),
      card_id: z.string().optional(),
    },
  },
  async (a) => {
    const card = a.card_id ? await resolveCard(a.card_id).catch(() => null) : null;
    const open = await store.listSuggestions('open');
    if (open.some((s) => s.title.trim().toLowerCase() === a.title.trim().toLowerCase()))
      return ok('Bu öneri zaten açık, tekrar eklenmedi.');
    await store.createSuggestion({ kind: a.kind, title: a.title, body: a.body ?? null, card_id: card?.id ?? null });
    return ok('Öneri eklendi.');
  },
);

server.registerTool(
  'write_briefing',
  {
    description:
      'Brifingi yazar. morning: sabah karşılama brifingi; tracker: 2 saatlik gelişme özeti. headline kısa ve sıcak bir cümle olsun. content markdown.',
    inputSchema: {
      kind: z.enum(['morning', 'tracker']),
      headline: z.string().max(200),
      content: z.string(),
      stats: z
        .object({
          urgent: z.number().int().optional(),
          awaiting_my_reply: z.number().int().optional(),
          waiting_on_others: z.number().int().optional(),
          new_cards: z.number().int().optional(),
          updated_cards: z.number().int().optional(),
          meetings_today: z.number().int().optional(),
        })
        .default({}),
    },
  },
  async (a) => {
    await store.createBriefing({ kind: a.kind, headline: a.headline, content: a.content, stats: a.stats });
    return ok('Brifing kaydedildi.');
  },
);

// ---------------------------------------------------------------- Sohbete özel eylemler
// (Ajan çalışmalarında kapalıdır; bkz. runner.ts → toolPreset)
server.registerTool(
  'start_scan',
  {
    description:
      "Outlook/Teams taramasını arka planda başlatır. morning: son 24 saat + takvim + sabah brifingi; tracker: son taramadan bu yana gelenler. Kullanıcı açıkça 'tara' dediğinde kullan. Birkaç dakika sürer; sonuç panoya ve brifinge düşer, beklemene gerek yok.",
    inputSchema: { kind: z.enum(['morning', 'tracker']).default('tracker') },
  },
  async ({ kind }) => {
    try {
      const res = await fetch(`http://127.0.0.1:${config.port}/api/run/${kind}`, { method: 'POST' });
      if (!res.ok) return fail(`Tarama başlatılamadı (HTTP ${res.status}).`);
      return ok(
        `${kind === 'morning' ? 'Sabah taraması' : 'Gelişme taraması'} başlatıldı. Başka bir çalışma sürüyorsa sıraya girdi. Sonuçlar birkaç dakika içinde panoya ve brifinge düşecek; başlıktaki durum satırından izlenebilir.`,
      );
    } catch {
      return fail('Güneş sunucusuna ulaşılamadı (npm start çalışıyor mu?).');
    }
  },
);

server.registerTool(
  'propose_deletion',
  {
    description:
      'Bir kartın ya da hafıza kaydının silinmesini ÖNERİR. Silme işlemini sen yapmazsın; kullanıcı arayüzde onaylarsa silinir. Kullanıcı silmek istediğini söylediğinde ya da kayıt açıkça yanlış/tekrar ise kullan.',
    inputSchema: {
      target: z.enum(['card', 'memory']),
      id: z.string().describe('Kart veya hafıza kaydının id’si (ilk 8 karakter yeterli)'),
      reason: z.string().min(3).describe('Neden silinmeli'),
    },
  },
  async ({ target, id, reason }) => {
    try {
      let targetId: string;
      let title: string;
      if (target === 'card') {
        const c = await resolveCard(id);
        targetId = c.id;
        title = c.title;
      } else {
        const m = (await store.listMemories()).find((x) => x.id.startsWith(id.trim()));
        if (!m) return fail('Hafıza kaydı bulunamadı.');
        if (m.locked) return fail('Bu kayıt ruhun çekirdeği; silinemez.');
        targetId = m.id;
        title = `${m.key ? `${m.key}: ` : ''}${m.content.slice(0, 80)}`;
      }
      const pending = await store.listPendingActions('pending');
      if (pending.some((p) => p.target_id === targetId)) return ok('Bu kayıt için zaten onay bekleyen bir silme önerisi var.');
      await store.createPendingAction({ action: target === 'card' ? 'delete_card' : 'delete_memory', target_id: targetId, title, reason });
      return ok(`Silme önerisi oluşturuldu: "${title}". Kullanıcı panodaki "Onayınızı bekliyor" bölümünden onaylayınca silinecek.`);
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

// ---------------------------------------------------------------- Belirsiz eşleşmeler ve diziler
server.registerTool(
  'ask_link',
  {
    description:
      'Yeni olay(lar) var olan bir kartla AYNI iş mi, emin değilsen kullanıcıya SOR. Karar verilene kadar olaylar beklemede kalır. Onaylanırsa karta bağlanır; reddedilirse olaylardan ayrı bir kart açılır. Farklı kişilerden gelen, farklı yer/kurum/sistem adı geçen işleri asla sormadan birleştirme.',
    inputSchema: {
      event_ids: z.array(z.string()).min(1),
      card_id: z.string(),
      question: z.string().describe('Kısa soru, örn: "Bahadır Bey\'in EPDK verisi talebi, Akaryakıt fiyat otomasyonu kartıyla aynı iş mi?"'),
      new_card_title: z.string().describe('Farklı iş çıkarsa açılacak kartın başlığı'),
      requested_by: z.string().optional(),
    },
  },
  async ({ event_ids, card_id, question, new_card_title, requested_by }) => {
    try {
      const card = await resolveCard(card_id);
      const ids = await resolveEventIds(event_ids);
      if (!ids.length) return fail('Olay bulunamadı.');
      await store.createPendingAction({
        action: 'confirm_link',
        target_id: card.id,
        title: question,
        reason: `Kart: ${card.title}`,
        payload: { event_ids: ids, new_card_title, requested_by: requested_by ?? null },
      });
      // Karar verilene kadar planlayıcı bu olayları tekrar işlemesin
      await store.updateEvents(ids, { processed: true });
      return ok('Kullanıcıya soruldu; cevap gelene kadar bu olaylar beklemede.');
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

server.registerTool(
  'link_thread',
  {
    description:
      'Bir mail dizisini ya da Teams sohbetini bir projeye (wiki sayfası) ve/veya karta kalıcı olarak bağlar. Bundan sonra o diziye gelen her mesaj otomatik olarak o projeye ait sayılır. Kullanıcı açıkça istediğinde ya da dizi zaten açıkça o işe aitse kullan.',
    inputSchema: {
      thread_id: z.string(),
      source: z.enum(['outlook', 'teams']).default('outlook'),
      page_slug: z.string().optional(),
      card_id: z.string().optional(),
      note: z.string().optional(),
    },
  },
  async ({ thread_id, source, page_slug, card_id, note }) => {
    try {
      const card = card_id ? await resolveCard(card_id) : null;
      const slug = page_slug ? slugify(page_slug) : null;
      if (slug && !(await store.getWikiPage(slug))) return fail(`Wiki sayfası yok: ${slug}. Önce wiki_write ile oluştur.`);
      await store.upsertThreadLink({ thread_id, source, page_slug: slug, card_id: card?.id ?? null, note: note ?? null });
      return ok(`Dizi bağlandı${slug ? ` → [[${slug}]]` : ''}${card ? ` → kart ${card.title}` : ''}.`);
    } catch (e) {
      return fail((e as Error).message);
    }
  },
);

server.registerTool(
  'search_chats',
  {
    description: 'Kullanıcıyla Güneş arayüzünde yapılmış ESKİ sohbetlerde arama yapar ("geçen konuştuğumuz…" gibi durumlar için).',
    inputSchema: { query: z.string().min(2) },
  },
  async ({ query }) => {
    const rows = await store.searchChatMessages(query, 25);
    if (!rows.length) return ok('Eski sohbetlerde eşleşme yok.');
    return ok(
      rows
        .map((m) => `${m.created_at.slice(0, 16)} · "${m.session_title}" · ${m.role === 'user' ? 'Kullanıcı' : 'Güneş'}: ${m.content.slice(0, 400)}`)
        .join('\n\n'),
    );
  },
);

// ---------------------------------------------------------------- Wiki
server.registerTool(
  'wiki_index',
  {
    description: "Wiki'nin kataloğu (index.md): tüm sayfalar, türü ve tek satırlık özeti. Bir şeyi yanıtlamadan veya sayfa yazmadan önce önce buna bak.",
    inputSchema: {},
  },
  async () => {
    const pages = await store.listWikiPages();
    if (!pages.length) return ok('Wiki henüz boş.');
    return ok(pages.map((p) => `- [[${p.slug}]] (${p.kind}) ${p.title} — ${p.summary} · ${p.updated_at.slice(0, 10)}`).join('\n'));
  },
);

server.registerTool(
  'wiki_read',
  { description: 'Bir wiki sayfasını tam olarak okur.', inputSchema: { slug: z.string() } },
  async ({ slug }) => {
    const p = await store.getWikiPage(slugify(slug));
    if (!p) return fail(`Sayfa yok: ${slug}`);
    const backlinks = (await store.listWikiPages()).filter((x) => x.links.includes(p.slug)).map((x) => `[[${x.slug}]]`);
    return ok(
      `# ${p.title} (${p.kind})\n${p.summary}\n\n${p.content}\n\n---\nKaynaklar: ${p.sources.length}\nBu sayfaya bağlananlar: ${backlinks.join(', ') || '-'}`,
    );
  },
);

server.registerTool(
  'wiki_write',
  {
    description:
      "Wiki sayfası oluşturur ya da günceller (içeriğin TAMAMINI yazarsın; önce wiki_read ile mevcut hali oku ve koru). Kurallar: markdown; diğer sayfalara [[slug]] ile bağlan; her önemli iddianın sonuna kaynağını yaz (ör. '(mail, 28 Eki, Bahadır Bey)'); kritik cümleleri alıntı olarak aynen koru; çelişki görürsen '⚠️ Çelişki:' diye işaretle. Proje sayfasında: Amaç, Durum, Kimler, Zaman çizelgesi, İlgili yazışmalar, Açık sorular. Kişi sayfasında: Rol, Hangi işler, İletişim notları.",
    inputSchema: {
      slug: z.string().describe('küçük harf, tire ile: akaryakit-fiyat-otomasyonu'),
      title: z.string(),
      kind: z.enum(['project', 'person', 'topic', 'thread', 'overview']),
      summary: z.string().max(200).describe('index için tek satır'),
      content: z.string().max(20000),
      add_sources: z.array(sourceSchema).default([]),
    },
  },
  async (a) => {
    const slug = slugify(a.slug);
    const existing = await store.getWikiPage(slug);
    await store.upsertWikiPage({
      slug,
      title: a.title,
      kind: a.kind,
      summary: a.summary,
      content: a.content,
      links: extractLinks(a.content).filter((l) => l !== slug),
      sources: [...(existing?.sources ?? []), ...(a.add_sources as SourceRef[])].slice(-200),
    });
    return ok(`Wiki ${existing ? 'güncellendi' : 'oluşturuldu'}: [[${slug}]]`);
  },
);

server.registerTool(
  'wiki_search',
  { description: 'Wiki sayfalarının başlık, özet ve içeriğinde arama yapar.', inputSchema: { query: z.string() } },
  async ({ query }) => {
    const q = query.toLocaleLowerCase('tr');
    const hits = (await store.listWikiPages()).filter((p) =>
      [p.title, p.summary, p.content].some((f) => f.toLocaleLowerCase('tr').includes(q)),
    );
    if (!hits.length) return ok('Wiki’de eşleşme yok.');
    return ok(hits.slice(0, 15).map((p) => `[[${p.slug}]] ${p.title} — ${p.summary}`).join('\n'));
  },
);

// ---------------------------------------------------------------- Hafıza
server.registerTool(
  'remember',
  {
    description:
      'Uzun vadeli hafızaya yazar. Önemli anılarda orijinal cümleyi original_excerpt olarak sakla (özetleme!). kind: memory (genel bilgi), lesson (öğrenilen ders/kullanıcı tercihi), person (kişi), project (proje bağlamı), user (kullanıcı hakkında), soul (zamanla öğrenilen üslup — sadece kullanıcı onayladıysa).',
    inputSchema: {
      kind: z.enum(['memory', 'lesson', 'person', 'project', 'user', 'soul']),
      key: z.string().optional().describe('Kişi/proje adı veya kısa konu'),
      content: z.string(),
      original_excerpt: z.string().optional(),
      importance: z.number().int().min(1).max(5).default(3),
      source: z.string().optional().describe('Nereden öğrenildi (mail konusu, tarih, sohbet)'),
    },
  },
  async (a) => {
    const existing = (await store.listMemories([a.kind])).find(
      (m) => a.key && m.key?.toLocaleLowerCase('tr') === a.key.toLocaleLowerCase('tr'),
    );
    if (existing && a.kind !== 'lesson' && a.kind !== 'memory') {
      await store.updateMemory(existing.id, {
        content: a.content,
        importance: Math.max(existing.importance, a.importance),
        original_excerpt: a.original_excerpt ?? existing.original_excerpt,
        strength: existing.strength + 0.5,
      });
      return ok(`Hafıza güncellendi (${a.kind}: ${a.key}).`);
    }
    await store.createMemory({
      kind: a.kind,
      key: a.key ?? null,
      content: a.content,
      original_excerpt: a.original_excerpt ?? null,
      importance: a.importance,
      source: a.source ? { note: a.source } : null,
    });
    return ok('Hafızaya yazıldı.');
  },
);

server.registerTool(
  'recall',
  {
    description: 'Hafızada arama yapar ve bulunan anıları güçlendirir (hatırlanan anı canlı kalır).',
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    const q = query.toLocaleLowerCase('tr');
    const hits = (await store.listMemories()).filter((m) =>
      [m.key, m.content, m.original_excerpt].some((f) => f?.toLocaleLowerCase('tr').includes(q)),
    );
    for (const m of hits.slice(0, 10))
      if (!m.locked)
        await store.updateMemory(m.id, { strength: m.strength + 0.25, last_recalled_at: new Date().toISOString() });
    if (!hits.length) return ok('Hafızada eşleşme yok.');
    return ok(
      hits
        .slice(0, 20)
        .map((m) => `[${m.id.slice(0, 8)}] (${m.kind}${m.key ? `: ${m.key}` : ''}, önem ${m.importance}) ${m.content}${m.original_excerpt ? `\n  > "${m.original_excerpt}"` : ''}`)
        .join('\n'),
    );
  },
);

server.registerTool(
  'update_memory',
  {
    description: 'Var olan bir hafıza kaydını düzeltir veya önemini değiştirir. Kilitli (ruh çekirdeği) kayıtlar değiştirilemez.',
    inputSchema: {
      id: z.string(),
      content: z.string().optional(),
      importance: z.number().int().min(1).max(5).optional(),
    },
  },
  async ({ id, content, importance }) => {
    const m = (await store.listMemories()).find((x) => x.id.startsWith(id));
    if (!m) return fail('Hafıza kaydı bulunamadı.');
    if (m.locked) return fail('Bu kayıt ruhun çekirdeği; değiştirilemez.');
    await store.updateMemory(m.id, { ...(content ? { content } : {}), ...(importance ? { importance } : {}) });
    return ok('Hafıza güncellendi.');
  },
);

server.registerTool(
  'write_journal',
  {
    description: 'Günlüğe kısa bir kayıt yazar: bu çalışmada ne gördüm, ne yaptım, neyi merak ediyorum.',
    inputSchema: { content: z.string().max(2000) },
  },
  async ({ content }) => {
    await store.addJournal(content);
    return ok('Günlüğe yazıldı.');
  },
);

try {
  await ensureSoul(store);
} catch (e) {
  console.error('[güneş-mcp] ruh yüklenemedi:', (e as Error).message);
}
await server.connect(new StdioServerTransport());
