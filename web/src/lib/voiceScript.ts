/** Sesli brifing senaryosu: verilerden sıcak, doğal cümleler ve soru anları üretir. */
import type { Briefing, Suggestion, Today, Weather } from './api';
import { fmtTime } from './time';

export type SegmentAction =
  | { kind: 'card_doing'; cardId: string; title: string }
  | { kind: 'draft'; prompt: string; title: string }
  | { kind: 'suggestion_ok'; id: string; title: string };

export interface Segment {
  id: string;
  /** Okunacak metin */
  text: string;
  /** Ekranda gösterilecek kısa başlık */
  label: string;
  /** Soru varsa: kullanıcıdan cevap beklenir */
  ask?: { question: string; yes: SegmentAction; yesAck: string; noAck: string };
  detail?: string;
}

const day = () => new Date().getDay();
const hour = () => new Date().getHours();

function warmOpening(name: string) {
  const h = hour();
  if (h >= 12 && h < 17) return `İyi günler ${name}.`;
  if (h >= 17) return `İyi akşamlar ${name}.`;
  const d = day();
  if (d === 1) return `Günaydın ${name}! Yeni haftaya hoş geldiniz, umarım hafta sonu iyi dinlendiniz.`;
  if (d === 5) return `Günaydın ${name}! Cuma geldi, haftayı güzelce kapatalım.`;
  const opts = [`Günaydın ${name}! Umarım güzel bir sabahınız vardır.`, `Günaydın ${name}, hoş geldiniz.`, `Günaydın ${name}! Kahveniz hazırsa başlayalım mı?`];
  return opts[new Date().getDate() % opts.length];
}

function weatherLine(w: Weather) {
  const base = `Dışarıda hava ${w.label.toLocaleLowerCase('tr')}, ${w.temp} derece`;
  if (w.kind === 'rain' || w.kind === 'storm' || w.kind === 'drizzle') return `${base}; şemsiyenizi yanınıza almayı unutmayın.`;
  if ((w.rainChance ?? 0) >= 60) return `${base}, gün içinde yağmur ihtimali yüksek; şemsiye iyi olur.`;
  if (w.kind === 'snow') return `${base}, kar yağıyor; yollarda dikkatli olun.`;
  if (w.temp <= 5) return `${base}; hava soğuk, sıkı giyinin.`;
  if (w.kind === 'clear') return `${base}, güzel bir gün görünüyor.`;
  return `${base}.`;
}

const clean = (s: string) => s.replace(/\[[0-9a-f]{8}\]/g, '').replace(/[*_`#>]/g, '').trim();

export function buildScript(p: {
  name: string;
  today: Today | null;
  briefing: Briefing | null;
  suggestions: Suggestion[];
  weather: Weather | null;
  pendingApprovals: number;
}): Segment[] {
  const segs: Segment[] = [];
  const t = p.today;
  segs.push({
    id: 'hello',
    label: 'Günaydın',
    text: [warmOpening(p.name), p.weather ? weatherLine(p.weather) : ''].filter(Boolean).join(' '),
  });

  if (t) {
    const parts: string[] = [];
    if (t.meetings.length) parts.push(`${t.meetings.length} toplantı`);
    if (t.critical.length) parts.push(`${t.critical.length} kritik iş`);
    const due = t.due.filter((d) => !t.critical.some((c) => c.id === d.id));
    if (due.length) parts.push(`son günü gelen ${due.length} iş`);
    if (t.awaitingReply) parts.push(`cevabınızı bekleyen ${t.awaitingReply} mesaj`);
    segs.push({
      id: 'overview',
      label: 'Günün özeti',
      text: parts.length
        ? `Bugün sizi ${parts.join(', ').replace(/, ([^,]*)$/, ' ve $1')} bekliyor.`
        : 'Bugün için acil bir şey görünmüyor, sakin bir gün olabilir.',
    });

    const upcoming = t.meetings.filter((m) => new Date(m.at).getTime() > Date.now() - 15 * 60_000);
    if (upcoming.length) {
      const [first, ...rest] = upcoming;
      segs.push({
        id: 'meetings',
        label: 'Toplantılar',
        text:
          `İlk toplantınız ${fmtTime(first.at)}'da: ${first.title}.` +
          (rest.length ? ` Ardından ${rest.map((m) => `${fmtTime(m.at)}'da ${m.title}`).join(', ')}.` : ''),
      });
    }

    const focus = [...t.critical.map((c) => ({ ...c, kind: 'critical' as const })), ...due.map((d) => ({ ...d, requested_by: null, kind: 'due' as const }))].slice(0, 3);
    focus.forEach((c, i) => {
      const who = 'requested_by' in c && c.requested_by ? `, ${c.requested_by} bekliyor` : '';
      const lead = c.kind === 'critical' ? (i === 0 ? 'En önemli işiniz' : 'Bir diğer kritik iş') : 'Son günü bugün olan bir iş var';
      segs.push({
        id: `card-${c.id}`,
        label: c.title,
        text: `${lead}: ${c.title}${who}.`,
        ask: {
          question: i === 0 ? 'Bunu ilk iş olarak ele alalım mı?' : 'Bunu da bugünkü listeye alayım mı?',
          yes: { kind: 'card_doing', cardId: c.id, title: c.title },
          yesAck: 'Harika, kartı Devam ediyor sütununa aldım.',
          noAck: 'Peki, panoda bekliyor olacak.',
        },
      });
    });
  }

  p.suggestions
    .filter((s) => s.kind === 'reminder' || s.kind === 'followup')
    .slice(0, 2)
    .forEach((s) => {
      segs.push({
        id: `sug-${s.id}`,
        label: s.title,
        text: clean(s.title) + '.',
        detail: s.body ? clean(s.body) : undefined,
        ask: {
          question: s.kind === 'reminder' ? 'Bir cevap taslağı hazırlayayım mı?' : 'Kısa bir hatırlatma taslağı hazırlayayım mı?',
          yes: { kind: 'draft', title: s.title, prompt: `Şu konu için Outlook'ta kısa ve nazik bir ${s.kind === 'reminder' ? 'cevap' : 'hatırlatma'} taslağı hazırla (göndermeden): ${s.title}${s.body ? ` — ${s.body}` : ''}` },
          yesAck: 'Tamam, taslağı hazırlıyorum; sohbette görebilirsiniz.',
          noAck: 'Anladım, sonra hatırlatırım.',
        },
      });
    });

  if (p.pendingApprovals) segs.push({ id: 'approvals', label: 'Onaylar', text: `Bir de onayınızı bekleyen ${p.pendingApprovals} soru var, brifing ekranında bakabilirsiniz.` });

  const note = p.briefing?.content.match(/##\s*💭[^\n]*\n([\s\S]*?)(\n##|$)/)?.[1];
  if (note && clean(note).length > 10) segs.push({ id: 'note', label: "Güneş'in notu", text: `Son olarak bir notum var: ${clean(note).split('\n')[0]}` });

  segs.push({ id: 'bye', label: 'Kolay gelsin', text: 'Brifing bu kadar. Ben buradayım, bir şey olursa "Güneş" diye seslenmeniz yeterli. Kolay gelsin!' });
  return segs;
}
