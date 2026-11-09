/**
 * Toplantı geçmişi bağlamı: hazırlık (prep) ve haftalık rapor için, Güneş'in daha önce işlediği toplantıların
 * özet/karar/aksiyonlarını ve henüz uygulanmamış önerilerini kısa bir metne çevirir. Modelsiz, saf fonksiyonlar.
 */
import type { Meeting } from '../store/types.js';
import { foldName } from './voices.js';

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const DAY = 864e5;
const STOP = new Set(['ve', 'ile', 'için', 'icin', 'toplantisi', 'toplanti', 'meeting', 'sync', 'the', 'a', 'of', 'bir']);

export function titleTokens(s: string) {
  return foldName(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

const hasContent = (m: Meeting) => Boolean(m.analysis?.ozet || m.summary);
const when = (m: Meeting) => new Date(m.started_at ?? m.created_at).getTime();

/** Yaklaşan toplantıyla ilgili geçmiş toplantılar: aynı/benzer başlık ve ortak katılımcılar öne çıkar. En çok `max`, son 120 gün. */
export function relatedMeetings(all: Meeting[], subject: string, attendees: string[], now: number, max = 4): Meeting[] {
  const st = new Set(titleTokens(subject));
  const att = attendees.map(foldName).filter(Boolean);
  const scored = all
    .filter((m) => (m.status === 'done' || m.status === 'review') && hasContent(m) && when(m) < now && now - when(m) < 120 * DAY)
    .map((m) => {
      const tt = titleTokens(m.title);
      const shared = tt.filter((t) => st.has(t)).length;
      const same = foldName(m.title) === foldName(subject) ? 5 : 0;
      const people = m.attendees.filter((a) => att.some((x) => x && (foldName(a).includes(x) || x.includes(foldName(a))))).length;
      return { m, score: same + shared * 2 + Math.min(people, 3) };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || when(b.m) - when(a.m));
  return scored.slice(0, max).map((x) => x.m);
}

function meetingBlock(m: Meeting, o: { actions?: boolean } = {}) {
  const d = new Date(when(m)).toISOString().slice(0, 10);
  const a = m.analysis;
  const lines = [`### ${d} · ${clip(m.title, 90)}${m.attendees.length ? ` (${m.attendees.slice(0, 8).join(', ')})` : ''}`];
  lines.push(`Özet: ${clip(a?.ozet ?? m.summary ?? '', 400)}`);
  if (a?.kararlar?.length) lines.push(`Kararlar: ${a.kararlar.slice(0, 6).map((k) => clip(k, 160)).join(' | ')}`);
  if (o.actions !== false && a?.aksiyonlar?.length)
    lines.push(`Aksiyonlar: ${a.aksiyonlar.slice(0, 6).map((x) => `${x.kim}: ${clip(x.ne, 100)}${x.ne_zaman ? ` (${x.ne_zaman})` : ''}`).join(' | ')}`);
  const pend = (m.proposals ?? []).filter((p) => p.status === 'pending');
  if (pend.length) lines.push(`Onay bekleyen Güneş önerileri: ${pend.map((p) => clip(p.title, 90)).join(' | ')}`);
  return lines.join('\n');
}

/** Hazırlık istemine girecek bölüm; ilgili geçmiş toplantı yoksa boş dize. */
export function previousMeetingsContext(all: Meeting[], subject: string, attendees: string[], now: number) {
  const rel = relatedMeetings(all, subject, attendees, now);
  if (!rel.length) return '';
  return `# ÖNCEKİ İLGİLİ TOPLANTILAR (Güneş'in kayıtlarından; en ilgili önce)\n${rel.map((m) => meetingBlock(m)).join('\n\n')}`;
}

/** Haftalık rapora girecek bölüm: `sinceMs`'den bu yana işlenen toplantılar ve kararları. */
export function weekMeetingsContext(all: Meeting[], sinceMs: number) {
  const list = all.filter((m) => (m.status === 'done' || m.status === 'review') && hasContent(m) && when(m) >= sinceMs).sort((a, b) => when(a) - when(b));
  if (!list.length) return '### Toplantı kararları\n- Bu hafta Güneş\'in işlediği toplantı yok';
  return `### Toplantı kararları (${list.length} toplantı)\n${list.map((m) => meetingBlock(m)).join('\n\n')}`;
}
