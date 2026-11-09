/**
 * Gelen kutusu mantığı (saf): Güneş'in seslendiği nudge'ların önceliği, sessiz saatler ve "sonra hatırlat".
 * Tarayıcıya bağımlı olan tek şey localStorage; o da try/catch içinde.
 */
export type NudgeKind = 'high' | 'meeting' | 'normal';

const HIGH = /\b(acil|kritik|gecik\w*|risk\w*|son tarih\w*|yanıt\w* bekl\w*|cevap\w* bekl\w*)\b|⚠/i;
const MEETING = /toplantı|arama|hazırlık|özet/i;

/** Başlık/metne göre önem: high = sessiz saatlerde de görünür; meeting = toplantı hazırlığı/özeti; normal = diğerleri */
export function classifyNudge(title: string, message = ''): NudgeKind {
  if (HIGH.test(title) || HIGH.test(message.slice(0, 200))) return 'high';
  if (MEETING.test(title)) return 'meeting';
  return 'normal';
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Sessiz saat aralığında mı? Gece yarısını aşan aralıkları (22:00 → 08:00) destekler. */
export function inQuietHours(now: Date, from: string, to: string): boolean {
  const n = now.getHours() * 60 + now.getMinutes();
  const a = mins(from);
  const b = mins(to);
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

export interface QuietState {
  /** ayarlardaki sessiz saatler şu an geçerli */
  hours: boolean;
  /** şu an bir aramadasınız ve "aramadayken sessiz" açık */
  call: boolean;
}

/** Açılır pencere (ve sesli okuma) şimdi gösterilsin mi? Önemli (high) her zaman; diğerleri sessiz değilse. */
export function shouldPopup(kind: NudgeKind, q: QuietState): boolean {
  if (kind === 'high') return true;
  return !q.hours && !q.call;
}

/** Hazırlık nudge'ı hangi toplantıya ait: başlıkta toplantı adı geçiyorsa */
export function prepFor<T extends { title: string }>(nudges: T[], meetingTitle: string): T | null {
  const key = meetingTitle.toLowerCase().trim();
  if (!key) return null;
  return nudges.find((n) => /hazırl/i.test(n.title) && n.title.toLowerCase().includes(key.slice(0, 30))) ?? null;
}

/** "3 dk sonra", "1 sa 5 dk sonra", "başlıyor" */
export function untilText(targetMs: number, nowMs: number): string {
  const d = Math.round((targetMs - nowMs) / 60_000);
  if (d <= 0) return 'şimdi';
  if (d < 60) return `${d} dk sonra`;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return m ? `${h} sa ${m} dk sonra` : `${h} sa sonra`;
}

// ---------- açılır pencereden gizleme / erteleme (gelen kutusunda kalır)
const KEY = 'gunes.popupHidden';
/** id → ne zamana kadar gizli (ms); Infinity yerine çok büyük sayı saklanır */
export type Hidden = Record<string, number>;
const FOREVER = 8.64e15;

export function loadHidden(): Hidden {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Hidden;
  } catch {
    return {};
  }
}
export function saveHidden(h: Hidden) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* yoksay */
  }
}
/** Süresi dolanları ve artık var olmayan kimlikleri temizler */
export function pruneHidden(h: Hidden, aliveIds: Set<string>, now: number): Hidden {
  const out: Hidden = {};
  for (const [id, until] of Object.entries(h)) if (aliveIds.has(id) && until > now) out[id] = until;
  return out;
}
export const hideUntil = (h: Hidden, id: string, until: number = FOREVER): Hidden => ({ ...h, [id]: until });
export const isHidden = (h: Hidden, id: string, now: number) => (h[id] ?? 0) > now;
