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
  token++;
  speakingText = '';
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  speakHooks.forEach((h) => h(false));
}

/** Konuşma başlarken/bitince haber ver (mikrofon bu sırada duraklar; Edge'de tanıma açıkken ses çıkmayabiliyor) */
const speakHooks = new Set<(speaking: boolean) => void>();
export function onSpeaking(h: (speaking: boolean) => void) {
  speakHooks.add(h);
  return () => {
    speakHooks.delete(h);
  };
}

let token = 0;
let lastStartAt = 0;
let lastError = '';

/** Tek bir cümleyi okur. */
function utter(text: string, rate: number, pitch: number) {
  return new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    u.onstart = () => {
      lastStartAt = Date.now();
    };
    u.onend = done;
    u.onerror = (e) => {
      lastError = (e as SpeechSynthesisErrorEvent).error ?? 'bilinmeyen';
      done();
    };
    synth.speak(u);
    synth.resume(); // Chromium bazen kuyruğu duraklatılmış bırakır
    setTimeout(done, Math.max(3500, text.length * 120)); // onend gelmezse
  });
}

/** Okur ve bitince çözülür. Metni cümlelere böler (Chromium uzun metinleri yarıda kesebiliyor). */
export function speakAsync(text: string, opts: { rate?: number; pitch?: number; force?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    if ((!voiceEnabled() && !opts.force) || !('speechSynthesis' in window) || !text.trim()) return resolve();
    whenVoices(async () => {
      const synth = window.speechSynthesis;
      const my = ++token;
      if (synth.speaking || synth.pending) {
        synth.cancel();
        await new Promise((r) => setTimeout(r, 120)); // iptalin hemen ardından speak() yutulabiliyor
      }
      speakingText = text;
      speakHooks.forEach((h) => h(true));
      await new Promise((r) => setTimeout(r, 150)); // mikrofon dursun
      const parts = text.match(/[^.!?…]+[.!?…]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [text];
      for (const p of parts) {
        if (my !== token) break; // yeni bir konuşma başladı / iptal edildi
        await utter(p, opts.rate ?? 0.98, opts.pitch ?? 1.08);
      }
      if (my === token) {
        speakingText = '';
        speakHooks.forEach((h) => h(false));
      }
      resolve();
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
  const t0 = Date.now();
  lastError = '';
  void speakAsync(`Merhaba ${name}, sesimi duyuyor musunuz? Ben Güneş.`, { force: true });
  await new Promise((r) => setTimeout(r, 2500));
  const started = lastStartAt >= t0;
  return { ok: true, voice, turkish, started, error: lastError };
}
