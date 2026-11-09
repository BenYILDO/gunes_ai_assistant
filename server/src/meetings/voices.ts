/**
 * Konuşmacı tanıma mantığı (saf fonksiyonlar, test edilebilir). Ölçümler: scripts/whisper/RAPOR.md
 *  - Embedding: TitaNet small (192 boyut). Aynı toplantıda %94-99, FARKLI toplantıda profilli kişi 40/40 tanındı.
 *  - Eşik 0,40: profilli kişi %100 tanındı, profilsizlerin %95'i reddedildi ("tanınmadı").
 *  - Takvim katılımcılarıyla sınırlama: yalnızca o toplantıdaki kişilerin profilleri karşılaştırılır.
 */
import type { MeetingCue, MeetingSpeaker, VoiceProfile } from '../store/types.js';

/** Türkçe karakterleri sadeleştirir, küçük harfe çevirir ("Yıldıray Sürmen" → "yildiray surmen") */
export function foldName(s: string) {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const tokens = (s: string) => foldName(s).split(' ').filter((t) => t.length > 1);

/** İki ad aynı kişi mi? ("Yildiray SURMEN" = "Yıldıray Sürmen"; tek sözcüklü ad yalnızca o ada eşleşir) */
export function sameName(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hit = short.filter((t) => long.includes(t)).length;
  return hit >= Math.min(2, short.length) && hit === short.length;
}

export function cosine(a: number[], b: number[]) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** Ağırlıklı merkez (birim uzunluğa normalize) */
export function centroid(vs: { v: number[]; w?: number }[]) {
  const dim = vs[0]!.v.length;
  const c = new Array<number>(dim).fill(0);
  for (const { v, w = 1 } of vs) for (let i = 0; i < dim; i++) c[i]! += v[i]! * w;
  return normalize(c);
}

/** Toplantıdaki kişilerin profillerini seçer. Kullanıcının kendisi her zaman aday. Eşleşme yoksa tüm profiller. */
export function candidateProfiles(profiles: VoiceProfile[], attendees: string[], userName: string) {
  const names = [...attendees, userName].filter(Boolean);
  const picked = profiles.filter((p) => names.some((n) => sameName(p.name, n)));
  // Katılımcı listesi bilinmiyorsa ya da hiçbiriyle profil eşleşmiyorsa kısıtlamayız
  return attendees.length && picked.length ? picked : profiles;
}

export interface CueVector {
  /** transkript satırının sırası */
  i: number;
  v: number[];
  /** satır süresi (sn); kısa satırların vektörü gürültülüdür */
  dur?: number;
}
export interface Recognition {
  speaker: string | null;
  score: number | null;
}

/** Her satırı en yakın profile atar; eşik altı = tanınmadı. */
export function recognize(vectors: CueVector[], profiles: VoiceProfile[], threshold: number): Map<number, Recognition> {
  const out = new Map<number, Recognition>();
  for (const { i, v } of vectors) {
    let best: VoiceProfile | null = null;
    let score = -1;
    for (const p of profiles) {
      const s = cosine(v, p.embedding);
      if (s > score) {
        score = s;
        best = p;
      }
    }
    out.set(i, best && score >= threshold ? { speaker: best.name, score } : { speaker: null, score: best ? score : null });
  }
  return out;
}

export interface VoiceCluster {
  id: string;
  members: number[];
  centroid: number[];
}

/**
 * Tanınmayan satırları ses gruplarına ayırır. Gerçek kayıtta (gerçek toplantı, 8 dk) basit açgözlü yöntem 5 konuşmacıyı
 * 35 parçaya böldü; bu yüzden:
 *  1. Yalnızca UZUN satırlar (`minDur`) çekirdek olur (vektörleri güvenilir),
 *  2. çekirdekler ortalama bağlantılı (average-linkage) birleştirilir; ortalama benzerlik `merge` altına inince durur,
 *  3. en az `minAnchors` çekirdeği olmayan gruplar atılır,
 *  4. diğer tüm satırlar (kısalar dahil) en yakın gruba `attach` üstündeyse katılır, değilse gruba girmez ("?").
 * Eğitimsiz gruplama yakın iki sesi (ör. aynı odadaki kişiler) karıştırabilir: gruplar dinlenip adlandırılmalı.
 */
export function clusterUnknown(vectors: CueVector[], opts: { minDur?: number; merge?: number; attach?: number; minAnchors?: number } = {}): VoiceCluster[] {
  const minDur = opts.minDur ?? 2.5;
  const merge = opts.merge ?? 0.5;
  const attach = opts.attach ?? 0.4;
  const minAnchors = opts.minAnchors ?? 2;
  let anchors = vectors.filter((x) => x.dur === undefined || x.dur >= minDur);
  if (anchors.length < 2) anchors = vectors; // hiç uzun satır yoksa hepsi çekirdek
  if (!anchors.length) return [];

  // benzerlik matrisi bir kez hesaplanır; birleşmelerde Lance-Williams (boyut ağırlıklı ortalama) ile güncellenir
  const n = anchors.length;
  const sim = new Float64Array(n * n);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) sim[a * n + b] = sim[b * n + a] = cosine(anchors[a]!.v, anchors[b]!.v);
  const size = new Array<number>(n).fill(1);
  const alive = new Array<boolean>(n).fill(true);
  const members: CueVector[][] = anchors.map((x) => [x]);
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bs = -Infinity;
    for (let a = 0; a < n; a++) {
      if (!alive[a]) continue;
      for (let b = a + 1; b < n; b++) if (alive[b] && sim[a * n + b]! > bs) ((bs = sim[a * n + b]!), (bi = a), (bj = b));
    }
    if (bi < 0 || bs < merge) break;
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === bi || c === bj) continue;
      const v = (size[bi]! * sim[bi * n + c]! + size[bj]! * sim[bj * n + c]!) / (size[bi]! + size[bj]!);
      sim[bi * n + c] = sim[c * n + bi] = v;
    }
    size[bi]! += size[bj]!;
    members[bi]!.push(...members[bj]!);
    alive[bj] = false;
  }
  const groups = members
    .filter((_, k) => alive[k])
    .filter((m) => m.length >= minAnchors)
    .map((m) => ({ c: centroid(m), core: m }))
    .sort((x, y) => y.core.length - x.core.length);

  const assigned: number[][] = groups.map(() => []);
  for (const x of vectors) {
    let best = -1;
    let bs = -1;
    groups.forEach((g, gi) => {
      const s = cosine(x.v, g.c);
      if (s > bs) ((bs = s), (best = gi));
    });
    if (best >= 0 && bs >= attach) assigned[best]!.push(x.i);
  }
  return groups.map((g, k) => ({ id: `ses-${k + 1}`, members: assigned[k]!, centroid: g.c })).filter((c) => c.members.length > 0);
}

/** Satırlardan konuşmacı özeti (süreye göre sıralı); tanınmayan ses grupları unknown olarak döner. */
/** En uzun satırlardan, birbirinden en az 25 sn uzak en çok 4 örnek (aynı yerden değil, çeşitli dinletmek için) */
export function spreadSamples(list: MeetingCue[]) {
  const out: { b: number; e: number }[] = [];
  for (const c of [...list].sort((x, y) => y.e - y.b - (x.e - x.b))) {
    if (out.length >= 4) break;
    if (out.every((o) => Math.abs(o.b - c.b) >= 25)) out.push({ b: c.b, e: c.e });
  }
  return out;
}

export function summarizeSpeakers(cues: MeetingCue[], clusters: VoiceCluster[]): MeetingSpeaker[] {
  const out: MeetingSpeaker[] = [];
  const byName = new Map<string, MeetingCue[]>();
  for (const c of cues) if (c.speaker) byName.set(c.speaker, [...(byName.get(c.speaker) ?? []), c]);
  const mk = (id: string, name: string | null, kind: 'known' | 'unknown', list: MeetingCue[], embedding?: number[]): MeetingSpeaker => ({
    id,
    name,
    kind,
    cues: list.length,
    seconds: Math.round(list.reduce((s, c) => s + (c.e - c.b), 0)),
    samples: spreadSamples(list),
    ...(embedding ? { embedding } : {}),
  });
  for (const [name, list] of byName) out.push(mk(name, name, 'known', list));
  for (const cl of clusters) {
    const list = cues.filter((c) => c.cluster === cl.id);
    if (list.length) out.push(mk(cl.id, null, 'unknown', list, cl.centroid));
  }
  return out.sort((a, b) => b.seconds - a.seconds);
}
