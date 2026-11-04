/**
 * Hata görünürlüğü: her iş türünün SON çalışması hata verdiyse "sorun" sayılır
 * (sonraki başarılı çalışma sorunu kendiliğinden kapatır). Arayüz bunu üstte uyarı olarak gösterir.
 */
import type { AgentRun } from './store/index.js';

export interface RunProblem {
  id: string;
  kind: string;
  error: string;
  hint: string | null;
  at: string;
  retryable: boolean;
}

/** Tek başına yeniden başlatılabilen işler (toplantı işleri belirli bir olay ister). */
export const RETRYABLE = ['morning', 'tracker', 'backfill', 'wiki', 'weekly', 'reflection'];

/** Hata metninden Türkçe, eyleme dönük bir ipucu üretir. */
export function hintFor(error: string): string | null {
  const e = error.toLowerCase();
  if (/enoent|not recognized|bulunamad|spawn/.test(e) && /claude/.test(e)) return "Claude Code kurulu mu? Terminalde 'claude' yazıp giriş yapın (npm run doctor).";
  if (/login|oturum|not logged|authenticat|unauthori|401|credential/.test(e)) return "Claude girişi düşmüş olabilir: terminalde 'claude' çalıştırıp yeniden giriş yapın.";
  if (/rate.?limit|usage limit|limit reached|429|kullanım limiti|overloaded/.test(e)) return 'Claude kullanım limiti dolmuş olabilir; pencere sıfırlanınca tekrar deneyin.';
  if (/timeout|zaman aşımı|timed out/.test(e)) return 'İş zaman aşımına uğradı. Ağ/VPN durumunu kontrol edip tekrar deneyin.';
  if (/microsoft|m365|connector|outlook|teams/.test(e)) return "Microsoft 365 connector'ı bağlı mı? claude.ai → Ayarlar → Connectors (npm run doctor -- --live).";
  if (/supabase|fetch failed|econn|enotfound|self_signed|certificate/.test(e)) return 'Veritabanına/ağa ulaşılamadı. İnternet, VPN ve .env ayarlarını kontrol edin (npm run doctor).';
  if (/kapand|yarıda kal/.test(e)) return 'Güneş çalışırken kapandı. Tekrar deneyebilirsiniz.';
  return null;
}

export function runProblems(runs: AgentRun[], opts: { withinHours?: number; now?: number } = {}): RunProblem[] {
  const now = opts.now ?? Date.now();
  const cutoff = now - (opts.withinHours ?? 36) * 3600_000;
  const latest = new Map<string, AgentRun>();
  for (const r of [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
    if (r.status === 'running') continue; // sürenler değerlendirilmez
    if (!latest.has(r.kind)) latest.set(r.kind, r);
  }
  return [...latest.values()]
    .filter((r) => r.status === 'error' && new Date(r.finished_at ?? r.started_at).getTime() >= cutoff)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      error: r.error ?? 'Bilinmeyen hata',
      hint: hintFor(r.error ?? ''),
      at: r.finished_at ?? r.started_at,
      retryable: RETRYABLE.includes(r.kind),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Ayar tutarlılığı kontrolü (doctor kullanır): bulunan sorunların Türkçe listesi. */
export function configProblems(c: {
  schedule: { morningTime: string; workEnd: string; trackerEveryHours: number; workDays: number[] };
  weeklyDay: number;
  weeklyTime: string;
  usagePauseAt: number;
  usageDeferAt: number;
  port: number;
  backfillDays: number;
}): string[] {
  const out: string[] = [];
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(c.schedule.morningTime)) out.push(`GUNES_MORNING_TIME geçersiz ("${c.schedule.morningTime}"): HH:MM biçiminde olmalı (ör. 08:30)`);
  if (!hhmm.test(c.schedule.workEnd)) out.push(`GUNES_WORK_END geçersiz ("${c.schedule.workEnd}"): HH:MM biçiminde olmalı`);
  if (hhmm.test(c.schedule.morningTime) && hhmm.test(c.schedule.workEnd) && c.schedule.morningTime >= c.schedule.workEnd)
    out.push('Sabah saati mesai bitişinden önce olmalı (GUNES_MORNING_TIME < GUNES_WORK_END)');
  if (!hhmm.test(c.weeklyTime)) out.push(`GUNES_WEEKLY_TIME geçersiz ("${c.weeklyTime}")`);
  if (!(c.schedule.trackerEveryHours > 0)) out.push('GUNES_TRACKER_EVERY_HOURS 0\'dan büyük bir sayı olmalı');
  if (!c.schedule.workDays.length || c.schedule.workDays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
    out.push('GUNES_WORK_DAYS 1-7 arası gün numaralarından oluşmalı (1=Pazartesi)');
  if (!Number.isInteger(c.weeklyDay) || c.weeklyDay < 1 || c.weeklyDay > 7) out.push('GUNES_WEEKLY_DAY 1-7 arası olmalı');
  else if (!c.schedule.workDays.includes(c.weeklyDay)) out.push('Haftalık rapor günü çalışma günlerinde değil; rapor hiç çalışmaz');
  for (const [k, v] of [['GUNES_USAGE_PAUSE_AT', c.usagePauseAt], ['GUNES_USAGE_DEFER_AT', c.usageDeferAt]] as const)
    if (!(v > 0 && v <= 1)) out.push(`${k} 0 ile 1 arasında olmalı (ör. 0.85)`);
  if (c.usageDeferAt > c.usagePauseAt) out.push('GUNES_USAGE_DEFER_AT, GUNES_USAGE_PAUSE_AT değerinden büyük olmamalı');
  if (!Number.isInteger(c.port) || c.port < 1024 || c.port > 65535) out.push('GUNES_PORT 1024-65535 arasında olmalı');
  if (!(c.backfillDays > 0)) out.push('GUNES_BACKFILL_DAYS 0\'dan büyük olmalı');
  return out;
}
