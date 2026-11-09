/**
 * Güneş'in evcil hayvanı (sadakat sistemi): günde bir kez beslenir, art arda besleme günleri "seri" olur; gerçek işlerden puan kazanılır,
 * puanla eşya (mama kabı, ev, minder, yumak, şapka...) ve ikinci tür (tilki) alınır; başarım rozetleri ve seviyeyle profil oluşur.
 * Cezalandırıcı değildir: hayvan ölmez/küsmez, hafta sonları seriyi bozmaz. Durum `state` anahtar-değer deposunda tutulur (şema yok);
 * tüm kurallar saf fonksiyondur ve test edilir. Güneş hiçbir şeyi onaysız satın almaz; puanı yalnızca kullanıcının kendi eylemleri kazandırır.
 */
import { getStore } from './store/index.js';
import { localDate } from './scheduler.js';

// ---------- katalog
export type Species = 'cat' | 'fox';
export interface SpeciesInfo {
  id: Species;
  name: string;
  price: number;
}
export const SPECIES: SpeciesInfo[] = [
  { id: 'cat', name: 'Kedi', price: 0 },
  { id: 'fox', name: 'Tilki', price: 150 },
];

export type ItemId = 'bowl' | 'ball' | 'cushion' | 'house' | 'hat' | 'bow' | 'freeze';
export interface ItemInfo {
  id: ItemId;
  name: string;
  /** place = ekrana yerleştirilir ve sürüklenir; wear = hayvana takılır; use = tüketilir (stok olarak tutulur) */
  kind: 'place' | 'wear' | 'use';
  price: number;
  desc: string;
  emoji: string;
}
export const ITEMS: ItemInfo[] = [
  { id: 'bowl', name: 'Mama kabı', kind: 'place', price: 0, desc: 'Sürükleyip istediğiniz yere koyun; hayvan yemeğe oraya gelir.', emoji: '🥣' },
  { id: 'ball', name: 'Yün yumağı', kind: 'place', price: 20, desc: 'Fırlatın, hayvan peşinden koşup oynasın.', emoji: '🧶' },
  { id: 'cushion', name: 'Minder', kind: 'place', price: 35, desc: 'Hayvan üstüne çıkıp uzanmayı sever.', emoji: '🛋️' },
  { id: 'bow', name: 'Fiyonk', kind: 'wear', price: 30, desc: 'Boynuna takılır.', emoji: '🎀' },
  { id: 'hat', name: 'Parti şapkası', kind: 'wear', price: 45, desc: 'Başına takılır.', emoji: '🎉' },
  { id: 'house', name: 'Ev', kind: 'place', price: 70, desc: 'Uyku vaktinde hayvan evine girip uyur.', emoji: '🏠' },
  { id: 'freeze', name: 'Seri koruyucu', kind: 'use', price: 25, desc: 'Bir iş gününü kaçırırsanız besleme serinizi korur (hafta sonları zaten sayılmaz). En çok 3 adet.', emoji: '🛡️' },
];
/** Aynı anda taşınabilecek en çok seri koruyucu */
export const MAX_FREEZES = 3;
export const itemOf = (id: string) => ITEMS.find((i) => i.id === id);

export interface Placed {
  itemId: ItemId;
  /** merkezin ekran genişliğine oranı (0-1) */
  x: number;
  /** alt kenarın ekran yüksekliğine oranı, alttan (0 = en alt) */
  b: number;
}

export interface PetStats {
  cardsClosed: number;
  proposalsApplied: number;
  meetings: number;
  daysClosed: number;
  visitDays: number;
  pats: number;
  plays: number;
}

export interface PetState {
  /** Evcil hayvan özelliği açık mı? Kapalıyken puan, ödül, mağaza ve sayaçlar çalışmaz (varsayılan: kapalı) */
  enabled: boolean;
  name: string;
  species: Species;
  /** Sahip olunan türler */
  unlocked: Species[];
  adoptedAt: string;
  /** Son beslenen gün (YYYY-MM-DD, yerel) */
  lastFed: string | null;
  streak: number;
  bestStreak: number;
  totalFeeds: number;
  coins: number;
  /** Tüm zamanlarda kazanılan puan (seviye bundan hesaplanır) */
  lifetime: number;
  /** İş eylemlerinden bugün kazanılan puan (günlük üst sınır için) */
  work: { date: string; amount: number };
  /** Seri koruyucu stoku (0-3) */
  freezes: number;
  /** Günlük küçük görevler: bugünün sayaçları ve ödülü alınan görevler */
  daily: { date: string; cards: number; actions: number; claimed: string[] };
  owned: ItemId[];
  placed: Placed[];
  worn: ItemId[];
  stats: PetStats;
  /** Rozet kimliği → kazanıldığı tarih */
  achievements: Record<string, string>;
  lastVisit: string | null;
  /** Art arda uygulamayı açtığınız (hafta içi) gün sayısı */
  visitStreak: number;
  bestVisitStreak: number;
}

export type PetMood = 'happy' | 'content' | 'hungry';

// ---------- başarımlar ve seviyeler
export interface AchievementInfo {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  /** Kazanılınca verilen ödül puanı */
  reward: number;
  check: (s: PetState) => boolean;
}
export const ACHIEVEMENTS: AchievementInfo[] = [
  { id: 'first_feed', name: 'İlk mama', desc: 'Hayvanını ilk kez besle.', emoji: '🥣', reward: 3, check: (s) => s.totalFeeds >= 1 },
  { id: 'streak_3', name: 'Üç gün üst üste', desc: '3 günlük besleme serisi.', emoji: '🔥', reward: 5, check: (s) => s.bestStreak >= 3 },
  { id: 'streak_7', name: 'Haftalık sadakat', desc: '7 günlük besleme serisi.', emoji: '🌟', reward: 15, check: (s) => s.bestStreak >= 7 },
  { id: 'streak_14', name: 'İki hafta', desc: '14 günlük besleme serisi.', emoji: '💫', reward: 30, check: (s) => s.bestStreak >= 14 },
  { id: 'streak_30', name: 'Bir ay', desc: '30 günlük besleme serisi.', emoji: '👑', reward: 80, check: (s) => s.bestStreak >= 30 },
  { id: 'visit_5', name: 'Alışkanlık', desc: '5 gün üst üste Güneş\'i aç.', emoji: '☀️', reward: 8, check: (s) => s.bestVisitStreak >= 5 },
  { id: 'visit_20', name: 'Sadık dost', desc: 'Toplam 20 gün Güneş\'i aç.', emoji: '🤝', reward: 25, check: (s) => s.stats.visitDays >= 20 },
  { id: 'cards_1', name: 'İlk iş', desc: 'Bir kartı kendin kapat.', emoji: '✅', reward: 3, check: (s) => s.stats.cardsClosed >= 1 },
  { id: 'cards_10', name: 'Çalışkan', desc: '10 kart kapat.', emoji: '💪', reward: 10, check: (s) => s.stats.cardsClosed >= 10 },
  { id: 'cards_50', name: 'İş bitirici', desc: '50 kart kapat.', emoji: '🏆', reward: 40, check: (s) => s.stats.cardsClosed >= 50 },
  { id: 'cards_100', name: 'Usta', desc: '100 kart kapat.', emoji: '🎖️', reward: 100, check: (s) => s.stats.cardsClosed >= 100 },
  { id: 'proposals_5', name: 'Güneş\'le iş birliği', desc: 'Güneş\'in 5 önerisini uygula.', emoji: '🧠', reward: 10, check: (s) => s.stats.proposalsApplied >= 5 },
  { id: 'meeting_1', name: 'İlk toplantı', desc: 'Bir toplantıyı Güneş\'le işle.', emoji: '🎧', reward: 5, check: (s) => s.stats.meetings >= 1 },
  { id: 'meeting_10', name: 'Toplantı ustası', desc: '10 toplantı işle.', emoji: '📋', reward: 30, check: (s) => s.stats.meetings >= 10 },
  { id: 'day_5', name: 'Günü kapatan', desc: '5 kez "Bugünlük yeter" de.', emoji: '🌙', reward: 10, check: (s) => s.stats.daysClosed >= 5 },
  { id: 'pats_100', name: 'Sevgi seli', desc: 'Hayvanını 100 kez sev.', emoji: '💛', reward: 10, check: (s) => s.stats.pats >= 100 },
  { id: 'play_20', name: 'Oyun arkadaşı', desc: 'Yumakla 20 kez oyna.', emoji: '🧶', reward: 10, check: (s) => s.stats.plays >= 20 },
  { id: 'collector', name: 'Koleksiyoncu', desc: '5 eşyaya sahip ol.', emoji: '🎁', reward: 15, check: (s) => s.owned.length >= 5 },
  { id: 'fox', name: 'İkinci dost', desc: 'Tilkiyi evine al.', emoji: '🦊', reward: 20, check: (s) => s.unlocked.includes('fox') },
];

export const LEVELS = [
  { at: 0, name: 'Yavru' },
  { at: 20, name: 'Meraklı' },
  { at: 60, name: 'Dost' },
  { at: 130, name: 'Sadık' },
  { at: 240, name: 'Usta' },
  { at: 400, name: 'Bilge' },
  { at: 650, name: 'Efsane' },
];
export function levelOf(lifetime: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (lifetime >= l.at) idx = i;
  });
  const next = LEVELS[idx + 1] ?? null;
  return { level: idx + 1, name: LEVELS[idx]!.name, from: LEVELS[idx]!.at, next: next ? next.at : null };
}

// ---------- günlük küçük görevler (isteğe bağlı; ek puan verir, ceza yoktur)
export interface DailyGoal {
  id: string;
  name: string;
  metric: 'cards' | 'actions';
  need: number;
  reward: number;
}
export const DAILY_GOALS: DailyGoal[] = [
  { id: 'cards3', name: 'Bugün 3 kart kapat', metric: 'cards', need: 3, reward: 5 },
  { id: 'action1', name: "Güneş'le 1 iş yap (öneri uygula ya da toplantı işle)", metric: 'actions', need: 1, reward: 3 },
];

// ---------- puan kuralları
export type EarnKind = 'card_done' | 'proposal' | 'meeting' | 'day_closed' | 'feed' | 'visit';
/** İş eylemlerinden (kart, öneri, toplantı) günde en çok kazanılabilecek puan: puan basmayı sınırlar */
export const WORK_CAP = 40;
const WORK_KINDS: EarnKind[] = ['card_done', 'proposal', 'meeting'];
const BASE: Record<EarnKind, number> = { card_done: 3, proposal: 2, meeting: 4, day_closed: 5, feed: 5, visit: 2 };

const DEFAULT_ITEMS: ItemId[] = ['bowl'];
const emptyStats = (): PetStats => ({ cardsClosed: 0, proposalsApplied: 0, meetings: 0, daysClosed: 0, visitDays: 0, pats: 0, plays: 0 });

export function newPet(now = new Date()): PetState {
  return {
    enabled: false,
    name: 'Tarçın',
    species: 'cat',
    unlocked: ['cat'],
    adoptedAt: now.toISOString(),
    lastFed: null,
    streak: 0,
    bestStreak: 0,
    totalFeeds: 0,
    coins: 0,
    lifetime: 0,
    work: { date: '', amount: 0 },
    freezes: 0,
    daily: { date: '', cards: 0, actions: 0, claimed: [] },
    owned: [...DEFAULT_ITEMS],
    placed: [{ itemId: 'bowl', x: 0.2, b: 0.09 }],
    worn: [],
    stats: emptyStats(),
    achievements: {},
    lastVisit: null,
    visitStreak: 0,
    bestVisitStreak: 0,
  };
}

/** Eski/eksik kayıtları yeni alanlarla tamamlar */
export function normalize(raw: Partial<PetState> | null | undefined, now = new Date()): PetState {
  const d = newPet(now);
  const s = { ...d, ...(raw ?? {}) } as PetState;
  s.stats = { ...emptyStats(), ...(raw?.stats ?? {}) };
  s.work = { ...d.work, ...(raw?.work ?? {}) };
  s.unlocked = Array.isArray(raw?.unlocked) && raw.unlocked.length ? raw.unlocked : ['cat'];
  if (!s.unlocked.includes(s.species)) s.species = 'cat';
  s.enabled = raw?.enabled === true;
  s.daily = { date: '', cards: 0, actions: 0, claimed: [], ...(raw?.daily ?? {}) };
  if (!Array.isArray(s.daily.claimed)) s.daily.claimed = [];
  s.freezes = Math.min(MAX_FREEZES, Math.max(0, Math.floor(Number(raw?.freezes) || 0)));
  s.owned = Array.isArray(raw?.owned) ? raw.owned.filter((id) => itemOf(id)?.kind !== 'use') : [...DEFAULT_ITEMS];
  if (!s.owned.includes('bowl')) s.owned = ['bowl', ...s.owned];
  s.placed = Array.isArray(raw?.placed) ? raw.placed.filter((p) => s.owned.includes(p.itemId) && itemOf(p.itemId)?.kind === 'place') : d.placed;
  if (!s.placed.some((p) => p.itemId === 'bowl')) s.placed = [...s.placed, d.placed[0]!];
  s.worn = Array.isArray(raw?.worn) ? raw.worn.filter((w) => s.owned.includes(w) && itemOf(w)?.kind === 'wear') : [];
  s.achievements = { ...(raw?.achievements ?? {}) };
  return s;
}

const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 864e5);
const isWeekend = (n: number) => {
  const wd = new Date(n * 864e5).getUTCDay();
  return wd === 0 || wd === 6;
};

/** `from` ile `to` arasında (ikisi hariç) hafta içi bir gün atlandı mı? Hafta sonları seriyi bozmaz. */
export function missedWeekdays(from: string, to: string): number {
  let n = 0;
  for (let d = dayNum(from) + 1; d < dayNum(to); d++) if (!isWeekend(d)) n++;
  return n;
}

/** Seri hâlâ sürüyor mu (bugün beslenmemiş olsa bile)? Kaçırılan iş günlerini seri koruyucular karşılar; hafta sonları zaten sayılmaz. */
export function streakAlive(s: PetState, today: string): boolean {
  if (!s.lastFed) return false;
  if (s.lastFed === today) return true;
  const m = missedWeekdays(s.lastFed, today);
  return m === 0 || m <= s.freezes;
}

export function moodOf(s: PetState, today: string): PetMood {
  if (s.lastFed === today) return 'happy';
  return streakAlive(s, today) ? 'content' : 'hungry';
}

export interface PetView extends PetState {
  today: string;
  fedToday: boolean;
  mood: PetMood;
  level: { level: number; name: string; from: number; next: number | null };
  /** Bugün iş eylemlerinden kalan puan hakkı */
  workLeft: number;
  goals: { id: string; name: string; need: number; have: number; reward: number; done: boolean }[];
  catalog: { species: SpeciesInfo[]; items: ItemInfo[]; achievements: { id: string; name: string; desc: string; emoji: string; reward: number }[]; workCap: number };
}

export function view(s: PetState, today: string): PetView {
  return {
    ...s,
    today,
    fedToday: s.lastFed === today,
    mood: moodOf(s, today),
    streak: streakAlive(s, today) ? s.streak : 0,
    level: levelOf(s.lifetime),
    workLeft: s.work.date === today ? Math.max(0, WORK_CAP - s.work.amount) : WORK_CAP,
    goals: DAILY_GOALS.map((g) => ({ id: g.id, name: g.name, need: g.need, reward: g.reward, have: s.daily.date === today ? s.daily[g.metric] : 0, done: s.daily.date === today && s.daily.claimed.includes(g.id) })),
    catalog: { species: SPECIES, items: ITEMS, achievements: ACHIEVEMENTS.map(({ id, name, desc, emoji, reward }) => ({ id, name, desc, emoji, reward })), workCap: WORK_CAP },
  };
}

// ---------- kazanma / başarım
export interface Gain {
  coins: number;
  newAchievements: string[];
}

/** Kazanılabilecek başarımları işler (ödülleri başka başarımları açabilir; kararlı olana dek). */
export function unlockAchievements(s: PetState, today: string): { state: PetState; newly: string[] } {
  let cur = s;
  const newly: string[] = [];
  for (let i = 0; i < 5; i++) {
    const fresh = ACHIEVEMENTS.filter((a) => !cur.achievements[a.id] && a.check(cur));
    if (!fresh.length) break;
    const bonus = fresh.reduce((t, a) => t + a.reward, 0);
    cur = {
      ...cur,
      achievements: { ...cur.achievements, ...Object.fromEntries(fresh.map((a) => [a.id, today])) },
      coins: cur.coins + bonus,
      lifetime: cur.lifetime + bonus,
    };
    newly.push(...fresh.map((a) => a.id));
  }
  return { state: cur, newly };
}

/** Bir eylemden puan kazanır. İş eylemleri günlük üst sınıra (WORK_CAP) tabidir; "meta.high" yüksek öncelikli kart için +2. */
export function earn(s: PetState, kind: EarnKind, today: string, meta: { high?: boolean } = {}): { state: PetState; gained: number; newly: string[] } {
  let stats = { ...s.stats };
  if (kind === 'card_done') stats.cardsClosed++;
  else if (kind === 'proposal') stats.proposalsApplied++;
  else if (kind === 'meeting') stats.meetings++;
  else if (kind === 'day_closed') stats.daysClosed++;
  let amount = BASE[kind] + (kind === 'card_done' && meta.high ? 2 : 0);
  let work = s.work.date === today ? { ...s.work } : { date: today, amount: 0 };
  if (WORK_KINDS.includes(kind)) {
    const left = Math.max(0, WORK_CAP - work.amount);
    amount = Math.min(amount, left);
    work = { date: today, amount: work.amount + amount };
  }
  // günlük görevler: sayaçlar ve (ilk kez) tamamlanan görevin ödülü; iş puanı sınırının dışındadır
  const daily = s.daily.date === today ? { ...s.daily, claimed: [...s.daily.claimed] } : { date: today, cards: 0, actions: 0, claimed: [] as string[] };
  if (kind === 'card_done') daily.cards++;
  else if (kind === 'proposal' || kind === 'meeting') daily.actions++;
  let goalBonus = 0;
  for (const g of DAILY_GOALS) {
    if (!daily.claimed.includes(g.id) && daily[g.metric] >= g.need) {
      daily.claimed.push(g.id);
      goalBonus += g.reward;
    }
  }
  const total = amount + goalBonus;
  const next: PetState = { ...s, stats, work, daily, coins: s.coins + total, lifetime: s.lifetime + total };
  const u = unlockAchievements(next, today);
  return { state: u.state, gained: total + (u.state.coins - next.coins), newly: u.newly };
}

/** Günlük ziyaret: günün ilk açılışında +puan ve ziyaret serisi. */
export function visit(s: PetState, today: string): { state: PetState; gained: number; newly: string[]; first: boolean } {
  if (s.lastVisit === today) return { state: s, gained: 0, newly: [], first: false };
  const alive = s.lastVisit ? missedWeekdays(s.lastVisit, today) === 0 : false;
  const streak = alive ? s.visitStreak + 1 : 1;
  const next: PetState = { ...s, lastVisit: today, visitStreak: streak, bestVisitStreak: Math.max(s.bestVisitStreak, streak), stats: { ...s.stats, visitDays: s.stats.visitDays + 1 } };
  // seri arttıkça küçük bir ek: en çok +3
  const r = earn(next, 'visit', today);
  const bonus = Math.min(3, Math.floor(streak / 3));
  const withBonus = bonus ? { ...r.state, coins: r.state.coins + bonus, lifetime: r.state.lifetime + bonus } : r.state;
  const u = unlockAchievements(withBonus, today);
  return { state: u.state, gained: r.gained + bonus + (u.state.coins - withBonus.coins), newly: [...r.newly, ...u.newly], first: true };
}

/** Bugün besler. Bugün zaten beslendiyse hiçbir şey değişmez. */
export function feed(s: PetState, today: string): { state: PetState; fed: boolean; gained: number; newly: string[] } {
  if (s.lastFed === today) return { state: s, fed: false, gained: 0, newly: [] };
  const alive = streakAlive(s, today);
  const used = alive && s.lastFed ? missedWeekdays(s.lastFed, today) : 0; // kaçırılan iş günü kadar seri koruyucu harcanır
  const streak = alive ? s.streak + 1 : 1;
  const fedState: PetState = { ...s, lastFed: today, streak, freezes: s.freezes - used, bestStreak: Math.max(s.bestStreak, streak), totalFeeds: s.totalFeeds + 1 };
  const r = earn(fedState, 'feed', today);
  return { state: r.state, fed: true, gained: r.gained, newly: r.newly };
}

// ---------- mağaza / yerleştirme / takma / tür
export type ShopResult = { ok: true; state: PetState } | { ok: false; error: string };
const fail = (error: string): ShopResult => ({ ok: false, error });

export function buyItem(s: PetState, id: string, today: string): ShopResult & { newly?: string[] } {
  const it = itemOf(id);
  if (!it) return fail('Böyle bir eşya yok.');
  if (it.kind === 'use') {
    if (s.freezes >= MAX_FREEZES) return fail(`En fazla ${MAX_FREEZES} seri koruyucu taşıyabilirsiniz.`);
    if (s.coins < it.price) return fail(`Yetersiz puan (${it.price} gerekir).`);
    return { ok: true, state: { ...s, coins: s.coins - it.price, freezes: s.freezes + 1 } };
  }
  if (s.owned.includes(it.id)) return fail('Bu eşyaya zaten sahipsiniz.');
  if (s.coins < it.price) return fail(`Yetersiz puan (${it.price} gerekir).`);
  const next: PetState = { ...s, coins: s.coins - it.price, owned: [...s.owned, it.id] };
  const u = unlockAchievements(next, today);
  return { ok: true, state: u.state, newly: u.newly };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Eşyayı ekrana koyar ya da taşır (her eşyadan tek tane). */
export function placeItem(s: PetState, id: string, x: number, b: number): ShopResult {
  const it = itemOf(id);
  if (!it || it.kind !== 'place') return fail('Bu eşya yerleştirilemez.');
  if (!s.owned.includes(it.id)) return fail('Bu eşyaya sahip değilsiniz.');
  const p: Placed = { itemId: it.id, x: clamp01(x), b: clamp01(b) };
  return { ok: true, state: { ...s, placed: [...s.placed.filter((q) => q.itemId !== it.id), p] } };
}

/** Eşyayı ekrandan kaldırır (envanterde kalır). Mama kabı kaldırılamaz: günlük besleme ona bağlıdır. */
export function unplaceItem(s: PetState, id: string): ShopResult {
  if (id === 'bowl') return fail('Mama kabı ekranda kalmalı; sürükleyerek taşıyabilirsiniz.');
  return { ok: true, state: { ...s, placed: s.placed.filter((q) => q.itemId !== id) } };
}

export function equipItem(s: PetState, id: string, on: boolean): ShopResult {
  const it = itemOf(id);
  if (!it || it.kind !== 'wear') return fail('Bu eşya takılamaz.');
  if (!s.owned.includes(it.id)) return fail('Bu eşyaya sahip değilsiniz.');
  const worn = on ? [...new Set([...s.worn, it.id])] : s.worn.filter((w) => w !== it.id);
  return { ok: true, state: { ...s, worn } };
}

/** Türü seçer; sahip olunmayan tür satın alınır (puan yeter ve satın almak istendiyse). */
export function chooseSpecies(s: PetState, sp: string, today: string, buy = false): ShopResult & { newly?: string[] } {
  const info = SPECIES.find((x) => x.id === sp);
  if (!info) return fail('Böyle bir tür yok.');
  if (s.unlocked.includes(info.id)) return { ok: true, state: { ...s, species: info.id } };
  if (!buy) return fail('Bu tür henüz sizin değil.');
  if (s.coins < info.price) return fail(`Yetersiz puan (${info.price} gerekir).`);
  const next: PetState = { ...s, coins: s.coins - info.price, unlocked: [...s.unlocked, info.id], species: info.id };
  const u = unlockAchievements(next, today);
  return { ok: true, state: u.state, newly: u.newly };
}

/** Sevme/oyun sayaçları (başarımlar için) */
export function bump(s: PetState, what: 'pats' | 'plays', n: number, today: string): { state: PetState; newly: string[] } {
  const add = Math.max(0, Math.min(50, Math.floor(n)));
  if (!add) return { state: s, newly: [] };
  const next: PetState = { ...s, stats: { ...s.stats, [what]: s.stats[what] + add } };
  return unlockAchievements(next, today);
}

export const cleanName = (n: unknown) => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, 20) : '');

// ---------- depo
const KEY = 'pet';
async function load(): Promise<PetState> {
  const raw = await getStore().getState(KEY);
  if (raw) {
    try {
      return normalize(JSON.parse(raw) as Partial<PetState>);
    } catch {
      /* bozuk kayıt: yeniden başla */
    }
  }
  return newPet();
}
const save = (s: PetState) => getStore().setState(KEY, JSON.stringify(s));
const todayStr = () => localDate(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);

export async function getPet(): Promise<PetView> {
  return view(await load(), todayStr());
}
/** Özelliği açar/kapatır. Kapalıyken puan, ödül, mağaza ve sayaçlar çalışmaz; veriler silinmez. */
export async function setPetEnabled(on: boolean): Promise<PetView> {
  const s = await load();
  const next = { ...s, enabled: on };
  if (s.enabled !== on) await save(next);
  return view(next, todayStr());
}
export async function feedPet(): Promise<PetView & { fed: boolean; gained: number; newly: string[] }> {
  const today = todayStr();
  const cur = await load();
  if (!cur.enabled) return { ...view(cur, today), fed: false, gained: 0, newly: [] };
  const r = feed(cur, today);
  if (r.fed) await save(r.state);
  return { ...view(r.state, today), fed: r.fed, gained: r.gained, newly: r.newly };
}
export async function renamePet(name: unknown): Promise<PetView> {
  const s = await load();
  const n = cleanName(name);
  if (n) await save({ ...s, name: n });
  return view(n ? { ...s, name: n } : s, todayStr());
}
export async function visitPet(): Promise<PetView & { gained: number; newly: string[] }> {
  const today = todayStr();
  const cur = await load();
  if (!cur.enabled) return { ...view(cur, today), gained: 0, newly: [] };
  const r = visit(cur, today);
  if (r.first) await save(r.state);
  return { ...view(r.state, today), gained: r.gained, newly: r.newly };
}

/** Başka modüllerden (kart kapatma, öneri uygulama...) çağrılır; hata verirse asıl işi bozmaz. Özellik kapalıysa hiçbir şey yapmaz. */
export async function earnPet(kind: EarnKind, meta: { high?: boolean } = {}): Promise<void> {
  try {
    const today = todayStr();
    const cur = await load();
    if (!cur.enabled) return;
    const r = earn(cur, kind, today, meta);
    await save(r.state);
  } catch {
    /* sadakat sistemi asıl işi asla engellemez */
  }
}

type ActionResult = (PetView & { newly?: string[] }) | { error: string };
async function apply(fn: (s: PetState, today: string) => ShopResult & { newly?: string[] }): Promise<ActionResult> {
  const today = todayStr();
  const cur = await load();
  if (!cur.enabled) return { error: 'Evcil hayvan özelliği kapalı (Ayarlar → Evcil hayvan).' };
  const r = fn(cur, today);
  if (!r.ok) return { error: r.error };
  await save(r.state);
  return { ...view(r.state, today), newly: r.newly };
}
export const buyPetItem = (id: string) => apply((s, t) => buyItem(s, id, t));
export const placePetItem = (id: string, x: number, b: number) => apply((s) => placeItem(s, id, x, b));
export const unplacePetItem = (id: string) => apply((s) => unplaceItem(s, id));
export const equipPetItem = (id: string, on: boolean) => apply((s) => equipItem(s, id, on));
export const choosePetSpecies = (sp: string, buy: boolean) => apply((s, t) => chooseSpecies(s, sp, t, buy));
export async function bumpPet(what: 'pats' | 'plays', n: number): Promise<PetView & { newly: string[] }> {
  const today = todayStr();
  const cur = await load();
  if (!cur.enabled) return { ...view(cur, today), newly: [] };
  const r = bump(cur, what, n, today);
  await save(r.state);
  return { ...view(r.state, today), newly: r.newly };
}
