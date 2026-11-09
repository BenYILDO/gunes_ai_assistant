/** Evcil hayvanın konuşmaları (saf): gerçek duruma bağlı cümleler, ara sıra genel tatlı cümleler. */
export interface PetCtx {
  name: string;
  mood: 'happy' | 'content' | 'hungry';
  fedToday: boolean;
  streak: number;
  /** 0-23 */
  hour: number;
  nextMeetingMins: number | null;
  nextMeetingTitle: string | null;
  critical: number;
}

const GENERIC = [
  'Beni sev lütfen 🥺',
  'Mırr mırr… 🐾',
  'Bir kartı bitir, ben de alkışlarım 👏',
  'Su içtin mi? 💧',
  'Ben buradayım, sen çalış 🐱',
  'Biraz gerinsene… 🧘',
  'Kuyruğumu yakalamaya çalışıyorum, bakma 🙈',
];

/** Duruma özgü cümleler (en önemli önce). Boş olabilir. */
export function contextLines(c: PetCtx): string[] {
  const out: string[] = [];
  const m = c.nextMeetingMins;
  if (m !== null && m >= 1 && m <= 10) out.push(`${(c.nextMeetingTitle ?? 'Toplantı').slice(0, 40)} ${m} dk sonra, hazır mısın? 📅`);
  else if (m !== null && m > 10 && m <= 30) out.push('Toplantıya az var, hazırlık notuna baktın mı? 📝');
  if (!c.fedToday && c.hour >= 9) out.push(`Karnım acıktı… mama kabım nerede? 🍽️`);
  if (c.critical > 0) out.push(`${c.critical} öncelikli iş var; ben yanındayım 🐾`);
  if (c.streak >= 3) out.push(`${c.streak} gündür her gün beni besliyorsun, seni seviyorum! 💛`);
  if (c.hour < 10) out.push('Günaydın! Bugün güzel işler yapacağız ☀️');
  else if (c.hour >= 12 && c.hour < 14) out.push('Öğle arası! Biraz kalk, ben beklerim 🥪');
  else if (c.hour >= 17 && c.hour < 22) out.push('Bugünlük yeter diyebilirsin, çok çalıştın 🌇');
  else if (c.hour >= 22 || c.hour < 6) out.push('Uyku vakti… sen de dinlen 😴');
  return out;
}

/** Bir cümle seç: ~%70 duruma özgü (varsa), aksi halde genel; bir önceki cümleyi tekrarlamaz. */
export function pickLine(c: PetCtx, rnd: () => number = Math.random, last: string | null = null): string {
  const ctx = contextLines(c).filter((l) => l !== last);
  const gen = GENERIC.filter((l) => l !== last);
  const pool = ctx.length && rnd() < 0.7 ? ctx : gen;
  return pool[Math.floor(rnd() * pool.length)] ?? GENERIC[0]!;
}

export const FED_LINES = ['Çok teşekkür ederim! Mmm 😋', 'Karnım doydu, sen en iyisisin 💛', 'Nyam nyam… harika! 🐟'];
export const PAT_LINES = ['Mırr mırr… 💕', 'Bir daha, bir daha! 🥰', 'Kulağımın arkası… evet orası 😸', 'Seni seviyorum 💛'];
export const CARD_LINES = ['Burası çok rahat 😽', 'Bu kartı ben koruyorum 🐾', 'İşine bak, ben burada dinleniyorum 😴', 'Kartın üstü sıcacık… mırr 💤', 'Tırmandım! Görüyor musun? 😼'];
export const SLEEPY_LINES = ['Mmm… beş dakika daha 😴', 'Zzz… kim o? 💤', 'Uykum var… ama sevmeye devam et 🥱', 'Mırr… zzz 💤'];
export const WAKE_LINES = ['Tamam tamam, uyandım! 😸 Biraz oynayalım mı?', 'Çok sevildim, artık uyuyamam! 😻', 'Uyandım uyandım! Hadi kartlara zıplayalım 🐾'];
export const EXCITED_LINES = ['Çok sevildim, enerjim geldi! 😻', 'Şimdi tüm kartları gezeceğim! 🚀', 'Mırr! Koşma zamanı 🐈'];
export const EDGE_LINES = ['Buradan her şey çok iyi görünüyor 👀', 'Çizgide yürümek çok eğlenceli! 🐾', 'Dengemi koruyorum… 🤸', 'Bu kenar tam bana göre 😼'];
export const SLEEP_AGAIN = ['Uykum geldi yine… iyi geceler 😴', 'Yeterince oynadım, biraz uyuyayım 💤'];
export const BOWL_LINES = ['Karnım acıktı! Mama kabıma tıklar mısın? 🥺', 'Mamaaa… kabım burada 🥣', 'Aç karnına çalışılmaz! Beni besle 🐾'];
export const PLAY_LINES = ['Yumak! Yakaladım! 🧶', 'Bu top benim! 😼', 'Oyun zamanı! 🐾'];
export const HOME_LINES = ['Minder çok yumuşakmış 😽', 'Burası tam bana göre 💤', 'Evime giriyorum, iyi geceler 🏠', 'Kendi evim, kendi uykum 😴'];
export const DROP_LINES = ['Yukarısı yüksekmiş! 😳', 'Yeni yerim güzel 😺', 'Havalandım! 🚀'];
export const pickFrom = (list: string[], rnd: () => number = Math.random) => list[Math.floor(rnd() * list.length)] ?? list[0]!;
