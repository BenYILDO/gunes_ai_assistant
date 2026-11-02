export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** Gerçek gün doğumu/batımı biliniyorsa ona göre, yoksa saate göre evre. */
export function phaseOf(d = new Date(), sun?: { sunrise: string | null; sunset: string | null }): Phase {
  if (sun?.sunrise && sun?.sunset) {
    const t = d.getTime();
    const rise = new Date(sun.sunrise).getTime();
    const set = new Date(sun.sunset).getTime();
    const H = 3600_000;
    if (t >= rise - H && t < rise + 2.5 * H) return 'dawn';
    if (t >= rise + 2.5 * H && t < set - 1.5 * H) return 'day';
    if (t >= set - 1.5 * H && t < set + H) return 'dusk';
    return 'night';
  }
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10.5) return 'dawn';
  if (h >= 10.5 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 20.5) return 'dusk';
  return 'night';
}

export function greetingOf(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 17) return 'İyi günler';
  if (h >= 17 && h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

/** Güne ve saate göre karşılamanın altındaki küçük cümle. */
export function moodLine(d = new Date()) {
  const day = d.getDay();
  const h = d.getHours();
  if (h >= 22 || h < 5) return 'Geç saatte çalışıyorsunuz. Kısa tutalım, sonra dinlenin.';
  if (day === 1 && h < 12) return 'Yeni haftaya hoş geldiniz. Haftanın haritasını çıkardım.';
  if (day === 5 && h >= 14) return 'Haftayı kapatıyoruz. Açıkta kalan işlere birlikte bakalım.';
  if (day === 5) return 'Cuma geldi. Haftayı temiz kapatmak için önceliklerimiz hazır.';
  if (day === 0 || day === 6) return 'Hafta sonu. Sadece gerçekten önemli olanları gösteriyorum.';
  if (h < 12) return 'Gelişmeleri taradım, önceliklerinizi sıraladım.';
  if (h < 17) return 'Günün ortasındayız. Neler değişti, birlikte bakalım.';
  return 'Günü toparlayalım. Yarına kalanları işaretledim.';
}

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—';

export function relTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const fut = diff < 0;
  const s = Math.abs(diff);
  const v =
    s < 60 ? 'az' : s < 3600 ? `${Math.round(s / 60)} dk` : s < 86400 ? `${Math.round(s / 3600)} sa` : `${Math.round(s / 86400)} gün`;
  if (v === 'az') return fut ? 'birazdan' : 'az önce';
  return fut ? `${v} sonra` : `${v} önce`;
}

/** Son tarih durumu: gecikmiş / bugün / yakında / normal */
export function dueState(date: string | null): 'overdue' | 'today' | 'soon' | 'later' | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  const days = (d.getTime() - Date.now()) / 864e5;
  if (days < 0) return 'overdue';
  if (days < 1) return 'today';
  if (days < 3) return 'soon';
  return 'later';
}
