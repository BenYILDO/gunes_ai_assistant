import { config } from '../config.js';
import { usageIsHigh } from '../usage.js';
import { getWeather } from '../weather.js';
import { announceNew, unseenIds } from '../nudges.js';
import { runClaude, type RunnerEvent } from '../claude/runner.js';
import { getStore } from '../store/index.js';
import { collectorPrompt, notifierPrompt, plannerPrompt, wikiBuildPrompt } from './prompts.js';
import { buildBoardContext, buildMemoryContext, buildWikiIndex, ensureSoul, formatEvents } from './soul.js';
import { exportWiki } from '../wiki.js';

export type JobKind = 'morning' | 'tracker' | 'backfill' | 'wiki';

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
    ask_link: 'Size soru bırakıyor',
    link_thread: 'Yazışmayı projeye bağlıyor',
    wiki_read: 'Wiki sayfasını okuyor',
    wiki_write: 'Wiki sayfası yazıyor',
    wiki_edit: 'Wiki\'yi düzenliyor',
    nudge_user: 'Size sesleniyor',
  };
  return map[t] ?? t;
};

const onEvent = (e: RunnerEvent) => {
  if (e.type === 'tool') {
    runState.step = toolLabel(e.name);
  } else if (e.type === 'tool_done') {
    log(`→ ${toolLabel(e.name)} (${(e.ms / 1000).toFixed(1)} sn)`);
  }
};

const store = getStore();

async function weatherLine() {
  const w = await getWeather().catch(() => null);
  return w ? `${w.place ?? 'Konumunuz'}: ${w.label}, ${w.temp}°C (en yüksek ${w.todayMax ?? '?'}°, yağış ihtimali %${w.rainChance ?? '?'})` : null;
}

const trDay = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const secs = (t0: number) => `${Math.round((Date.now() - t0) / 1000)} sn`;

async function collect(from: Date, to: Date, includeCalendar: boolean, label = '') {
  const range = `${trDay(from)} → ${trDay(to)}`;
  runState.step = `Toplanıyor${label}: ${range}`;
  log(runState.step);
  const t0 = Date.now();
  const res = await runClaude({
    prompt: collectorPrompt({ from, to, includeCalendar }),
    model: config.modelScan,
    preset: 'collector',
    effort: 'low',
    onEvent,
    timeoutMs: 20 * 60_000,
  });
  log(`Toplayıcı${label} (${range}, ${secs(t0)}): ${res.text.split('\n')[0]?.slice(0, 200)}`);
  if (res.isError) throw new Error(`Toplayıcı hatası: ${res.text.slice(0, 500)}`);
  return res;
}

async function plan(kind: Exclude<JobKind, 'wiki'>) {
  // Büyük birikimlerde planlayıcı birkaç tur çalışır (her turda en fazla 120 olay).
  for (let round = 0; round < 6; round++) {
    const events = await store.listEvents({ unprocessed: true, limit: 120 });
    if (!events.length && (kind !== 'morning' || round > 0)) break;
    runState.step = `Planlanıyor${round ? ` (tur ${round + 1})` : ''}: ${events.length} olay`;
    log(runState.step);
    const lastRound = events.length < 120;
    const t0 = Date.now();
    const res = await runClaude({
      prompt: plannerPrompt({
        kind: kind === 'morning' && !lastRound ? 'backfill' : kind,
        memory: await buildMemoryContext(store),
        board: await buildBoardContext(store),
        wiki: await buildWikiIndex(store),
        events: await formatEvents(store, events),
        weather: kind === 'morning' ? await weatherLine() : null,
        now: new Date(),
      }),
      model: config.modelThink,
      preset: 'planner',
      effort: 'medium',
      onEvent,
      timeoutMs: 20 * 60_000,
    });
    log(`Planlayıcı (${secs(t0)}): ${res.text.split('\n')[0]?.slice(0, 200)}`);
    if (res.isError) throw new Error(`Planlayıcı hatası: ${res.text.slice(0, 500)}`);
    if (lastRound) break;
  }
  // Planlayıcının atladığı olay kaldıysa sonsuza kadar birikmesin
  const left = await store.listEvents({ unprocessed: true, limit: 500 });
  const stale = left.filter((e) => Date.now() - new Date(e.created_at).getTime() > 3 * 864e5);
  if (stale.length) await store.updateEvents(stale.map((e) => e.id), { processed: true });
}

/** Wiki'yi kayıtlı olaylardan kurar (Outlook/Teams'e gitmez). */
async function buildWiki() {
  const events = await store.listEvents({ sinceDays: config.backfillDays + 15, limit: 5000 });
  if (!events.length) {
    log('Kayıtlı olay yok; önce bir tarama gerekli.');
    return;
  }
  // Aynı karta / diziye / projeye ait olaylar yan yana gelsin ki aynı bölümde işlensin
  const key = (e: (typeof events)[number]) => e.card_id ?? e.thread_id ?? e.project_hint?.toLocaleLowerCase('tr') ?? '~';
  events.sort((a, b) => key(a).localeCompare(key(b)) || a.occurred_at.localeCompare(b.occurred_at));
  const size = 90;
  const total = Math.min(10, Math.ceil(events.length / size));
  for (let i = 0; i < total; i++) {
    const chunk = events.slice(i * size, (i + 1) * size);
    runState.step = `Wiki kuruluyor (${i + 1}/${total}): ${chunk.length} kayıt`;
    log(runState.step);
    const t0 = Date.now();
    const res = await runClaude({
      prompt: wikiBuildPrompt({
        board: await buildBoardContext(store),
        wiki: await buildWikiIndex(store),
        events: await formatEvents(store, chunk),
        part: i + 1,
        total,
      }),
      model: config.modelThink,
      preset: 'planner',
      effort: 'medium',
      onEvent,
      timeoutMs: 20 * 60_000,
    });
    log(`Wiki (${i + 1}/${total}, ${secs(t0)}): ${res.text.split('\n')[0]?.slice(0, 200)}`);
    if (res.isError) throw new Error(`Wiki kurulumu hatası: ${res.text.slice(0, 400)}`);
    await exportWiki(store);
  }
  await store.setState('wiki_built', new Date().toISOString());
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
  const nudgesBefore = await unseenIds(store).catch(() => [] as string[]);
  try {
    if (kind === 'wiki') {
      await buildWiki();
    } else if (kind === 'backfill') {
      // 45 günü parçalara böl; Supabase modunda parçalar aynı anda (varsayılan 3) taranır.
      const end = startedAt.getTime();
      const chunks: [Date, Date][] = [];
      for (let f = end - config.backfillDays * 864e5; f < end; f += config.backfillChunkDays * 864e5)
        chunks.push([new Date(f), new Date(Math.min(f + config.backfillChunkDays * 864e5, end))]);
      chunks.reverse(); // önce en yeni haftalar
      const parallel = store.mode === 'supabase' ? Math.max(1, config.backfillParallel) : 1;
      let next = 0;
      let done = 0;
      const errors: string[] = [];
      const worker = async () => {
        while (next < chunks.length) {
          const i = next++;
          try {
            await collect(chunks[i][0], chunks[i][1], false, ` (${i + 1}/${chunks.length})`);
          } catch (e) {
            errors.push((e as Error).message);
          }
          done++;
          runState.step = `Geçmiş taranıyor: ${done}/${chunks.length} parça bitti`;
        }
      };
      await Promise.all(Array.from({ length: Math.min(parallel, chunks.length) }, worker));
      if (errors.length === chunks.length) throw new Error(errors[0]);
      if (errors.length) log(`${errors.length} parça hata verdi, diğerleriyle devam ediliyor.`);
      await store.setState('last_collect', startedAt.toISOString());
      await plan('backfill');
      await store.setState('backfill_done', startedAt.toISOString());
    } else {
      if (kind === 'tracker' && (await usageIsHigh())) {
        log('Claude kullanımı yüksek; takip, sohbete yer kalsın diye ertelendi.');
        await store.finishRun(run.id, { status: 'skipped', stats: { reason: 'usage' } });
        runState.lastResult = { kind, status: 'skipped', at: new Date().toISOString(), message: 'Kullanım yüksek, ertelendi' };
        return;
      }
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
    await exportWiki(store);
    await announceNew(nudgesBefore).catch(() => undefined);
    runState.running = null;
    runState.step = '';
  }
}
