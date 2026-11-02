import type { Today } from './api';
import { fmtTime } from './time';

export interface AgendaItem {
  icon: 'meeting' | 'critical' | 'due' | 'reply' | 'review' | 'weather';
  text: string;
}

const q = (s: string, n = 46) => `«${s.length > n ? `${s.slice(0, n - 1)}…` : s}»`;

/** "Bugün sizi bekleyenler" listesi ve sesli okunacak cümle */
export function buildAgenda(t: Today | null): { items: AgendaItem[]; speech: string } {
  if (!t) return { items: [], speech: '' };
  const items: AgendaItem[] = [];
  const spoken: string[] = [];
  if (t.meetings.length) {
    const first = t.meetings.find((m) => new Date(m.at).getTime() > Date.now() - 30 * 60_000) ?? t.meetings[0];
    items.push({ icon: 'meeting', text: `${t.meetings.length} toplantı · ilki ${fmtTime(first.at)} ${q(first.title)}` });
    spoken.push(`${t.meetings.length} toplantı`);
  }
  if (t.critical.length) {
    items.push({ icon: 'critical', text: `${t.critical.length} kritik iş · ${q(t.critical[0].title)}${t.critical[0].requested_by ? ` (${t.critical[0].requested_by})` : ''}` });
    spoken.push(`${t.critical.length} kritik iş`);
  }
  const overdue = t.due.filter((d) => d.overdue).length;
  if (t.due.length) {
    items.push({ icon: 'due', text: overdue ? `${t.due.length} işin tarihi geldi, ${overdue} tanesi gecikmiş` : `${t.due.length} işin son günü bugün` });
    spoken.push(`son günü gelen ${t.due.length} iş`);
  }
  if (t.awaitingReply) {
    items.push({ icon: 'reply', text: `${t.awaitingReply} mail/mesaj cevabınızı bekliyor` });
    spoken.push(`cevap bekleyen ${t.awaitingReply} mesaj`);
  }
  if (t.review) items.push({ icon: 'review', text: `${t.review} iş kapatmak için onayınızı bekliyor` });
  const w = t.weather;
  if (w) {
    const tip = w.kind === 'rain' || w.kind === 'storm' || (w.rainChance ?? 0) >= 60 ? ' · şemsiyenizi unutmayın' : w.kind === 'snow' ? ' · yollar kaygan olabilir' : '';
    items.push({ icon: 'weather', text: `${w.place ?? 'Dışarıda'}: ${w.label.toLocaleLowerCase('tr')}, ${w.temp}°${w.todayMax !== null ? ` (en yüksek ${w.todayMax}°)` : ''}${tip}` });
  }
  let speech = spoken.length ? `Bugün sizi ${spoken.join(', ').replace(/, ([^,]*)$/, ' ve $1')} bekliyor.` : 'Bugün için acil bir şey görünmüyor.';
  if (w) speech += ` Dışarıda hava ${w.label.toLocaleLowerCase('tr')}, ${w.temp} derece.${tipSpeech(w)}`;
  return { items, speech };
}

function tipSpeech(w: NonNullable<Today['weather']>) {
  if (w.kind === 'rain' || w.kind === 'storm' || (w.rainChance ?? 0) >= 60) return ' Şemsiyenizi unutmayın.';
  if (w.kind === 'snow') return ' Yollar kaygan olabilir, dikkatli olun.';
  return '';
}
