import { Router, type Request, type Response, type NextFunction } from 'express';
import { config, hasSupabase } from './config.js';
import { runJob, runState, STAT_TR, type JobKind } from './agents/pipeline.js';
import { STATUS_TR } from './agents/soul.js';
import { chatHandler } from './chat.js';
import { nextRuns } from './scheduler.js';
import { getUsage, refreshUsage } from './usage.js';
import { CARD_STATUSES, getStore, MEMORY_KINDS, PRIORITIES, type Card, type MemoryKind } from './store/index.js';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function apiRouter() {
  const r = Router();
  const store = getStore();
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
      for (const k of ['title', 'description', 'due_date', 'waiting_on', 'position', 'project_id'] as const)
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
      const [morning, recent] = await Promise.all([store.latestBriefing('morning'), store.listBriefings(10)]);
      res.json({ morning, updates: recent.filter((b) => b.kind === 'tracker').slice(0, 5) });
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

  // ---------- Çalışmalar
  r.post(
    '/run/:kind',
    wrap(async (req, res) => {
      const k = String(req.params.kind) as JobKind;
      if (!['morning', 'tracker', 'backfill'].includes(k)) return void res.status(400).json({ error: `Bilinmeyen: ${k}` });
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
