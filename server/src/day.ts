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

/** Önceki iş günü (YYYY-MM-DD, yerel) */
function prevWorkday(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() - 1);
    const wd = ((d.getDay() + 6) % 7) + 1;
    if (config.schedule.workDays.includes(wd)) return localDate(d.toISOString())!;
  }
  return localDate(new Date(from.getTime() - 864e5).toISOString())!;
}

/**
 * Sesli brifing atlandıysa ya da sorular cevapsız kaldıysa: günlük scrum mesajı
 * (dün ne yapıldı, bugün ne var, neyi es geçmemeli) — modelsiz, anında.
 */
export async function briefingFollowup(opts: { unanswered: string[]; skipped: boolean }) {
  const store = getStore();
  const today = localDate(new Date().toISOString())!;
  const yesterday = prevWorkday();
  const [cards, events] = await Promise.all([store.listCards({ includeDone: true }), store.listEvents({ sinceDays: 2, limit: 1000 })]);
  const on = (iso: string | null, d: string) => Boolean(iso) && localDate(iso) === d;
  const open = cards.filter((c) => c.status !== 'done');
  const closedY = cards.filter((c) => c.status === 'done' && on(c.closed_at, yesterday));
  const movedY = open.filter((c) => on(c.updated_at, yesterday) && !on(c.created_at, yesterday)).slice(0, 4);
  const doing = open.filter((c) => c.status === 'doing').slice(0, 4);
  const critical = open.filter((c) => c.priority === 'critical' || (c.due_date && c.due_date <= today)).slice(0, 4);
  const meetings = events
    .filter((e) => e.source === 'calendar' && localDate(e.occurred_at) === today && new Date(e.occurred_at).getTime() > Date.now() - 15 * 60_000)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const t = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });
  const id = (cid: string) => `[${cid.slice(0, 8)}]`;

  const lines: string[] = [];
  lines.push(
    opts.skipped
      ? `${config.userTitle ? `${config.userName} ${config.userTitle}` : config.userName}, brifingi dinlemeden geçtiniz; sorun değil 🙂 Kısa bir günlük scrum bırakıyorum:`
      : 'Brifingde birkaç soruma cevap alamadım; kısa bir günlük scrum bırakıyorum:',
  );
  lines.push('', '**Dün**');
  if (closedY.length) closedY.slice(0, 4).forEach((c) => lines.push(`- ✅ ${c.title}`));
  if (movedY.length) movedY.forEach((c) => lines.push(`- ↗️ ${c.title} — ilerledi`));
  if (!closedY.length && !movedY.length) lines.push('- Panoda kayda değer bir hareket olmadı.');
  lines.push('', '**Bugün**');
  meetings.slice(0, 3).forEach((m) => lines.push(`- 📅 ${t(m.occurred_at)} — ${m.subject ?? m.summary}`));
  doing.forEach((c) => lines.push(`- 🔄 ${c.title} ${id(c.id)} (devam ediyor)`));
  critical.filter((c) => !doing.includes(c)).forEach((c) => lines.push(`- 🔥 ${c.title} ${id(c.id)}${c.requested_by ? ` — ${c.requested_by}` : ''}`));
  if (!meetings.length && !doing.length && !critical.length) lines.push('- Acil bir şey görünmüyor.');
  if (opts.unanswered.length) {
    lines.push('', '**Es geçmeyelim**');
    opts.unanswered.slice(0, 5).forEach((u) => lines.push(`- ${u}`));
  }
  lines.push(
    '',
    meetings.length
      ? `${t(meetings[0].occurred_at)} toplantısına hazır mısınız? İsterseniz önce ${critical[0] ? `"${critical[0].title}" ile` : 'en kritik işle'} başlayalım.`
      : critical[0]
        ? `"${critical[0].title}" ile başlayalım mı?`
        : 'Hangi işle başlamak istersiniz?',
  );
  const { createNudge } = await import('./nudges.js');
  return createNudge(store, 'Günlük scrum', lines.join('\n'));
}
