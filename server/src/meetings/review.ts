/**
 * Toplantı incelemesi için SAF biçimlendiriciler: Güneş'in sohbet araçları (mcp.ts) toplantıyı bunlarla okur.
 * Araç çıktısı kısa ve düzenlenebilir olmalı: her transkript satırının sırası (indeks) görünür, böylece "12. satırı şöyle düzelt" denebilir.
 */
import type { Meeting, MeetingProposal } from '../store/types.js';

const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clock = (sn: number) => `${String(Math.floor(sn / 60)).padStart(2, '0')}:${String(Math.floor(sn % 60)).padStart(2, '0')}`;
export const idShort = (id: string) => id.slice(0, 8);

export const STATUS_TR: Record<string, string> = {
  recording: 'kayıtta',
  queued: 'sırada',
  processing: 'işleniyor',
  review: 'inceleme bekliyor',
  done: 'tamamlandı',
  error: 'hata',
};

export function formatMeetingList(list: Pick<Meeting, 'id' | 'title' | 'status' | 'started_at' | 'created_at' | 'attendees' | 'speakers' | 'proposals' | 'wiki_slug'>[], limit = 12) {
  if (!list.length) return 'Kayıtlı toplantı yok.';
  return list
    .slice(0, limit)
    .map((m) => {
      const unknown = m.speakers.filter((s) => s.kind === 'unknown').length;
      const pend = (m.proposals ?? []).filter((p) => p.status === 'pending').length;
      return `- [${idShort(m.id)}] ${clip(m.title, 80)} · ${(m.started_at ?? m.created_at).slice(0, 10)} · ${STATUS_TR[m.status] ?? m.status}` + (unknown ? ` · ${unknown} tanınmayan ses` : '') + (pend ? ` · ${pend} bekleyen öneri` : '') + (m.wiki_slug ? ` · wiki: [[${m.wiki_slug}]]` : '');
    })
    .join('\n');
}

const proposalLine = (p: MeetingProposal) => `  [${p.id}] ${p.kind} · ${p.status} · ${clip(p.title, 100)}${p.result ? ` → ${clip(p.result, 80)}` : ''}`;

/** Toplantının genel görünümü: katılımcılar, sesler, özet/kararlar/aksiyonlar, öneriler ve hangi aşamada olduğu */
export function formatMeetingOverview(m: Meeting) {
  const lines: string[] = [];
  lines.push(`TOPLANTI [${idShort(m.id)}] ${clip(m.title, 120)}`);
  lines.push(`Durum: ${STATUS_TR[m.status] ?? m.status} · ${(m.started_at ?? m.created_at).slice(0, 16).replace('T', ' ')}${m.duration_sec ? ` · ${Math.round(m.duration_sec / 60)} dk` : ''} · ${m.transcript.length} satır`);
  lines.push(`Takvim katılımcıları: ${m.attendees.join(', ') || '(yok)'}`);
  const known = m.speakers.filter((s) => s.kind === 'known');
  const unknown = m.speakers.filter((s) => s.kind === 'unknown');
  lines.push(`Tanınan sesler: ${known.map((s) => `${s.name} (${s.cues} satır)`).join(', ') || '(yok)'}`);
  if (unknown.length) lines.push(`TANINMAYAN sesler (adlandırılmalı): ${unknown.map((s) => `${s.id} (${s.cues} satır, ${Math.max(1, Math.round(s.seconds / 60))} dk)`).join(', ')}`);
  if (m.analysis) {
    lines.push('', `ÖZET: ${clip(m.analysis.ozet, 700)}`);
    if (m.analysis.kararlar.length) lines.push(`Kararlar: ${m.analysis.kararlar.map((k) => clip(k, 160)).join(' | ')}`);
    if (m.analysis.aksiyonlar.length) lines.push(`Aksiyonlar: ${m.analysis.aksiyonlar.map((a) => `${a.kim}: ${clip(a.ne, 120)}${a.ne_zaman ? ` (${a.ne_zaman})` : ''}`).join(' | ')}`);
  } else if (m.summary) lines.push('', `ÖZET: ${clip(m.summary, 600)}`);
  const props = m.proposals ?? [];
  if (props.length) lines.push('', `ÖNERİLER (${props.filter((p) => p.status === 'pending').length} bekliyor):`, ...props.map(proposalLine));
  lines.push('', `Wiki: ${m.wiki_slug ? `[[${m.wiki_slug}]]` : 'bağlı değil'}`);
  lines.push(`Sıradaki adım: ${nextStep(m)}`);
  return lines.join('\n');
}

/** İnceleme akışında şu an ne yapılmalı (araç ve arayüz sihirbazıyla aynı sıra) */
export function nextStep(m: Pick<Meeting, 'status' | 'speakers' | 'analysis' | 'proposals' | 'wiki_slug' | 'transcript'>): string {
  if (['recording', 'queued', 'processing'].includes(m.status)) return 'toplantı henüz işleniyor; bitmesini bekle';
  if (m.status === 'error') return 'işleme hatası; kullanıcıya bildir';
  const unknown = m.speakers.filter((s) => s.kind === 'unknown').length;
  if (unknown) return `${unknown} tanınmayan ses var: önce adlandır (meeting_name_speaker; aynı kişi birden çok sesse AYNI adı ver, tek kişide birleşir)`;
  if (!m.analysis) return 'özet ve öneriler üretilmemiş: meeting_analyze';
  const pend = (m.proposals ?? []).filter((p) => p.status === 'pending').length;
  if (pend) return `${pend} öneri bekliyor: kullanıcı onaylarsa meeting_apply_proposal, istemezse meeting_skip_proposal`;
  if (!m.wiki_slug) return "wiki'ye bağlanmamış: kullanıcı isterse meeting_finalize";
  return 'inceleme tamam';
}

/** Transkriptin bir bölümü, her satırın indeksiyle (düzeltme için) */
export function formatTranscript(m: Pick<Meeting, 'transcript'>, from = 0, limit = 60, maxChars = 9000) {
  const total = m.transcript.length;
  const start = Math.max(0, Math.min(total, Math.floor(from)));
  const out: string[] = [];
  let chars = 0;
  let i = start;
  for (; i < Math.min(total, start + Math.min(120, Math.max(1, Math.floor(limit)))); i++) {
    const c = m.transcript[i]!;
    const who = c.speaker ?? (c.cluster ? `Bilinmeyen ${c.cluster.replace('ses-', 'ses ')}` : 'Bilinmeyen');
    const line = `[${i}] ${clock(c.b)} ${who}: ${c.text}${c.raw && c.raw !== c.text ? '  (düzenlenmiş)' : ''}`;
    if (chars + line.length > maxChars) break;
    out.push(line);
    chars += line.length;
  }
  const next = i < total ? ` Devamı için from_index=${i}.` : ' Sonu.';
  return `Satırlar ${start}–${Math.max(start, i - 1)} / ${total}.${next}\n${out.join('\n')}`;
}

