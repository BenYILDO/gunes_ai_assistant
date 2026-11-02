/**
 * Sürekli dinleme (Edge'in yerleşik Türkçe konuşma tanıması).
 * Mikrofon açıkken arka planda dinler; tarayıcı sessizlikte durdurursa yeniden başlatır.
 */
type Handler = (text: string, final: boolean) => void;

const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
export const speechSupported = Boolean(SR);

const MIC_KEY = 'gunes.mic';
export const micPreference = () => {
  try {
    return localStorage.getItem(MIC_KEY) !== 'off';
  } catch {
    return true;
  }
};

class Listener {
  private rec: any = null;
  private handlers = new Set<Handler>();
  private stateHandlers = new Set<(s: ListenState) => void>();
  private wanted = false;
  state: ListenState = 'off';

  subscribe(h: Handler) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }
  onState(h: (s: ListenState) => void) {
    this.stateHandlers.add(h);
    h(this.state);
    return () => {
      this.stateHandlers.delete(h);
    };
  }
  private setState(s: ListenState) {
    this.state = s;
    this.stateHandlers.forEach((h) => h(s));
  }

  start() {
    if (!SR) return this.setState('unsupported');
    this.wanted = true;
    try {
      localStorage.setItem(MIC_KEY, 'on');
    } catch {
      /* yoksay */
    }
    if (this.rec) return;
    const rec = new SR();
    rec.lang = 'tr-TR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.setState('listening');
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = String(r[0]?.transcript ?? '').trim();
        if (text) this.handlers.forEach((h) => h(text, r.isFinal));
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.setState('denied');
      }
    };
    rec.onend = () => {
      this.rec = null;
      if (this.wanted) setTimeout(() => this.wanted && this.start(), 300);
      else if (!this.paused && this.state !== 'denied') this.setState('off');
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
    }
  }

  /** Güneş konuşurken geçici duraklatma (tercih değişmez) */
  private paused = false;
  pause() {
    if (!this.wanted || this.paused) return;
    this.paused = true;
    this.wanted = false;
    try {
      this.rec?.abort();
    } catch {
      /* yoksay */
    }
    this.rec = null;
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.start();
  }

  stop() {
    this.paused = false;
    this.wanted = false;
    try {
      localStorage.setItem(MIC_KEY, 'off');
    } catch {
      /* yoksay */
    }
    try {
      this.rec?.stop();
    } catch {
      /* yoksay */
    }
    this.rec = null;
    this.setState('off');
  }
}

export type ListenState = 'off' | 'listening' | 'denied' | 'unsupported';
export const listener = new Listener();

// Güneş konuşurken mikrofonu duraklat, bitince devam et
import { onSpeaking } from './speech';
onSpeaking((speaking) => (speaking ? listener.pause() : listener.resume()));
