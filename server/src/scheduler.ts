/**
 * Zamanlayıcı: her dakika kontrol eder. Cron yerine durum kontrolü kullandığı için
 * bilgisayar 08:30'da kapalı/uykudaysa açıldığı ilk dakikada sabah çalışmasını yapar
 * (kaçırılan çalışmanın telafisi).
 */
import { config } from './config.js';
import { runJob, runState } from './agents/pipeline.js';
import { getStore } from './store/index.js';
import { shouldDefer } from './usage.js';
import { CANCELLED } from './focus.js';
import { isoWeek } from './report.js';

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
    // Limit doluysa her dakika "ertelendi" kaydı açmamak için çalıştırmadan bekle
    if (await shouldDefer('morning')) return;
    void runJob('morning');
    return;
  }
  if (await meetingTick(now.time)) return;
  if (await weeklyTick(now)) return;
  if (now.time > config.schedule.workEnd) return;

  const lastCollect = await store.getState('last_collect');
  const hoursSince = lastCollect ? (Date.now() - new Date(lastCollect).getTime()) / 3600_000 : Infinity;
  if (hoursSince >= config.schedule.trackerEveryHours - 0.05 && !(await shouldDefer('tracker'))) void runJob('tracker');
}

/** Toplantı hazırlığı (başlamadan 5–25 dk önce) ve toplantı sonrası (başlangıçtan 75–180 dk sonra) */
async function meetingTick(time: string) {
  if (!config.meetingPrep && !config.meetingFollowup) return false;
  const store = getStore();
  const meetings = (await store.listEvents({ sinceDays: 1, limit: 2000 })).filter(
    (e) => e.source === 'calendar' && !CANCELLED.test(e.subject ?? ''),
  );
  const nowMs = Date.now();
  for (const m of meetings) {
    const mins = (new Date(m.occurred_at).getTime() - nowMs) / 60_000;
    if (config.meetingPrep && time <= config.schedule.workEnd && mins >= 5 && mins <= 25) {
      const key = `prep:${m.external_id}`;
      if (await store.getState(key)) continue;
      if (await shouldDefer('prep')) continue;
      await store.setState(key, new Date().toISOString());
      void runJob('prep', { eventId: m.id });
      return true;
    }
    if (config.meetingFollowup && mins <= -75 && mins >= -180) {
      const key = `followup:${m.external_id}`;
      if (await store.getState(key)) continue;
      if (await shouldDefer('followup')) continue;
      await store.setState(key, new Date().toISOString());
      void runJob('followup', { eventId: m.id });
      return true;
    }
  }
  return false;
}

/** Haftalık rapor, ardından haftalık iç gözlem (kaçırılırsa haftanın sonraki iş gününde) */
async function weeklyTick(now: { time: string; weekday: number }) {
  const due = now.weekday > config.weeklyDay || (now.weekday === config.weeklyDay && now.time >= config.weeklyTime);
  if (!due) return false;
  const store = getStore();
  const week = isoWeek();
  if ((await store.getState('weekly_week')) !== week) {
    if (await shouldDefer('weekly')) return false;
    await store.setState('weekly_week', week);
    void runJob('weekly');
    return true;
  }
  if ((await store.getState('reflection_week')) !== week && !(await shouldDefer('reflection'))) {
    await store.setState('reflection_week', week);
    void runJob('reflection');
    return true;
  }
  return false;
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
  return {
    lastMorning,
    lastCollect,
    backfillDone,
    nextTracker: next,
    schedule: config.schedule,
    weekly: { day: config.weeklyDay, time: config.weeklyTime, lastWeek: await store.getState('weekly_week') },
    enabled: Boolean(timer),
  };
}
