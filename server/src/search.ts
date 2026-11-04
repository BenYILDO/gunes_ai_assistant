/**
 * Birleşik arama: wiki sayfaları + kartlar + olaylar (mail/Teams/takvim) + hafıza.
 * Veritabanından bağımsız (iki depoda da aynı çalışır); Türkçe karakterden bağımsız ("gunes" → "Güneş")
 * ve ek-dostu (sorgu kökü kelime başıyla eşleşir: "toplantı" → "toplantıyı").
 */
import type { Store } from './store/index.js';

export type SearchType = 'wiki' | 'card' | 'event' | 'memory';
export interface SearchDoc {
  type: SearchType;
  id: string;
  title: string;
  /** Başlıktan sonra en çok ağırlık alan kısa alan (özet, kimden vb.) */
  summary?: string;
  body?: string;
  date?: string;
  meta?: Record<string, unknown>;
}
export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  date?: string;
  meta?: Record<string, unknown>;
}

const MAP: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };

/** Küçük harf + Türkçe/aksan karakterlerini sadeleştir (uzunluk korunur: indeksler orijinal metinle uyumlu kalır). */
export function fold(s: string) {
  return s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => MAP[c]).toLowerCase();
}

export function terms(q: string) {
  return [...new Set(fold(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 2))].slice(0, 8);
}

const wordStarts = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${term}`).test(text);

function snippetAround(raw: string, folded: string, ts: string[]) {
  let at = -1;
  for (const t of ts) {
    const i = folded.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return raw.slice(0, 140).replace(/\s+/g, ' ').trim();
  const from = Math.max(0, at - 50);
  const out = raw.slice(from, from + 160).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${out}${from + 160 < raw.length ? '…' : ''}`;
}

const TYPE_BOOST: Record<SearchType, number> = { wiki: 1.15, card: 1.1, memory: 1.0, event: 0.9 };

/** Tüm sorgu terimleri bulunmalı (VE). Başlık > özet > gövde; kelime başı eşleşmesi ekstra puan alır. */
export function rank(docs: SearchDoc[], query: string, limit = 30): SearchHit[] {
  const ts = terms(query);
  if (!ts.length) return [];
  const hits: SearchHit[] = [];
  const now = Date.now();
  for (const d of docs) {
    const title = fold(d.title ?? '');
    const summary = fold(d.summary ?? '');
    const body = fold(d.body ?? '');
    let score = 0;
    let ok = true;
    for (const t of ts) {
      let s = 0;
      if (title.includes(t)) s += wordStarts(title, t) ? 10 : 6;
      if (summary.includes(t)) s += wordStarts(summary, t) ? 5 : 3;
      if (body.includes(t)) s += (wordStarts(body, t) ? 2 : 1) + Math.min(3, body.split(t).length - 2) * 0.3;
      if (!s) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    if (title === fold(query).trim()) score += 8;
    score *= TYPE_BOOST[d.type];
    // Yeni olanlar hafifçe öne (olaylar ve kartlar için ~90 gün yarı ömür)
    if (d.date) {
      const days = Math.max(0, (now - new Date(d.date).getTime()) / 864e5);
      score *= 1 + 0.15 * Math.exp(-days / 90);
    }
    const raw = d.body ?? d.summary ?? '';
    const useBody = body.includes(ts[0]) || !summary;
    hits.push({
      type: d.type,
      id: d.id,
      title: d.title,
      snippet: useBody ? snippetAround(d.body ?? '', body, ts) : snippetAround(d.summary ?? raw, summary, ts),
      score: Math.round(score * 100) / 100,
      date: d.date,
      meta: d.meta,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function collectDocs(store: Store, opts: { types?: SearchType[]; eventDays?: number } = {}): Promise<SearchDoc[]> {
  const want = new Set(opts.types ?? ['wiki', 'card', 'event', 'memory']);
  const [wiki, cards, events, memories, projects] = await Promise.all([
    want.has('wiki') ? store.listWikiPages() : [],
    want.has('card') ? store.listCards({ includeDone: true }) : [],
    want.has('event') ? store.listEvents({ sinceDays: opts.eventDays ?? 120, limit: 5000 }) : [],
    want.has('memory') ? store.listMemories() : [],
    want.has('card') ? store.listProjects() : [],
  ]);
  const pname = new Map(projects.map((p) => [p.id, p.name]));
  const docs: SearchDoc[] = [];
  for (const p of wiki)
    docs.push({ type: 'wiki', id: p.slug, title: p.title, summary: p.summary, body: p.content, date: p.updated_at, meta: { kind: p.kind } });
  for (const c of cards)
    docs.push({
      type: 'card',
      id: c.id,
      title: c.title,
      summary: [c.requested_by, c.project_id ? pname.get(c.project_id) : null, ...c.people, ...c.tags].filter(Boolean).join(' · '),
      body: c.description ?? '',
      date: c.updated_at,
      meta: { status: c.status, priority: c.priority },
    });
  for (const e of events)
    docs.push({
      type: 'event',
      id: e.id,
      title: e.subject ?? e.summary.slice(0, 80),
      summary: [e.from_name, e.project_hint].filter(Boolean).join(' · '),
      body: [e.summary, e.excerpt].filter(Boolean).join('\n'),
      date: e.occurred_at,
      meta: { source: e.source, link: e.link, from: e.from_name },
    });
  for (const m of memories)
    if (m.kind !== 'soul_core')
      docs.push({ type: 'memory', id: m.id, title: m.key ?? m.kind, summary: '', body: `${m.content}${m.original_excerpt ? `\n${m.original_excerpt}` : ''}`, date: m.updated_at, meta: { kind: m.kind } });
  return docs;
}

export async function searchKnowledge(store: Store, query: string, opts: { types?: SearchType[]; limit?: number } = {}) {
  return rank(await collectDocs(store, { types: opts.types }), query, opts.limit ?? 30);
}
