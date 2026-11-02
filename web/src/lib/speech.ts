/**
 * Güneş'in sesi: tarayıcının (Edge) kendi Türkçe sesleri — ücretsiz, anahtarsız.
 * Kadın sesi tercih edilir: "Microsoft Emel Online (Natural)".
 */
const KEY = 'gunes.voice';

export const voiceEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
export const setVoiceEnabled = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* yoksay */
  }
  if (!on) cancelSpeech();
};

const MALE = /ahmet|tolga|emre|erkek|male/i;

/** En iyi Türkçe kadın sesi: Emel (doğal) → diğer doğal kadın sesleri → herhangi bir Türkçe ses */
export function pickVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const tr = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('tr'));
  return (
    tr.find((v) => /emel/i.test(v.name) && /natural|online/i.test(v.name)) ??
    tr.find((v) => /emel/i.test(v.name)) ??
    tr.find((v) => /natural|online/i.test(v.name) && !MALE.test(v.name)) ??
    tr.find((v) => !MALE.test(v.name)) ??
    tr[0] ??
    null
  );
}

function whenVoices(fn: () => void) {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length) return fn();
  // Ses listesi gelmezse (bazı ortamlarda) 1,5 sn sonra varsayılan sesle devam et
  let called = false;
  const once = () => {
    if (called) return;
    called = true;
    fn();
  };
  synth.addEventListener('voiceschanged', once, { once: true });
  setTimeout(once, 1500);
}

let speakingText = '';
/** Şu an okunan metin (mikrofonun Güneş'in kendi sesini komut sanmaması için) */
export const currentSpeech = () => speakingText;
export const isSpeaking = () => 'speechSynthesis' in window && window.speechSynthesis.speaking;

export function cancelSpeech() {
  speakingText = '';
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Okur ve bitince çözülür. Sabah tonu için hız biraz düşük, perde hafif yüksek (sıcak). */
export function speakAsync(text: string, opts: { rate?: number; pitch?: number; force?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    if ((!voiceEnabled() && !opts.force) || !('speechSynthesis' in window) || !text.trim()) return resolve();
    whenVoices(() => {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR';
      u.voice = pickVoice();
      u.rate = opts.rate ?? 0.98;
      u.pitch = opts.pitch ?? 1.08;
      speakingText = text;
      const done = () => {
        if (speakingText === text) speakingText = '';
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.cancel();
      synth.speak(u);
      // Bazı tarayıcılar onend'i kaçırır: güvenlik zaman aşımı
      setTimeout(done, Math.max(4000, text.length * 110));
    });
  });
}

/** Ateşle ve unut */
export function speak(text: string) {
  void speakAsync(text);
}

/** Ses testi: kısa bir cümle okur ve kullanılan sesi/bulunan Türkçe sesleri döndürür. */
export async function voiceTest(name: string) {
  if (!('speechSynthesis' in window)) return { ok: false, voice: null as string | null, turkish: [] as string[] };
  await new Promise<void>((r) => whenVoices(r));
  const turkish = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('tr')).map((v) => v.name);
  const voice = pickVoice()?.name ?? null;
  void speakAsync(`Merhaba ${name}, sesimi duyuyor musunuz? Ben Güneş.`, { force: true });
  return { ok: true, voice, turkish };
}
