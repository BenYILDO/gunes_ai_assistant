/** Ses tanılama: sesleri tek tek dener, mikrofonu ve sayfanın ses çıkışını kontrol eder. */
import { resetVoicePrefs } from './speech';

export interface VoiceTry { voice: string; local: boolean; started: boolean; startMs: number | null; error: string | null }
export interface DiagReport {
  at: string;
  userAgent: string;
  online: boolean;
  synthesis: boolean;
  voices: { name: string; lang: string; local: boolean }[];
  tries: VoiceTry[];
  beep: { ok: boolean; state: string; error?: string };
  mic: { recognition: boolean; permission: string };
}

function tryVoice(v: SpeechSynthesisVoice | null): Promise<VoiceTry> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance('Test.');
    u.lang = 'tr-TR';
    if (v) u.voice = v;
    u.volume = 1;
    const t0 = Date.now();
    let started = false;
    let startMs: number | null = null;
    let finished = false;
    const done = (error: string | null) => {
      if (finished) return;
      finished = true;
      synth.cancel();
      resolve({ voice: v?.name ?? '(varsayılan)', local: v?.localService ?? true, started, startMs, error });
    };
    u.onstart = () => {
      started = true;
      startMs = Date.now() - t0;
    };
    u.onend = () => done(null);
    u.onerror = (e) => done((e as SpeechSynthesisErrorEvent).error ?? 'hata');
    synth.speak(u);
    synth.resume();
    setTimeout(() => done(started ? null : 'zaman aşımı (başlamadı)'), 4000);
  });
}

async function beep(): Promise<DiagReport['beep']> {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 660;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    await new Promise((r) => setTimeout(r, 350));
    o.stop();
    const state = ctx.state;
    void ctx.close();
    return { ok: state === 'running', state };
  } catch (e) {
    return { ok: false, state: 'hata', error: (e as Error).message };
  }
}

export async function runVoiceDiag(): Promise<DiagReport> {
  resetVoicePrefs();
  const synthesis = 'speechSynthesis' in window;
  if (synthesis && !window.speechSynthesis.getVoices().length)
    await new Promise<void>((r) => {
      window.speechSynthesis.addEventListener('voiceschanged', () => r(), { once: true });
      setTimeout(r, 2000);
    });
  const all = synthesis ? window.speechSynthesis.getVoices() : [];
  const tr = all.filter((v) => v.lang.toLowerCase().startsWith('tr'));
  const tries: VoiceTry[] = [];
  if (synthesis) {
    for (const v of [...tr.slice(0, 6), null]) tries.push(await tryVoice(v));
  }
  let permission = 'bilinmiyor';
  try {
    permission = (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
  } catch {
    /* yoksay */
  }
  return {
    at: new Date().toISOString(),
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    synthesis,
    voices: (tr.length ? tr : all.slice(0, 15)).map((v) => ({ name: v.name, lang: v.lang, local: v.localService })),
    tries,
    beep: await beep(),
    mic: { recognition: Boolean((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition), permission },
  };
}
