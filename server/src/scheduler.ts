/**
 * Zamanlayıcı: her dakika kontrol eder. Cron yerine durum kontrolü kullandığı için
 * bilgisayar 08:30'da kapalı/uykudaysa açıldığı ilk dakikada sabah çalışmasını yapar
 * (kaçırılan çalışmanın telafisi).
 */
import { config } from './config.js';
import { runJob, runState } from './agents/pipeline.js';
import { getStore } from './store/index.js';

function localParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, weekday: wd };
}

export const localDate = (iso: string | null) => (iso ? localParts(new Date(iso)).date : null);

let timer: NodeJS.Timeout | null = null;

export async function tick() {
  if (runState.running) return;
  const store = getStore();
  const now = localParts();
  if (!config.schedule.workDays.includes(now.weekday)) return;
  if (now.time < config.schedule.morningTime) return;

  const lastMorning = await store.getState('last_morning');
  if (localDate(lastMorning) !== now.date) {
    void runJob('morning');
    return;
  }
  if (now.time > config.schedule.workEnd) return;

  const lastCollect = await store.getState('last_collect');
  const hoursSince = lastCollect ? (Date.now() - new Date(lastCollect).getTime()) / 3600_000 : Infinity;
  if (hoursSince >= config.schedule.trackerEveryHours - 0.05) void runJob('tracker');
}

export function startScheduler() {
  if (!config.schedule.enabled) {
    console.log('[güneş] Zamanlayıcı kapalı (GUNES_SCHEDULER=off).');
    return;
  }
  // Açılışta biraz bekle (ağ/Claude girişi hazır olsun), sonra her dakika kontrol et.
  setTimeout(() => void tick().catch((e) => console.error('[güneş] zamanlayıcı:', e)), 45_000);
  timer = setInterval(() => void tick().catch((e) => console.error('[güneş] zamanlayıcı:', e)), 60_000);
}

export async function nextRuns() {
  const store = getStore();
  const [lastMorning, lastCollect, backfillDone] = await Promise.all([
    store.getState('last_morning'),
    store.getState('last_collect'),
    store.getState('backfill_done'),
  ]);
  const next = lastCollect
    ? new Date(new Date(lastCollect).getTime() + config.schedule.trackerEveryHours * 3600_000).toISOString()
    : null;
  return { lastMorning, lastCollect, backfillDone, nextTracker: next, schedule: config.schedule, enabled: Boolean(timer) };
}
