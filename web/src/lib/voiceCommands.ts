/** Sesli komut ayrıştırma (yerelde, model gerektirmez). */
export type Intent =
  | 'yes'
  | 'no'
  | 'skip'
  | 'stop'
  | 'resume'
  | 'repeat'
  | 'detail'
  | 'to_app'
  | 'open_board'
  | 'open_briefing'
  | 'open_wiki'
  | 'end_day'
  | 'scan'
  | 'briefing'
  | null;

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[.,!?;:"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const has = (t: string, words: string[]) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(t));

export function parseIntent(raw: string): Intent {
  const t = norm(raw);
  if (!t) return null;
  if (has(t, ['bugünlük yeter', 'bugünlük bu kadar', 'mesai bitti', 'çıkıyorum', 'günü kapat'])) return 'end_day';
  if (has(t, ['panoya geç', 'panoyu aç', 'kanbanı aç', 'panoya git'])) return 'open_board';
  if (has(t, ['ekrandan bakarım', 'uygulamaya geç', 'brifingi kapat', 'brifingi geç', 'sonra bakarım'])) return 'to_app';
  if (has(t, ['brifingi aç', 'brifingi göster'])) return 'open_briefing';
  if (has(t, ['sesli brifing', 'brifingi oku', 'brifing ver', 'brifingi başlat'])) return 'briefing';
  if (has(t, ['wikiyi aç', 'wiki aç', 'wikiye git'])) return 'open_wiki';
  if (has(t, ['şimdi tara', 'tarama yap', 'maillere bak', 'yeni ne var'])) return 'scan';
  if (has(t, ['dur', 'sus', 'kes', 'sessiz ol', 'durdur'])) return 'stop';
  if (has(t, ['devam', 'devam et', 'sürdür'])) return 'resume';
  if (has(t, ['tekrar', 'tekrarla', 'anlamadım', 'bir daha'])) return 'repeat';
  if (has(t, ['detay', 'ayrıntı', 'detay ver', 'aç bakalım', 'anlat'])) return 'detail';
  if (has(t, ['geç', 'sonraki', 'atla', 'diğer', 'pas'])) return 'skip';
  if (has(t, ['hayır', 'sonra', 'şimdi değil', 'gerek yok', 'istemiyorum', 'yok', 'hayir'])) return 'no';
  if (has(t, ['evet', 'olur', 'tamam', 'peki', 'hadi', 'aynen', 'lütfen', 'ilerlet', 'hazırla', 'yap', 'başla'])) return 'yes';
  return null;
}

/** "Güneş, ..." ile başlıyorsa geri kalanını döndürür (sürekli dinlemede uyandırma kelimesi). */
export function stripWake(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(hey |hey,? )?(güneş|günes|gunes|güneşçim)[\s,!.:]*(.*)$/i);
  return m ? m[3].trim() : null;
}

/** Mikrofon Güneş'in kendi sesini duyduysa (yankı) yok say. */
export function isEcho(heard: string, speaking: string) {
  if (!speaking) return false;
  const h = norm(heard);
  const s = norm(speaking);
  if (h.length < 4) return false;
  return s.includes(h) || h.split(' ').filter((w) => w.length > 3 && s.includes(w)).length >= 3;
}
