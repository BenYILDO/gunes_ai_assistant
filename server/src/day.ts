/**
 * Gün sonu: özet ve "Bugünlük yeter" kapanışı.
 * Güneş her değişikliği anında Supabase'e yazar; kapanış devam eden işlerin bitmesini bekler,
 * wiki kopyasını yazar, günlüğe gün sonu kaydı düşer ve veritabanı bağlantısını doğrular.
 */
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { runState } from './agents/pipeline.js';
import { localDate } from './scheduler.js';
import { getStore } from './store/index.js';
import { getWeather } from './weather.js';
import { exportWiki } from './wiki.js';

/** Yarından itibaren ilk iş günü (YYYY-MM-DD, yerel) */
function nextWorkday(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    const wd = ((d.getDay() + 6) % 7) + 1; // 1=Pzt
    if (config.schedule.workDays.includes(wd)) return localDate(d.toISOString())!;
  }
  return localDate(new Date(from.getTime() + 864e5).toISOString())!;
}

export async function daySummary() {
  const store = getStore();
  const today = localDate(new Date().toISOString())!;
  const tomorrow = nextWorkday();
  const [cards, events, weather] = await Promise.all([
    store.listCards({ includeDone: true }),
    store.listEvents({ sinceDays: 4, limit: 2000 }),
    getWeather().catch(() => null),
  ]);
  const isToday = (iso: string | null) => Boolean(iso) && localDate(iso) === today;
  const open = cards.filter((c) => c.status !== 'done');
  const pick = (c: (typeof cards)[number]) => ({ id: c.id, title: c.title, requested_by: c.requested_by, due_date: c.due_date, priority: c.priority, status: c.status });
  const prioRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;

  const closed = cards.filter((c) => c.status === 'done' && isToday(c.closed_at)).map(pick);
  const created = cards.filter((c) => isToday(c.created_at)).map(pick);
  const progressed = open.filter((c) => isToday(c.updated_at) && !isToday(c.created_at)).map(pick);
  const carry = open
    .filter((c) => c.status !== 'review')
    .sort((a, b) => prioRank[a.priority] - prioRank[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    .slice(0, 5)
    .map(pick);
  const dueTomorrow = open.filter((c) => c.due_date && c.due_date <= tomorrow && c.due_date > today).map(pick);
  const meetingsTomorrow = events
    .filter((e) => e.source === 'calendar' && localDate(e.occurred_at) === tomorrow)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((e) => ({ at: e.occurred_at, title: e.subject ?? e.summary.slice(0, 80) }));
  const mailsToday = events.filter((e) => isToday(e.occurred_at) && e.source !== 'calendar').length;
  return {
    today,
    tomorrow,
    closed,
    created,
    progressed,
    carry,
    dueTomorrow,
    meetingsTomorrow,
    review: open.filter((c) => c.status === 'review').length,
    mailsToday,
    weather,
  };
}

/** "Bugünlük yeter": devam edenleri bekle, kaydet, doğrula. */
export async function endDay() {
  const store = getStore();
  const steps: { key: string; ok: boolean; note?: string }[] = [];

  // 1) Devam eden çalışma varsa bitmesini bekle (en fazla 90 sn)
  const t0 = Date.now();
  while (runState.running && Date.now() - t0 < 90_000) await new Promise((r) => setTimeout(r, 1000));
  steps.push({ key: 'jobs', ok: !runState.running, note: runState.running ? `${runState.running} sürüyor; arka planda tamamlanacak` : undefined });

  // 2) Wiki'nin Obsidian kopyası
  await exportWiki(store);
  steps.push({ key: 'wiki', ok: true });

  // 3) Gün sonu günlüğü
  const s = await daySummary();
  const journal = [
    `Gün sonu (${s.today}): ${s.closed.length} iş kapandı, ${s.progressed.length} iş ilerledi, ${s.created.length} yeni iş geldi.`,
    s.carry.length ? `Yarına kalanlar: ${s.carry.slice(0, 3).map((c) => c.title).join('; ')}.` : '',
    s.meetingsTomorrow.length ? `Yarın ${s.meetingsTomorrow.length} toplantı var.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  let journalOk = true;
  try {
    await store.addJournal(journal);
  } catch {
    journalOk = false;
  }
  steps.push({ key: 'journal', ok: journalOk });

  // 4) Veritabanı bağlantısını doğrula (yazılanlar gerçekten orada mı?)
  let dbOk = true;
  try {
    await store.setState('day_ended', new Date().toISOString());
    dbOk = (await store.getState('day_ended')) !== null;
  } catch {
    dbOk = false;
  }
  steps.push({ key: 'db', ok: dbOk, note: store.mode === 'supabase' ? 'Supabase' : 'yerel dosya' });

  return { steps, summary: s };
}

/** Güneş'in Edge uygulama penceresini kapatır (sadece Güneş profiliyle açılan pencereler). */
export function closeAppWindow() {
  if (process.platform !== 'win32') return false;
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -match 'Gunes\\\\edge-profile' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  try {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
    return true;
  } catch {
    return false;
  }
}
