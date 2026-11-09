/**
 * Claude üyeliğinin kullanım durumu (5 saatlik ve haftalık pencere).
 * Kaynak: Claude CLI'ın her çalışmada yayınladığı `rate_limit_event`.
 * Hiçbir anahtar/belirteç okunmaz; sadece Güneş'in kendi çalışmalarının çıktısı dinlenir.
 */
import { config } from './config.js';
import { runClaude, usageBus } from './claude/runner.js';
import { getStore } from './store/index.js';

export interface UsageWindow {
  utilization: number | null;
  resetsAt: string | null;
  status: string;
}
export interface Usage {
  status: string;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  extra: Record<string, UsageWindow>;
  updatedAt: string;
}

const KEY = 'claude_usage';
let current: Usage | null = null;
let loaded = false;

const iso = (s: unknown) => (typeof s === 'number' ? new Date(s * 1000).toISOString() : typeof s === 'string' ? s : null);
const win = (w: any): UsageWindow | null =>
  w ? { utilization: typeof w.utilization === 'number' ? w.utilization : null, resetsAt: iso(w.resetsAt), status: w.status ?? 'allowed' } : null;

function normalize(info: any): Usage {
  const windows: Record<string, any> = { ...(info.unifiedWindows ?? {}) };
  // Eski CLI sürümleri pencereleri ayrı ayrı yollar
  if (info.rateLimitType && !windows[info.rateLimitType])
    windows[info.rateLimitType] = { utilization: info.utilization, resetsAt: info.resetsAt, status: info.status };
  const prev = current;
  const fiveHour = win(windows.five_hour) ?? prev?.fiveHour ?? null;
  const sevenDay = win(windows.seven_day) ?? prev?.sevenDay ?? null;
  const extra: Record<string, UsageWindow> = { ...(prev?.extra ?? {}) };
  for (const [k, v] of Object.entries(windows)) if (k !== 'five_hour' && k !== 'seven_day') extra[k] = win(v)!;
  return { status: info.status ?? 'allowed', fiveHour, sevenDay, extra, updatedAt: new Date().toISOString() };
}

usageBus.on('usage', (info) => {
  current = normalize(info);
  getStore()
    .setState(KEY, JSON.stringify(current))
    .catch(() => undefined);
});

export async function getUsage(): Promise<Usage | null> {
  if (!loaded) {
    loaded = true;
    try {
      const v = await getStore().getState(KEY);
      if (v && !current) current = JSON.parse(v);
    } catch {
      /* yoksay */
    }
  }
  return current;
}

/** Çok küçük bir istekle güncel kullanımı çeker (birkaç token harcar). */
export async function refreshUsage() {
  await runClaude({ prompt: 'Sadece "ok" yaz.', model: config.modelScan, preset: 'none', effort: 'low', timeoutMs: 90_000 });
  return getUsage();
}

async function usageAtLeast(threshold: number) {
  const u = await getUsage();
  return exceeds(u, threshold);
}

/** Saf hesap (test edilebilir): pencere sıfırlanmadıysa ve doluluk eşiği geçtiyse true; limit dolduysa her zaman true. */
export function exceeds(u: Pick<Usage, 'status' | 'fiveHour'> | null, threshold: number, nowMs = Date.now()) {
  const w = u?.fiveHour;
  const resetPassed = w?.resetsAt ? new Date(w.resetsAt).getTime() < nowMs : true;
  if (resetPassed) return false;
  if (u?.status === 'rejected' || w?.status === 'rejected') return true;
  return typeof w?.utilization === 'number' && w.utilization >= threshold;
}

/**
 * İş öncelikleri: kritik işler (sabah, haftalık rapor, toplantı hazırlığı) sadece limit tamamen dolunca ertelenir;
 * takip taraması "usagePauseAt"ta (sohbete yer kalsın); düşük öncelikli işler (geçmiş tarama, wiki kurulumu,
 * toplantı sonrası, iç gözlem) daha erken, "usageDeferAt"ta ertelenir.
 */
export type JobTier = 'critical' | 'normal' | 'low';
export const JOB_TIER: Record<string, JobTier> = {
  morning: 'critical',
  weekly: 'critical',
  prep: 'critical',
  tracker: 'normal',
  followup: 'low',
  reflection: 'low',
  backfill: 'low',
  wiki: 'low',
};

export function thresholdFor(kind: string) {
  const tier = JOB_TIER[kind] ?? 'normal';
  return tier === 'critical' ? 1 : tier === 'normal' ? config.usagePauseAt : Math.min(config.usageDeferAt, config.usagePauseAt);
}

/** Bu iş şu an Claude kullanımı yüzünden ertelenmeli mi? */
export async function shouldDefer(kind: string) {
  return usageAtLeast(thresholdFor(kind));
}
