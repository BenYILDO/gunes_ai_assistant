/**
 * Odak planı: bugünün (ya da yarının) takvimindeki boş zamanları bulur ve açık kartları öncelik/son tarihe
 * göre bu boşluklara önerir. Tamamen kural tabanlıdır (Claude kullanmaz) ve takvime YAZMAZ — sadece öneridir.
 */
import type { Card, EventItem } from './store/index.js';

/** Türkçe "İptal:" (noktalı İ) dahil — /i bayrağı İ↔i eşlemez, bu yüzden açıkça yazıldı. */
export const CANCELLED = /^([iİ]ptal|cancell?ed)\b/i;
const MIN = 60_000;

export interface Slot {
  start: string;
  end: string;
  minutes: number;
}
export interface FocusItem {
  card_id: string;
  title: string;
  priority: Card['priority'];
  due_date: string | null;
  start: string;
  end: string;
  minutes: number;
  /** Neden bu kart seçildi (Türkçe, kısa) */
  reason: string;
  /** Tahmin edilen sürenin tamamı sığmadıysa true */
  partial: boolean;
}
export interface FocusPlan {
  day: string;
  free_minutes: number;
  slots: Slot[];
  items: FocusItem[];
  /** Sığmayan en önemli işler */
  overflow: { card_id: string; title: string; priority: Card['priority']; due_date: string | null }[];
  meetings: { title: string; start: string; end: string }[];
}

/** Bir zaman diliminin o andaki UTC farkı (ms). */
function tzOffsetMs(ts: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ts / 1000) * 1000;
}

/** "YYYY-MM-DD" + "HH:MM" (verilen saat diliminde) → gerçek an (ms). */
export function zoned(day: string, hhmm: string, tz: string) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz); // yaz/kış saati geçişi için ikinci düzeltme
  return t;
}

export const dayKey = (ms: number, tz: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(new Date(ms));

export interface FreeOpts {
  day: string;
  tz: string;
  workStart: string;
  workEnd: string;
  /** "12:30-13:30" ya da boş */
  lunch?: string;
  /** Bu andan önceki zaman kullanılamaz (bugün için "şimdi") */
  from?: number;
  minSlot?: number;
  buffer?: number;
}

/** Çakışan aralıkları birleştirir. */
function merge(iv: [number, number][]) {
  const s = [...iv].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function freeSlots(busy: { start: number; end: number }[], o: FreeOpts): Slot[] {
  const minSlot = o.minSlot ?? 25;
  const buffer = (o.buffer ?? 5) * MIN;
  const ws = Math.max(zoned(o.day, o.workStart, o.tz), o.from ?? 0);
  const we = zoned(o.day, o.workEnd, o.tz);
  const blocks: [number, number][] = busy.map((b) => [b.start - buffer, b.end + buffer]);
  const m = o.lunch?.match(/^(\d\d:\d\d)-(\d\d:\d\d)$/);
  if (m) blocks.push([zoned(o.day, m[1], o.tz), zoned(o.day, m[2], o.tz)]);
  const out: Slot[] = [];
  let cur = ws;
  for (const [a, b] of merge(blocks)) {
    if (b <= cur) continue;
    if (a > cur) push(cur, Math.min(a, we));
    cur = Math.max(cur, b);
    if (cur >= we) break;
  }
  if (cur < we) push(cur, we);
  return out;

  function push(a: number, b: number) {
    if (b - a >= minSlot * MIN) out.push({ start: new Date(a).toISOString(), end: new Date(b).toISOString(), minutes: Math.floor((b - a) / MIN) });
  }
}

const PRIO: Record<Card['priority'], number> = { critical: 100, high: 60, medium: 30, low: 10 };
const EST: Record<Card['priority'], number> = { critical: 60, high: 45, medium: 30, low: 25 };

export function scoreCard(c: Card, day: string) {
  let s = PRIO[c.priority];
  const reasons: string[] = [];
  if (c.priority === 'critical') reasons.push('kritik');
  else if (c.priority === 'high') reasons.push('yüksek öncelik');
  if (c.due_date) {
    const days = Math.round((Date.parse(c.due_date) - Date.parse(day)) / 864e5);
    if (days < 0) (s += 110, reasons.unshift(`${-days} gün gecikmiş`));
    else if (days === 0) (s += 90, reasons.unshift('son tarih bugün'));
    else if (days === 1) (s += 55, reasons.unshift('son tarih yarın'));
    else if (days <= 3) (s += 25, reasons.unshift(`son tarih ${days} gün sonra`));
  }
  if (c.status === 'doing') (s += 20, reasons.push('zaten devam ediyor'));
  return { score: s, reason: reasons.join(', ') || 'sıradaki iş' };
}

export function estimateMinutes(c: Card) {
  return c.status === 'doing' ? Math.max(45, EST[c.priority]) : EST[c.priority];
}

/** Kartları boşluklara yerleştirir: en önemli iş en erken boşluğa. */
export function planFocus(cards: Card[], slots: Slot[], day: string): Pick<FocusPlan, 'items' | 'overflow'> {
  const candidates = cards
    .filter((c) => ['inbox', 'todo', 'doing'].includes(c.status))
    .map((c) => ({ c, ...scoreCard(c, day) }))
    .sort((a, b) => b.score - a.score || (a.c.due_date ?? '9').localeCompare(b.c.due_date ?? '9'));

  const free = slots.map((s) => ({ at: Date.parse(s.start), end: Date.parse(s.end) }));
  const items: FocusItem[] = [];
  const overflow: FocusPlan['overflow'] = [];
  for (const { c, reason } of candidates) {
    const want = estimateMinutes(c);
    // Önce tamamı sığan en erken boşluk; yoksa en az 25 dk'lık en erken boşluk (kısmi)
    let slot = free.find((f) => (f.end - f.at) / MIN >= want) ?? free.find((f) => (f.end - f.at) / MIN >= 25);
    if (!slot) {
      if (overflow.length < 5 && (c.priority === 'critical' || c.priority === 'high' || c.due_date)) overflow.push({ card_id: c.id, title: c.title, priority: c.priority, due_date: c.due_date });
      continue;
    }
    const minutes = Math.min(want, Math.floor((slot.end - slot.at) / MIN));
    items.push({
      card_id: c.id, title: c.title, priority: c.priority, due_date: c.due_date,
      start: new Date(slot.at).toISOString(), end: new Date(slot.at + minutes * MIN).toISOString(),
      minutes, reason, partial: minutes < want,
    });
    slot.at += minutes * MIN;
    if (items.length >= 8) break;
  }
  items.sort((a, b) => a.start.localeCompare(b.start));
  return { items, overflow };
}

export function buildFocusPlan(opts: {
  cards: Card[];
  events: EventItem[];
  day: string;
  tz: string;
  workStart: string;
  workEnd: string;
  lunch?: string;
  now?: number;
}): FocusPlan {
  const now = opts.now ?? Date.now();
  const meetings = opts.events
    .filter((e) => e.source === 'calendar' && !CANCELLED.test(e.subject ?? '') && dayKey(Date.parse(e.occurred_at), opts.tz) === opts.day)
    .map((e) => {
      const start = Date.parse(e.occurred_at);
      const end = e.ends_at ? Date.parse(e.ends_at) : start + 60 * MIN;
      return { title: e.subject ?? e.summary.slice(0, 80), start, end: end > start ? end : start + 60 * MIN };
    })
    // Tüm gün süren başlıklar (ör. "Ofis dışı") günü bloke etmesin
    .filter((m) => m.end - m.start < 20 * 60 * MIN)
    .sort((a, b) => a.start - b.start);
  const slots = freeSlots(meetings, {
    day: opts.day, tz: opts.tz, workStart: opts.workStart, workEnd: opts.workEnd, lunch: opts.lunch,
    from: dayKey(now, opts.tz) === opts.day ? now : undefined,
  });
  return {
    day: opts.day,
    free_minutes: slots.reduce((n, s) => n + s.minutes, 0),
    slots,
    ...planFocus(opts.cards, slots, opts.day),
    meetings: meetings.map((m) => ({ title: m.title, start: new Date(m.start).toISOString(), end: new Date(m.end).toISOString() })),
  };
}
