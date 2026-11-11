/** Yüz yüze toplantı: sesli duyuru metinleri ve katılımcı adı ayrıştırma (saf, test edilir). */

/** Duyuru metninde {ad} kullanıcının adıyla değişir. */
export const DEFAULT_GREETING =
  'İyi çalışmalar herkese! Ben Güneş, {ad} için çalışan yapay zekâ asistanıyım. ' +
  'Bu toplantıya ben de katıldım: notları tutmak için sizi dinleyeceğim. ' +
  'Ses bu bilgisayarda yazıya çevriliyor. Rahatsız olan olursa lütfen söylesin, hemen durururum. ' +
  'Buradayım ve sizi dinliyorum!';

export const DEFAULT_FAREWELL = 'Dinleme bitti, hepinize teşekkürler! Notları hazırlıyorum.';

/** Boş/çok uzun metin varsayılana döner; {ad} yoksa olduğu gibi okunur. */
export function greetingText(template: string, name: string): string {
  const t = template.trim().slice(0, 600) || DEFAULT_GREETING;
  return t.replace(/\{ad\}/gi, name.trim() || 'sahibim');
}

/** "Ali Veli, Ayşe Kaya; Mehmet" → ["Ali Veli", "Ayşe Kaya", "Mehmet"] (en çok 30, tekrarsız). */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const n = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
    const k = n.toLocaleLowerCase('tr');
    if (!n || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length >= 30) break;
  }
  return out;
}
