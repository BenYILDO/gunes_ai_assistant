/** Haftalık özet (saf): geçen haftanın (Pazartesi 00:00 → bu Pazartesi 00:00) kapanan kartları, işlenen toplantıları ve kazanılan rozetleri. */
export interface RecapCard {
  closed_at: string | null;
}
export interface RecapMeeting {
  status: string;
  started_at: string | null;
  created_at: string;
  proposals?: { status: string }[];
}
export interface Recap {
  /** Geçen haftanın Pazartesi'si (YYYY-MM-DD, yerel) */
  weekKey: string;
  cardsClosed: number;
  meetings: number;
  proposalsApplied: number;
  achievements: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Bu haftanın Pazartesi'si 00:00 (yerel) */
export function mondayOf(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function lastWeekRange(now: Date): { start: Date; end: Date } {
  const end = mondayOf(now);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

/** Hafta başında (Pazartesi–Çarşamba) gösterilir; sonrasında ilgisiz kalır */
export const isRecapWindow = (now: Date) => [1, 2, 3].includes(now.getDay());

export function weekRecap(now: Date, cards: RecapCard[], meetings: RecapMeeting[], achievements: Record<string, string> = {}): Recap {
  const { start, end } = lastWeekRange(now);
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
  };
  const ms = meetings.filter((m) => (m.status === 'done' || m.status === 'review') && inRange(m.started_at ?? m.created_at));
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  return {
    weekKey: startKey,
    cardsClosed: cards.filter((c) => inRange(c.closed_at)).length,
    meetings: ms.length,
    proposalsApplied: ms.reduce((t, m) => t + (m.proposals ?? []).filter((p) => p.status === 'applied').length, 0),
    achievements: Object.entries(achievements)
      .filter(([, day]) => day >= startKey && day < endKey)
      .map(([id]) => id),
  };
}

export const recapWorthShowing = (r: Recap) => r.cardsClosed + r.meetings + r.proposalsApplied + r.achievements.length > 0;

/** Geçen haftaya göre tek cümlelik, cesaret verici özet */
export function recapLine(r: Recap): string {
  const parts: string[] = [];
  if (r.cardsClosed) parts.push(`${r.cardsClosed} kart kapattın`);
  if (r.meetings) parts.push(`${r.meetings} toplantıyı Güneş'le işledin`);
  if (r.proposalsApplied) parts.push(`${r.proposalsApplied} öneriyi uyguladın`);
  if (r.achievements.length) parts.push(`${r.achievements.length} rozet kazandın`);
  if (!parts.length) return 'Geçen hafta sakin geçmiş.';
  return `Geçen hafta ${parts.join(', ')}.`;
}
