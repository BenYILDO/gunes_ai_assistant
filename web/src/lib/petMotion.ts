/** Evcil kedinin hareket matematiği (saf): yürüme süresi, zıplama yayı, kartın üstüne konma noktası, hedef kart seçimi. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Viewport {
  w: number;
  h: number;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Yürüme süresi (sn): px / hız, en az 0,4 sn */
export const walkSeconds = (dist: number, speed = 75) => Math.max(0.4, Math.abs(dist) / speed);

/** Yay üzerindeki nokta: p0 → p1, tepe yüksekliği `h` px (yukarı = y azalır). t ∈ [0,1] */
export function arcPoint(p0: { x: number; y: number }, p1: { x: number; y: number }, t: number, h: number) {
  const e = easeInOut(t);
  return { x: lerp(p0.x, p1.x, e), y: lerp(p0.y, p1.y, t) - 4 * h * t * (1 - t) };
}

/** Zıplamanın tepe yüksekliği: mesafeye göre 50–140 px */
export const jumpHeight = (dx: number, dy: number) => Math.min(140, 50 + Math.hypot(dx, dy) * 0.12);

/**
 * Kedinin kutusunun (W×H) sol-üst köşesi, kartın üstünde duracak şekilde: yatay olarak kartın içinde (kenardan taşmaz),
 * dikey olarak ayakları kartın üst kenarına `sink` px gömülü.
 */
export function perchTarget(card: Rect, W: number, H: number, vp: Viewport, sink = 8, along = 0.5) {
  const minX = card.left;
  const maxX = Math.max(minX, card.left + card.width - W);
  const x = Math.min(maxX, Math.max(minX, card.left + (card.width - W) * along));
  const y = card.top - H + sink;
  return { x: Math.min(Math.max(0, x), Math.max(0, vp.w - W)), y: Math.max(0, y) };
}

/** Ekranda görünür ve yeterince büyük mü (üst çubuğun altında, alt kenarın üstünde)? */
export function usableCard(r: Rect, vp: Viewport, topSafe = 130, bottomSafe = 40, minW = 140): boolean {
  return r.width >= minW && r.top >= topSafe && r.top <= vp.h - bottomSafe && r.left >= 0 && r.left + r.width <= vp.w;
}

/** Aday kartlardan birini seç: kediye çok uzak olmayanlar ve mevcut kart hariç, rastgele. */
export function pickCard<T extends { id: string; rect: Rect }>(cands: T[], vp: Viewport, exceptId: string | null, rnd: () => number = Math.random): T | null {
  const ok = cands.filter((c) => c.id !== exceptId && usableCard(c.rect, vp));
  if (!ok.length) return null;
  return ok[Math.floor(rnd() * ok.length)] ?? null;
}

/** Yerdeki rastgele bir yürüme hedefi (x), mevcut konumdan en az `minDist` uzakta */
export function strollTarget(cur: number, min: number, max: number, rnd: () => number = Math.random, minDist = 120) {
  for (let i = 0; i < 8; i++) {
    const x = min + rnd() * Math.max(0, max - min);
    if (Math.abs(x - cur) >= minDist) return x;
  }
  return cur < (min + max) / 2 ? max : min;
}

/** Hedefe giderken bakış yönü: sağa +1, sola -1 */
export const facingOf = (from: number, to: number, prev: 1 | -1 = 1): 1 | -1 => (Math.abs(to - from) < 4 ? prev : to > from ? 1 : -1);

/** Kedinin kutusunun yüzeyin üstündeki yatay konumu: 0 = sol uç, 1 = sağ uç (yüzey kediden dar ise 0.5) */
export function alongOf(rect: Rect, boxLeft: number, W: number): number {
  const span = rect.width - W;
  if (span <= 1) return 0.5;
  return Math.min(1, Math.max(0, (boxLeft - rect.left) / span));
}

/**
 * Bırakılan kedi hangi yüzeye konsun? Kartın içine bırakıldıysa o kart; aksi halde ayakları bir kenarın (panel üst çizgisi vb.) en çok `reach` px
 * yakınındaysa ve yatayda içindeyse en yakın kenar. Yoksa null. `surfaces`: kullanılabilir ve açıkta olanlar.
 */
export function dropTarget<T extends { kind: 'card' | 'edge'; rect: Rect }>(
  surfaces: T[],
  box: { left: number; top: number; W: number; H: number },
  reach = 70,
): T | null {
  const cx = box.left + box.W / 2;
  const mid = box.top + box.H * 0.6;
  const feet = box.top + box.H;
  const card = surfaces.find((s) => s.kind === 'card' && cx >= s.rect.left && cx <= s.rect.left + s.rect.width && mid >= s.rect.top && mid <= s.rect.top + s.rect.height + 20);
  if (card) return card;
  let best: T | null = null;
  let bestD = Infinity;
  for (const s of surfaces) {
    if (s.kind !== 'edge' || cx < s.rect.left || cx > s.rect.left + s.rect.width) continue;
    const d = Math.abs(feet - s.rect.top);
    if (d <= reach && d < bestD) ((best = s), (bestD = d));
  }
  return best;
}

/** Panel çizgisinde gezinirken yön: along/next 0..1 oranlarıdır; yön pikselle (span) ölçülür, yoksa kedi hiç dönmezdi. */
export function patrolFacing(along: number, next: number, span: number, prev: 1 | -1 = 1): 1 | -1 {
  return facingOf(0, (next - along) * Math.max(1, span), prev);
}
