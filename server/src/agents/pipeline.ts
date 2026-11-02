import { config } from '../config.js';
import { runClaude, type RunnerEvent } from '../claude/runner.js';
import { getStore, type EventItem } from '../store/index.js';
import { collectorPrompt, notifierPrompt, plannerPrompt } from './prompts.js';
import { buildBoardContext, buildMemoryContext, ensureSoul } from './soul.js';

export type JobKind = 'morning' | 'tracker' | 'backfill';

/** Arayüzün canlı gösterdiği çalışma durumu. */
export const runState = {
  running: null as JobKind | null,
  step: '',
  startedAt: null as string | null,
  log: [] as { at: string; text: string }[],
  lastResult: null as null | { kind: JobKind; status: string; at: string; message: string },
};

function log(text: string) {
  runState.log.push({ at: new Date().toISOString(), text });
  runState.log = runState.log.slice(-80);
  console.log(`[güneş] ${text}`);
}

const toolLabel = (name: string) => {
  const t = name.split('__').pop() ?? name;
  const map: Record<string, string> = {
    outlook_email_search: 'Outlook\'ta mailleri tarıyor',
    outlook_calendar_search: 'Takvime bakıyor',
    chat_message_search: 'Teams mesajlarını arıyor',
    teams_list_chats: 'Teams sohbetlerini listeliyor',
    teams_list_channel_messages: 'Teams kanalını okuyor',
    get_me: 'Hesabı tanıyor',
    record_events: 'Olayları kaydediyor',
    create_card: 'Kart açıyor',
    update_card: 'Kartı güncelliyor',
    move_card: 'Kartı taşıyor',
    add_suggestion: 'Öneri bırakıyor',
    write_briefing: 'Brifingi yazıyor',
    remember: 'Hafızasına yazıyor',
    write_journal: 'Günlüğünü yazıyor',
    mark_events_processed: 'Olayları işliyor',
  };
  return map[t] ?? t;
};

const onEvent = (e: RunnerEvent) => {
  if (e.type === 'tool') {
    runState.step = toolLabel(e.name);
    log(`→ ${runState.step}`);
  }
};

const store = getStore();

async function collect(from: Date, to: Date, includeCalendar: boolean) {
  runState.step = `Toplanıyor: ${from.toLocaleDateString('tr-TR')} → ${to.toLocaleDateString('tr-TR')}`;
  log(runState.step);
  const res = await runClaude({
    prompt: collectorPrompt({ from, to, includeCalendar }),
    model: config.modelScan,
    preset: 'collector',
    onEvent,
    timeoutMs: 20 * 60_000,
  });
  log(`Toplayıcı: ${res.text.split('\n')[0]?.slice(0, 200)}`);
  if (res.isError) throw new Error(`Toplayıcı hatası: ${res.text.slice(0, 500)}`);
  return res;
}

const fmtEvent = (e: EventItem) =>
  `[${e.id.slice(0, 8)}] ${e.occurred_at.slice(0, 16)} · ${e.source} · ${e.from_name ?? '?'}${e.from_address ? ` <${e.from_address}>` : ''} · ${e.subject ?? ''}\n` +
  `  ${e.summary}` +
  (e.excerpt ? `\n  > ${e.excerpt}` : '') +
  `\n  önem:${e.importance}${e.needs_reply ? ' · CEVAP BEKLİYOR' : ''}${e.waiting_on ? ` · bekleyen:${e.waiting_on}` : ''}${e.due_date ? ` · tarih:${e.due_date}` : ''}${e.project_hint ? ` · proje?:${e.project_hint}` : ''}${e.link ? ` · link:${e.link}` : ''} · ext:${e.external_id}`;

async function plan(kind: JobKind) {
  // Büyük birikimlerde planlayıcı birkaç tur çalışır (her turda en fazla 120 olay).
  for (let round = 0; round < 6; round++) {
    const events = await store.listEvents({ unprocessed: true, limit: 120 });
    if (!events.length && (kind !== 'morning' || round > 0)) break;
    runState.step = `Planlanıyor${round ? ` (tur ${round + 1})` : ''}: ${events.length} olay`;
    log(runState.step);
    const lastRound = events.length < 120;
    const res = await runClaude({
      prompt: plannerPrompt({
        kind: kind === 'morning' && !lastRound ? 'backfill' : kind,
        memory: await buildMemoryContext(store),
        board: await buildBoardContext(store),
        events: events.map(fmtEvent).join('\n'),
        now: new Date(),
      }),
      model: config.modelThink,
      preset: 'planner',
      onEvent,
      timeoutMs: 20 * 60_000,
    });
    log(`Planlayıcı: ${res.text.split('\n')[0]?.slice(0, 200)}`);
    if (res.isError) throw new Error(`Planlayıcı hatası: ${res.text.slice(0, 500)}`);
    if (lastRound) break;
  }
  // Planlayıcının atladığı olay kaldıysa sonsuza kadar birikmesin
  const left = await store.listEvents({ unprocessed: true, limit: 500 });
  const stale = left.filter((e) => Date.now() - new Date(e.created_at).getTime() > 3 * 864e5);
  if (stale.length) await store.updateEvents(stale.map((e) => e.id), { processed: true });
}

async function notifyTeams() {
  if (!config.teamsSelfChatId) return;
  const b = await store.latestBriefing('morning');
  if (!b || Date.now() - new Date(b.created_at).getTime() > 3 * 3600_000) return;
  const suggestions = (await store.listSuggestions('open')).slice(0, 3);
  const text = [
    `☀️ ${b.headline}`,
    ...Object.entries(b.stats)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([k, v]) => `• ${STAT_TR[k] ?? k}: ${v}`),
    ...suggestions.map((s) => `💡 ${s.title}`),
    `Ayrıntılar Güneş panosunda: http://localhost:${config.port}`,
  ].join('\n');
  runState.step = 'Teams\'e özet gönderiyor';
  log(runState.step);
  const res = await runClaude({
    prompt: notifierPrompt(config.teamsSelfChatId, text),
    model: config.modelScan,
    preset: 'notifier',
    onEvent,
    timeoutMs: 3 * 60_000,
  });
  if (res.isError) log(`Teams bildirimi gönderilemedi: ${res.text.slice(0, 200)}`);
}

export const STAT_TR: Record<string, string> = {
  urgent: 'Öncelikli',
  awaiting_my_reply: 'Cevap bekleyen',
  waiting_on_others: 'Beklediğiniz',
  new_cards: 'Yeni kart',
  updated_cards: 'Güncellenen kart',
  meetings_today: 'Toplantı',
};

async function lastCollect(fallbackHours: number) {
  const v = await store.getState('last_collect');
  const d = v ? new Date(v) : new Date(Date.now() - fallbackHours * 3600_000);
  // Güvenlik payı: 15 dk geriden başla (geç teslim edilen mesajlar için)
  return new Date(Math.min(d.getTime() - 15 * 60_000, Date.now() - 60_000));
}

/** Tek seferde tek iş çalışır; yeni istek gelirse sıraya girer. */
let chain: Promise<unknown> = Promise.resolve();
export function runJob(kind: JobKind) {
  const job = chain.then(() => execute(kind));
  chain = job.catch(() => undefined);
  return job;
}

async function execute(kind: JobKind) {
  await ensureSoul(store);
  const run = await store.startRun(kind);
  runState.running = kind;
  runState.startedAt = new Date().toISOString();
  runState.log = [];
  log(`${kind} çalışması başladı`);
  const startedAt = new Date();
  try {
    if (kind === 'backfill') {
      const end = startedAt;
      let from = new Date(end.getTime() - config.backfillDays * 864e5);
      while (from < end) {
        const to = new Date(Math.min(from.getTime() + config.backfillChunkDays * 864e5, end.getTime()));
        await collect(from, to, false);
        from = to;
      }
      await store.setState('last_collect', startedAt.toISOString());
      await plan('backfill');
      await store.setState('backfill_done', startedAt.toISOString());
    } else {
      const from = await lastCollect(kind === 'morning' ? 24 : 3);
      await collect(from, startedAt, kind === 'morning');
      await store.setState('last_collect', startedAt.toISOString());
      const pending = (await store.listEvents({ unprocessed: true, limit: 1000 })).length;
      if (kind === 'tracker' && pending === 0) {
        log('Yeni gelişme yok; planlayıcı çalıştırılmadı.');
        await store.finishRun(run.id, { status: 'skipped', stats: { new_events: 0 } });
        runState.lastResult = { kind, status: 'skipped', at: new Date().toISOString(), message: 'Yeni gelişme yok' };
        return;
      }
      await plan(kind);
      if (kind === 'morning') {
        await store.setState('last_morning', startedAt.toISOString());
        await notifyTeams();
      }
    }

    await store.finishRun(run.id, { status: 'ok', stats: { duration_s: Math.round((Date.now() - startedAt.getTime()) / 1000) } });
    runState.lastResult = { kind, status: 'ok', at: new Date().toISOString(), message: 'Tamamlandı' };
    log(`${kind} çalışması tamamlandı`);
  } catch (err) {
    const message = (err as Error).message;
    log(`HATA: ${message}`);
    await store.finishRun(run.id, { status: 'error', error: message });
    runState.lastResult = { kind, status: 'error', at: new Date().toISOString(), message };
  } finally {
    runState.running = null;
    runState.step = '';
  }
}
