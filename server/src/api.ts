import { Router, type Request, type Response, type NextFunction } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, DATA_DIR, hasSupabase } from './config.js';
import { runJob, runState, STAT_TR, type JobKind } from './agents/pipeline.js';
import { STATUS_TR } from './agents/soul.js';
import { chatHandler } from './chat.js';
import { nextRuns } from './scheduler.js';
import { getUsage, refreshUsage } from './usage.js';
import { CARD_STATUSES, getStore, MEMORY_KINDS, PRIORITIES, type Card, type MemoryKind, type PendingAction } from './store/index.js';
import { localDate } from './scheduler.js';
import { getWeather, setLocation } from './weather.js';
import { listUnseen, markPresence, markSeen } from './nudges.js';
import { synthesize, TtsError, ttsEnabled, ttsUsage, TTS_VOICES } from './tts.js';
import { briefingFollowup, closeAppWindow, daySummary, endDay } from './day.js';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function apiRouter() {
  const r = Router();
  const store = getStore();

  /** "Bu olay şu karta mı ait?" sorusunun sonucu. Evet → karta bağla; Hayır → ayrı kart aç. */
  async function resolveLink(a: PendingAction, same: boolean) {
    const ids = (a.payload.event_ids as string[]) ?? [];
    const events = (await store.listEvents({ limit: 5000, sinceDays: 120 })).filter((e) => ids.includes(e.id));
    const card = await store.getCard(a.target_id);
    const sources = events.map((e) => ({
      type: e.source === 'calendar' ? ('calendar' as const) : e.source === 'teams' ? ('teams' as const) : ('outlook' as const),
      external_id: e.external_id,
      link: e.link ?? undefined,
      title: e.subject ?? e.summary.slice(0, 80),
      date: e.occurred_at,
    }));
    if (same && card) {
      await store.updateCard(card.id, { sources: [...card.sources, ...sources] });
      await store.updateEvents(ids, { processed: true, card_id: card.id });
      await store.addActivity({ card_id: card.id, actor: 'user', kind: 'note', message: `Onayladınız: ${a.title}` });
      for (const t of new Set(events.map((e) => e.thread_id).filter(Boolean)))
        await store.upsertThreadLink({ thread_id: t!, source: events[0]?.source ?? 'outlook', page_slug: card.wiki_slug, card_id: card.id, note: 'Kullanıcı onayladı' });
    } else {
      const first = events[0];
      const created = await store.createCard({
        title: String(a.payload.new_card_title ?? first?.subject ?? 'Yeni iş'),
        description: events.map((e) => `${e.summary}${e.excerpt ? `\n> ${e.excerpt}` : ''}`).join('\n\n') || null,
        status: 'inbox',
        requested_by: (a.payload.requested_by as string) ?? first?.from_name ?? null,
        sources,
        people: [...new Set(events.map((e) => e.from_name).filter((n): n is string => Boolean(n)))],
        created_by: 'gunes',
        position: Date.now() / 1e12,
      });
      await store.updateEvents(ids, { processed: true, card_id: created.id });
      await store.addActivity({ card_id: created.id, actor: 'user', kind: 'created', message: `Ayrı iş olduğunu belirttiniz: ${a.title}` });
      await store.createMemory({
        kind: 'lesson',
        content: `"${created.title}" ile "${card?.title ?? 'diğer kart'}" FARKLI işler; benzer görünse de birleştirmemeliyim.`,
        importance: 4,
      });
    }
  }
  const p = (req: Request) => String(req.params.id);

  r.get(
    '/status',
    wrap(async (_req, res) => {
      res.json({
        user: { name: config.userName, title: config.userTitle, role: config.userRole },
        store: store.mode,
        supabase: hasSupabase,
        timezone: config.timezone,
        run: runState,
        schedule: await nextRuns(),
        usage: await getUsage(),
        models: { chat: config.modelChat, think: config.modelThink, scan: config.modelScan },
        usagePauseAt: config.usagePauseAt,
        tts: { provider: ttsEnabled() ? 'azure' : 'browser', voice: config.ttsVoice, voices: TTS_VOICES, usage: ttsEnabled() ? await ttsUsage() : null },
        labels: { status: STATUS_TR, stats: STAT_TR },
      });
    }),
  );

  // ---------- Claude kullanımı
  let refreshing: Promise<unknown> | null = null;
  r.post(
    '/usage/refresh',
    wrap(async (_req, res) => {
      refreshing ??= refreshUsage().finally(() => (refreshing = null));
      await refreshing;
      res.json(await getUsage());
    }),
  );

  // ---------- Bugün: karşılama gündemi
  r.get(
    '/today',
    wrap(async (_req, res) => {
      const today = localDate(new Date().toISOString());
      const [cards, events, suggestions, weather] = await Promise.all([
        store.listCards(),
        store.listEvents({ sinceDays: 3, limit: 1000 }),
        store.listSuggestions('open'),
        getWeather().catch(() => null),
      ]);
      const open = cards.filter((c) => c.status !== 'done');
      const meetings = events
        .filter((e) => e.source === 'calendar' && localDate(e.occurred_at) === today)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        .map((e) => ({ at: e.occurred_at, title: e.subject ?? e.summary.slice(0, 80) }));
      const dueToday = open.filter((c) => c.due_date && c.due_date <= (today ?? ''));
      res.json({
        meetings,
        critical: open.filter((c) => c.priority === 'critical').map((c) => ({ id: c.id, title: c.title, requested_by: c.requested_by })),
        due: dueToday.map((c) => ({ id: c.id, title: c.title, due_date: c.due_date, overdue: c.due_date! < (today ?? '') })),
        awaitingReply: suggestions.filter((s) => s.kind === 'reminder').length,
        waitingOthers: open.filter((c) => c.status === 'waiting').length,
        review: open.filter((c) => c.status === 'review').length,
        weather,
      });
    }),
  );

  // ---------- Doğal ses (Azure Speech)
  r.post('/tts', async (req, res) => {
    try {
      const audio = await synthesize(String(req.body?.text ?? ''), req.body?.voice ? String(req.body.voice) : undefined, Number(req.body?.rate) || 1);
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).send(audio);
    } catch (e) {
      const err = e as TtsError;
      res.status(err.status ?? 500).json({ error: err.message });
    }
  });

  // ---------- Ses tanılama raporu (data/diag-voice.json)
  r.post('/diag/voice', (req, res) => {
    try {
      writeFileSync(join(DATA_DIR, 'diag-voice.json'), JSON.stringify(req.body ?? {}, null, 2));
      console.log('[güneş] ses tanılama raporu yazıldı: data/diag-voice.json');
    } catch {
      /* yoksay */
    }
    res.json({ ok: true });
  });

  // ---------- Gün sonu
  r.get(
    '/day/summary',
    wrap(async (_req, res) => res.json(await daySummary())),
  );
  r.post(
    '/day/end',
    wrap(async (_req, res) => res.json(await endDay())),
  );
  r.post('/app/close', (_req, res) => {
    // Pencere kendini kapatamazsa (Edge --app kısıtı) sunucu Güneş profilli Edge'i kapatır
    setTimeout(() => closeAppWindow(), 400);
    res.json({ ok: true });
  });
  r.post(
    '/briefing/followup',
    wrap(async (req, res) => {
      const unanswered = Array.isArray(req.body?.unanswered) ? req.body.unanswered.map(String).slice(0, 10) : [];
      const s = await briefingFollowup({ unanswered, skipped: Boolean(req.body?.skipped) });
      res.json({ ok: true, id: s.id });
    }),
  );
  r.get(
    '/day/state',
    wrap(async (_req, res) => res.json({ dayEnded: await store.getState('day_ended') })),
  );

  // ---------- Güneş'in seslenmeleri (pop-up)
  r.get(
    '/nudges',
    wrap(async (_req, res) => res.json(await listUnseen(store))),
  );
  r.post(
    '/nudges/:id/seen',
    wrap(async (req, res) => {
      await markSeen(p(req), store);
      res.json({ ok: true });
    }),
  );
  r.post('/presence', (req, res) => {
    markPresence(Boolean(req.body?.visible));
    res.json({ ok: true });
  });

  // ---------- Konum ve hava
  r.get(
    '/weather',
    wrap(async (_req, res) => res.json(await getWeather())),
  );
  r.post(
    '/location',
    wrap(async (req, res) => {
      const lat = Number(req.body?.lat);
      const lon = Number(req.body?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return void res.status(400).json({ error: 'Geçersiz konum.' });
      const place = typeof req.body?.place === 'string' ? req.body.place.slice(0, 80) : undefined;
      await setLocation(lat, lon, place, place ? 'manual' : 'browser');
      res.json(await getWeather(true));
    }),
  );

  // ---------- Wiki
  r.get(
    '/wiki',
    wrap(async (_req, res) => {
      const pages = await store.listWikiPages();
      res.json(pages.map(({ content: _c, ...p }) => p));
    }),
  );
  r.get(
    '/wiki/:slug',
    wrap(async (req, res) => {
      const slug = String(req.params.slug);
      const page = await store.getWikiPage(slug);
      if (!page) return void res.status(404).json({ error: 'Sayfa yok.' });
      const all = await store.listWikiPages();
      const cards = (await store.listCards({ includeDone: true })).filter((c) => c.wiki_slug === slug);
      res.json({
        page,
        backlinks: all.filter((p) => p.links.includes(slug)).map((p) => ({ slug: p.slug, title: p.title, kind: p.kind })),
        cards: cards.map((c) => ({ id: c.id, title: c.title, status: c.status })),
      });
    }),
  );

  // ---------- Pano
  r.get(
    '/board',
    wrap(async (req, res) => {
      const [cards, projects] = await Promise.all([
        store.listCards({ includeDone: req.query.all === '1' }),
        store.listProjects(),
      ]);
      res.json({ cards, projects });
    }),
  );

  r.post(
    '/cards',
    wrap(async (req, res) => {
      const b = req.body ?? {};
      if (!b.title?.trim()) return void res.status(400).json({ error: 'Başlık gerekli.' });
      const project_id = b.project ? (await store.upsertProject(String(b.project))).id : (b.project_id ?? null);
      const card = await store.createCard({
        title: String(b.title).trim(),
        description: b.description ?? null,
        status: CARD_STATUSES.includes(b.status) ? b.status : 'todo',
        priority: PRIORITIES.includes(b.priority) ? b.priority : 'medium',
        project_id,
        due_date: b.due_date || null,
        created_by: 'user',
        position: Date.now() / 1e12,
      });
      await store.addActivity({ card_id: card.id, actor: 'user', kind: 'created', message: 'Kartı siz açtınız.' });
      res.json(card);
    }),
  );

  r.patch(
    '/cards/:id',
    wrap(async (req, res) => {
      const card = await store.getCard(p(req));
      if (!card) return void res.status(404).json({ error: 'Kart yok.' });
      const b = req.body ?? {};
      const patch: Partial<Card> = {};
      for (const k of ['title', 'description', 'due_date', 'waiting_on', 'position', 'project_id', 'requested_by'] as const)
        if (k in b) (patch as Record<string, unknown>)[k] = b[k] === '' ? null : b[k];
      if (b.priority && PRIORITIES.includes(b.priority)) patch.priority = b.priority;
      if (b.project) patch.project_id = (await store.upsertProject(String(b.project))).id;
      if (b.status && CARD_STATUSES.includes(b.status) && b.status !== card.status) {
        patch.status = b.status;
        patch.closed_at = b.status === 'done' ? new Date().toISOString() : null;
        await store.addActivity({
          card_id: card.id,
          actor: 'user',
          kind: 'moved',
          message: `${STATUS_TR[card.status]} → ${STATUS_TR[b.status]}`,
        });
        // Güneş'in "kapatılabilir" önerisini reddetmek bir derstir
        if (card.status === 'review' && b.status !== 'done' && card.created_by === 'gunes') {
          await store.createMemory({
            kind: 'lesson',
            content: `"${card.title}" kartını kapatılabilir sanmıştım (${card.close_reason ?? 'gerekçe yok'}) ama kullanıcı geri aldı; benzer durumlarda daha temkinli olmalıyım.`,
            importance: 3,
          });
        }
      } else if (Object.keys(patch).length && !('position' in b && Object.keys(patch).length === 1)) {
        await store.addActivity({ card_id: card.id, actor: 'user', kind: 'updated', message: 'Kartı düzenlediniz.' });
      }
      res.json(await store.updateCard(card.id, patch));
    }),
  );

  r.delete(
    '/cards/:id',
    wrap(async (req, res) => {
      const card = await store.getCard(p(req));
      if (card && card.created_by === 'gunes' && req.query.feedback === 'noise') {
        await store.createMemory({
          kind: 'lesson',
          content: `Kullanıcı "${card.title}" kartını gereksiz buldu ve sildi. Benzer içerikler (${card.tags.join(', ') || 'aynı tür'}) için kart açmamalıyım.`,
          importance: 4,
        });
      }
      await store.deleteCard(p(req));
      res.json({ ok: true });
    }),
  );

  r.get(
    '/cards/:id/activity',
    wrap(async (req, res) => res.json(await store.listActivity(p(req)))),
  );

  // ---------- Brifing & öneriler
  r.get(
    '/briefing',
    wrap(async (_req, res) => {
      const [morning, weekly, reflection, recent] = await Promise.all([
        store.latestBriefing('morning'),
        store.latestBriefing('weekly'),
        store.latestBriefing('reflection'),
        store.listBriefings(10),
      ]);
      res.json({ morning, weekly, reflection, updates: recent.filter((b) => b.kind === 'tracker').slice(0, 5) });
    }),
  );

  r.get(
    '/suggestions',
    wrap(async (_req, res) => res.json(await store.listSuggestions('open'))),
  );

  r.patch(
    '/suggestions/:id',
    wrap(async (req, res) => {
      const status = req.body?.status;
      if (!['accepted', 'dismissed', 'open'].includes(status)) return void res.status(400).json({ error: 'Geçersiz durum.' });
      await store.updateSuggestion(p(req), { status });
      if (req.body?.lesson) {
        await store.createMemory({ kind: 'lesson', content: String(req.body.lesson), importance: 4 });
      }
      res.json({ ok: true });
    }),
  );

  // ---------- Onay bekleyen eylemler (Güneş önerir, kullanıcı onaylar)
  r.get(
    '/actions',
    wrap(async (_req, res) => res.json(await store.listPendingActions('pending'))),
  );
  r.post(
    '/actions/:id/:decision',
    wrap(async (req, res) => {
      const a = await store.getPendingAction(p(req));
      if (!a || a.status !== 'pending') return void res.status(404).json({ error: 'Bekleyen eylem bulunamadı.' });
      const decision = String(req.params.decision);
      if (a.action === 'confirm_link') {
        if (decision !== 'approve' && decision !== 'reject') return void res.status(400).json({ error: 'Geçersiz karar.' });
        await resolveLink(a, decision === 'approve');
        await store.resolvePendingAction(a.id, decision === 'approve' ? 'approved' : 'rejected');
        return void res.json({ ok: true });
      }
      if (decision === 'approve') {
        try {
          if (a.action === 'delete_card') await store.deleteCard(a.target_id);
          else await store.deleteMemory(a.target_id);
        } catch (e) {
          return void res.status(400).json({ error: (e as Error).message });
        }
        await store.resolvePendingAction(a.id, 'approved');
      } else if (decision === 'reject') {
        await store.resolvePendingAction(a.id, 'rejected');
        await store.createMemory({
          kind: 'lesson',
          content: `"${a.title}" kaydını silmeyi önermiştim (${a.reason}) ama kullanıcı reddetti; bu kayıt kalmalı.`,
          importance: 3,
        });
      } else return void res.status(400).json({ error: 'Geçersiz karar.' });
      res.json({ ok: true });
    }),
  );

  // ---------- Çalışmalar
  r.post(
    '/run/:kind',
    wrap(async (req, res) => {
      const k = String(req.params.kind) as JobKind;
      if (!['morning', 'tracker', 'backfill', 'wiki', 'weekly', 'reflection'].includes(k)) return void res.status(400).json({ error: `Bilinmeyen: ${k}` });
      void runJob(k);
      res.json({ ok: true, queued: k });
    }),
  );
  r.get(
    '/runs',
    wrap(async (_req, res) => res.json(await store.listRuns(30))),
  );

  // ---------- Hafıza
  r.get(
    '/memory',
    wrap(async (_req, res) => {
      const [memories, journal] = await Promise.all([store.listMemories(), store.listJournal(30)]);
      res.json({ memories, journal });
    }),
  );
  r.post(
    '/memory',
    wrap(async (req, res) => {
      const b = req.body ?? {};
      const kind = (MEMORY_KINDS as readonly string[]).includes(b.kind) && b.kind !== 'soul_core' ? (b.kind as MemoryKind) : 'memory';
      if (!b.content?.trim()) return void res.status(400).json({ error: 'İçerik gerekli.' });
      res.json(
        await store.createMemory({
          kind,
          key: b.key || null,
          content: String(b.content).trim(),
          importance: Math.min(5, Math.max(1, Number(b.importance) || 3)),
          source: { note: 'Kullanıcı ekledi' },
        }),
      );
    }),
  );
  r.patch(
    '/memory/:id',
    wrap(async (req, res) => {
      const b = req.body ?? {};
      const patch: Record<string, unknown> = {};
      if (typeof b.content === 'string') patch.content = b.content;
      if (b.importance) patch.importance = Math.min(5, Math.max(1, Number(b.importance)));
      res.json(await store.updateMemory(p(req), patch));
    }),
  );
  r.delete(
    '/memory/:id',
    wrap(async (req, res) => {
      await store.deleteMemory(p(req));
      res.json({ ok: true });
    }),
  );

  // ---------- Sohbet
  r.get(
    '/chat/sessions',
    wrap(async (_req, res) => res.json(await store.listChatSessions())),
  );
  r.get(
    '/chat/sessions/:id/messages',
    wrap(async (req, res) => res.json(await store.listChatMessages(p(req)))),
  );
  r.delete(
    '/chat/sessions/:id',
    wrap(async (req, res) => {
      await store.deleteChatSession(p(req));
      res.json({ ok: true });
    }),
  );
  r.post('/chat', (req, res, next) => chatHandler(req, res).catch(next));

  r.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[güneş] API hatası:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  });
  return r;
}
