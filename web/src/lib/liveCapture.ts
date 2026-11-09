import { useSyncExternalStore } from 'react';
import { api, type MeetingItem } from './api';

/**
 * Canlı toplantı yakalama: siz kayıt almadan Güneş toplantıyı sizinle birlikte dinler.
 * Tarayıcı iki sesi karıştırır: karşı tarafın sesi (ekran paylaşımındaki "sistem sesi") + mikrofonunuz.
 * Ses parçaları yalnızca bu bilgisayardaki Güneş sunucusuna gider (127.0.0.1); toplantı bitince yerel olarak yazıya çevrilir.
 * Not: Teams'e katılan bir bot DEĞİLDİR; toplantıyı bu bilgisayarın hoparlör/kulaklık çıkışından yakalar.
 */
export interface LiveState {
  active: boolean;
  stopping: boolean;
  meetingId: string | null;
  title: string;
  startedAt: number | null;
  micOk: boolean;
  chunks: number;
  failed: number;
  error: string | null;
}

const idle: LiveState = { active: false, stopping: false, meetingId: null, title: '', startedAt: null, micOk: false, chunks: 0, failed: 0, error: null };

class LiveCapture {
  private s: LiveState = idle;
  private subs = new Set<() => void>();
  private display: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private rec: MediaRecorder | null = null;
  private queue: Blob[] = [];
  private pumping: Promise<void> | null = null;
  private onDone: ((m: MeetingItem | null) => void) | null = null;

  getState = () => this.s;
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
  private set(p: Partial<LiveState>) {
    this.s = { ...this.s, ...p };
    this.subs.forEach((f) => f());
  }

  static supported() {
    return Boolean(navigator.mediaDevices?.getDisplayMedia) && typeof MediaRecorder !== 'undefined';
  }

  /** Kullanıcı tıklamasından çağrılmalı (ekran paylaşımı izni için). */
  async start(meta: { title?: string; event?: string; project?: string }, onDone?: (m: MeetingItem | null) => void) {
    if (this.s.active) throw new Error('Zaten dinleniyor.');
    if (!LiveCapture.supported()) throw new Error('Bu tarayıcı ekran/sistem sesi yakalamayı desteklemiyor.');
    this.onDone = onDone ?? null;

    // 1) Karşı tarafın sesi: ekran paylaşımı + "sistem sesini paylaş"
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (!display.getAudioTracks().length) {
      display.getTracks().forEach((t) => t.stop());
      throw new Error('Ses paylaşılmadı. Açılan pencerede "Tüm ekran"ı seçip "Sistem sesini de paylaş" kutusunu işaretleyin.');
    }
    // 2) Kendi sesiniz (reddedilirse yalnızca sistem sesiyle devam edilir)
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      mic = null;
    }
    let meeting: MeetingItem;
    try {
      meeting = await api.meetingLive(meta);
    } catch (e) {
      display.getTracks().forEach((t) => t.stop());
      mic?.getTracks().forEach((t) => t.stop());
      throw e;
    }

    // Görüntüye ihtiyaç yok: yalnızca sesi tut
    display.getVideoTracks().forEach((t) => t.stop());
    this.display = display;
    this.mic = mic;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
    if (mic) ctx.createMediaStreamSource(mic).connect(dest);

    const mime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
    this.rec = rec;
    this.queue = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) {
        this.queue.push(e.data);
        void this.pump();
      }
    };
    rec.onstop = () => void this.finish();
    // Paylaşım penceresinden "Paylaşımı durdur" denirse otomatik bitir
    display.getAudioTracks().forEach((t) => (t.onended = () => void this.stop()));

    this.set({ ...idle, active: true, meetingId: meeting.id, title: meeting.title, startedAt: Date.now(), micOk: Boolean(mic) });
    rec.start(15000);
    window.addEventListener('beforeunload', this.warn);
    return meeting;
  }

  private warn = (e: BeforeUnloadEvent) => {
    if (this.s.active) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  private pump() {
    if (this.pumping) return this.pumping;
    this.pumping = (async () => {
      while (this.queue.length && this.s.meetingId) {
        const blob = this.queue.shift()!;
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) {
          try {
            await api.meetingChunk(this.s.meetingId, blob);
            ok = true;
          } catch {
            await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
          }
        }
        this.set(ok ? { chunks: this.s.chunks + 1 } : { failed: this.s.failed + 1, error: 'Bazı ses parçaları sunucuya gönderilemedi.' });
      }
      this.pumping = null;
    })();
    return this.pumping;
  }

  async stop() {
    if (!this.s.active || this.s.stopping) return;
    this.set({ stopping: true });
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); // son parça + onstop → finish()
    else void this.finish();
  }

  private async finish() {
    await this.pump(); // kalan parçaları gönder
    const id = this.s.meetingId;
    this.display?.getTracks().forEach((t) => t.stop());
    this.mic?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    window.removeEventListener('beforeunload', this.warn);
    let m: MeetingItem | null = null;
    let error: string | null = this.s.error;
    if (id) {
      try {
        m = await api.meetingFinish(id);
      } catch (e) {
        error = (e as Error).message;
      }
    }
    this.display = this.mic = this.ctx = this.rec = null;
    this.set({ ...idle, error });
    this.onDone?.(m);
    this.onDone = null;
  }
}

export const liveCapture = new LiveCapture();
export const liveSupported = () => LiveCapture.supported();
export function useLive() {
  return useSyncExternalStore(liveCapture.subscribe, liveCapture.getState);
}
