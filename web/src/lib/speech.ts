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
const BAD_KEY = 'gunes.badVoices';
const GOOD_KEY = 'gunes.goodVoice';
const readJSON = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return d;
  }
};
/** Başlamayan sesler (ör. şirket ağında engellenen bulut "Online" sesleri) bir daha denenmez */
export const markBadVoice = (name: string) => {
  const bad = new Set(readJSON<string[]>(BAD_KEY, []));
  bad.add(name);
  try {
    localStorage.setItem(BAD_KEY, JSON.stringify([...bad]));
    if (localStorage.getItem(GOOD_KEY) === name) localStorage.removeItem(GOOD_KEY);
  } catch {
    /* yoksay */
  }
};
const markGoodVoice = (name: string) => {
  try {
    localStorage.setItem(GOOD_KEY, name);
  } catch {
    /* yoksay */
  }
};
export const resetVoicePrefs = () => {
  try {
    localStorage.removeItem(BAD_KEY);
    localStorage.removeItem(GOOD_KEY);
  } catch {
    /* yoksay */
  }
};

/** Denenecek sesler sırasıyla: çalıştığı bilinen → Emel (doğal) → doğal kadın → yerel kadın → herhangi Türkçe */
export function voiceCandidates(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const tr = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('tr'));
  const bad = new Set(readJSON<string[]>(BAD_KEY, []));
  const good = (() => {
    try {
      return localStorage.getItem(GOOD_KEY);
    } catch {
      return null;
    }
  })();
  const score = (v: SpeechSynthesisVoice) =>
    (v.name === good ? 0 : 10) +
    (/emel/i.test(v.name) ? 0 : 4) +
    (MALE.test(v.name) ? 6 : 0) +
    (/natural|online/i.test(v.name) ? 0 : 1);
  return tr.filter((v) => !bad.has(v.name)).sort((a, b) => score(a) - score(b));
}

export function pickVoice(): SpeechSynthesisVoice | null {
  return voiceCandidates()[0] ?? null;
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

/** Tek bir cümleyi verilen sesle okur; "started" = ses motoru gerçekten başladı mı */
function utterWith(text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number) {
  return new Promise<{ started: boolean; error?: string }>((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    if (voice) u.voice = voice;
    // Doğal (Natural) olmayan eski seslerde (ör. Tolga) perde/hız nötr: yükseltilmiş perde yapay duyuluyor
    const natural = !voice || /natural|online/i.test(voice.name);
    u.rate = natural ? rate : 1.05;
    u.pitch = natural ? pitch : 1;
    u.volume = 1;
    let started = false;
    let finished = false;
    const done = (error?: string) => {
      if (finished) return;
      finished = true;
      resolve({ started, error });
    };
    u.onstart = () => {
      started = true;
      lastStartAt = Date.now();
    };
    u.onend = () => done();
    u.onerror = (e) => {
      lastError = (e as SpeechSynthesisErrorEvent).error ?? 'bilinmeyen';
      done(lastError);
    };
    synth.speak(u);
    synth.resume(); // Chromium bazen kuyruğu duraklatılmış bırakır
    // 2,5 sn içinde başlamazsa bu ses çalışmıyor say
    setTimeout(() => {
      if (!started) {
        synth.cancel();
        done('başlamadı');
      }
    }, 2500);
    setTimeout(() => done(), Math.max(4000, text.length * 120)); // onend gelmezse
  });
}

/** Tek bir cümleyi okur; ses başlamazsa sıradaki sese (sonunda varsayılan sese) geçer ve çalışanı hatırlar. */
async function utter(text: string, rate: number, pitch: number) {
  const candidates: (SpeechSynthesisVoice | null)[] = [...voiceCandidates().slice(0, 4), null];
  for (const v of candidates) {
    const r = await utterWith(text, v, rate, pitch);
    if (r.started) {
      if (v) markGoodVoice(v.name);
      return;
    }
    if (v) markBadVoice(v.name);
    await new Promise((res) => setTimeout(res, 120));
  }
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
