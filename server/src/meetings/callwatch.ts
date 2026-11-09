/**
 * Arama algılama: Windows her uygulamanın mikrofon kullanımını kayıt defterinde tutar
 * (HKCU\...\CapabilityAccessManager\ConsentStore\microphone\<uygulama>: LastUsedTimeStart / LastUsedTimeStop;
 * Stop = 0 ise mikrofon ŞU AN kullanımda). Teams, Zoom vb. bir aramaya girince mikrofonu açar → Güneş fark eder
 * ve kullanıcıya "katılmamı ister misiniz?" diye sorar. Kullanıcı onaylamadan hiçbir şey kaydedilmez.
 * Takvimde o saatte toplantı varsa onunla eşleştirilir; yoksa "plansız arama" sayılır.
 *
 * Mikrofon arama CEVAPLANINCA (ya da başlatılınca) açılır. Çalan aramayı CEVAPTAN ÖNCE yakalamak için ikinci sinyal: Teams'in
 * gelen arama bildirimi penceresi (bkz. ringwatch.ts). Çalarken sorulur, "Katıl" denirse hemen dinlenir; cevaplanmazsa kayıt atılır.
 */
import type { EventItem } from '../store/types.js';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { run } from './tools.js';
import { abortNative, finishNative, nativeAvailable, nativeStatus } from './capture.js';
import { removeMeetingFiles } from './pipeline.js';
import { hasCallWords, ringEvents, type RingEvent } from './ringwatch.js';
import { popupText, showCallPopup, type PopupHandle } from './callpopup.js';
import { startLiveMeeting } from './live.js';
import { identifyCaller, NO_IDENTITY, type Identity } from './callid.js';
import { sameName } from './voices.js';

const MIC_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

export interface MicEntry {
  /** Anahtar adı: paketli uygulamada "MSTeams_8wekyb3d8bbwe", diğerlerinde "NonPackaged\C:#...#Zoom.exe" */
  key: string;
  start: bigint;
  stop: bigint;
}

/** `reg query ... /s` çıktısını ayrıştırır. */
export function parseConsentStore(text: string): MicEntry[] {
  const out: MicEntry[] = [];
  let cur: { key: string; start?: bigint; stop?: bigint } | null = null;
  const flush = () => {
    if (cur && cur.start !== undefined) out.push({ key: cur.key, start: cur.start, stop: cur.stop ?? 0n });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^HKEY_/i.test(line)) {
      flush();
      const i = line.toLowerCase().indexOf('\\microphone');
      const rest = i >= 0 ? line.slice(i + '\\microphone'.length).replace(/^\\/, '') : '';
      cur = rest ? { key: rest } : null; // kök anahtarın kendisini (microphone) atla
      continue;
    }
    const m = line.match(/^(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-f]+)$/i);
    if (m && cur) {
      const v = BigInt(m[2]!);
      if (m[1]!.toLowerCase() === 'lastusedtimestart') cur.start = v;
      else cur.stop = v;
    }
  }
  flush();
  return out;
}

/** Kayıt defterinden mikrofon kullanım kayıtlarını okur; okunamazsa null (Windows dışı ya da erişim hatası). */
export async function readMicEntries(): Promise<MicEntry[] | null> {
  if (process.platform !== 'win32') return null;
  const r = await run('reg.exe', ['query', MIC_KEY, '/s']).catch(() => null);
  if (!r || (r.code !== 0 && !r.stdout)) return null;
  return parseConsentStore(r.stdout);
}

/** "NonPackaged" üst anahtarı gerçek bir uygulama değil; paketli ad ya da .exe yolu döner. */
export function appLabel(key: string) {
  const k = key.replace(/^NonPackaged\\?/i, '');
  if (!k || /^NonPackaged$/i.test(key)) return '';
  return k.includes('#') ? k.split('#').pop()! : k.replace(/_.*$/, '');
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Mikrofonu ŞU AN kullanan, izin verilen (arama) uygulamaları döner. */
export function activeCallApps(entries: MicEntry[], allowed: string[]) {
  const tokens = allowed.map(norm).filter(Boolean);
  return entries
    .filter((e) => e.start > 0n && e.stop === 0n)
    .map((e) => ({ label: appLabel(e.key), sid: `${e.key}:${e.start}` }))
    .filter((e) => e.label && tokens.some((t) => norm(e.label).includes(t)));
}

// ---------- durum makinesi (saf)
export type CallStatus = 'idle' | 'detecting' | 'pending' | 'declined' | 'joined';
export interface CallData {
  id: string | null;
  app: string | null;
  since: number | null;
  lastSeen: number;
  status: CallStatus;
}
export const IDLE: CallData = { id: null, app: null, since: null, lastSeen: 0, status: 'idle' };

/**
 * obs = şu an mikrofonu kullanan arama uygulaması (yoksa null).
 * - Yeni bir oturum kısa süre (debounce) sürerse 'pending' olur (anlık mikrofon açılışlarını yok say).
 * - Kullanıcı karar verdikten (declined/joined) sonra aynı arama için tekrar sorulmaz.
 * - Mikrofon `graceMs` boyunca kapalı kalırsa arama bitmiş sayılır.
 */
export function stepCall(prev: CallData, obs: { sid: string; app: string } | null, now: number, o: { debounceMs?: number; graceMs?: number } = {}): CallData {
  const debounce = o.debounceMs ?? 1500;
  const grace = o.graceMs ?? 10000;
  if (obs) {
    if (prev.id !== obs.sid) return { id: obs.sid, app: obs.app, since: now, lastSeen: now, status: 'detecting' };
    const status = prev.status === 'detecting' && now - (prev.since ?? now) >= debounce ? 'pending' : prev.status;
    return { ...prev, lastSeen: now, status };
  }
  if (prev.id && now - prev.lastSeen >= grace) return { ...IDLE };
  return prev;
}

/** Çalan aramanın oturumunu ("ring:…") cevaplanınca açılan gerçek mikrofon oturumuna devreder; verilen karar (katıl/reddet) korunur. */
export function adoptRing(prev: CallData, obs: { sid: string; app: string } | null, now: number): CallData | null {
  if (!obs || !prev.id?.startsWith('ring:') || prev.status === 'idle') return null;
  return { ...prev, id: obs.sid, app: obs.app, lastSeen: now };
}

/** Çalan aramada bildirim metinleri gelene kadar en çok bu kadar beklenir (ms); gelmezse yine de sorulur. */
export const RING_CONFIRM_MS = 700;

/** Şu anki saate denk gelen takvim toplantısı (başlamadan 15 dk önce ... bittikten 10 dk sonra); en yakın başlangıç. */
export function matchEvent(events: EventItem[], now: number): EventItem | null {
  let best: EventItem | null = null;
  let bestD = Infinity;
  for (const e of events) {
    if (e.source !== 'calendar') continue;
    const s = Date.parse(e.occurred_at);
    if (!Number.isFinite(s)) continue;
    const end = e.ends_at ? Date.parse(e.ends_at) : s + 60 * 60_000;
    if (now >= s - 15 * 60_000 && now <= end + 10 * 60_000) {
      const d = Math.abs(now - s);
      if (d < bestD) ((best = e), (bestD = d));
    }
  }
  return best;
}

export interface CallSnapshot {
  /** Arayüz bu durumdayken pencereyi gösterir */
  prompt: boolean;
  status: CallStatus;
  app: string | null;
  since: string | null;
  planned: boolean;
  event: { external_id: string; subject: string; occurred_at: string } | null;
  /** "Katıl" denince pencere görüntüsünden arayan okunur mu (GUNES_CALL_SCREENSHOT) */
  screenshot: boolean;
  /** Arama şu an ÇALIYOR (henüz cevaplanmadı) */
  ringing: boolean;
  /** Windows popup'ı şu an açık (tarayıcı popup'ı bu sırada gizlenir) */
  nativePopup: boolean;
  /** Popup'tan "Katıl" denince dinleme başlatılamadıysa neden */
  error: string | null;
  /** Arayan (ekran görüntüsünden okundu; doğrulanmalı) */
  identity: Pick<Identity, 'status' | 'callers' | 'title' | 'confidence' | 'note'>;
}

class CallWatcher {
  private data: CallData = { ...IDLE };
  private event: EventItem | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private identity: Identity = NO_IDENTITY;
  private identityJob: Promise<void> | null = null;
  private identifyOnAnswer = false;
  private attachId: string | null = null;
  private popup: PopupHandle | null = null;
  private popupFor: string | null = null;
  private joinError: string | null = null;
  /** Çalan arama (Teams bildirim penceresi) */
  private ring: { hwnd: string; goneAt: number | null; answered: boolean; timer: NodeJS.Timeout | null } | null = null;
  /** Çalarken "Katıl" denince başlayan dinleme: cevaplanmazsa atılır */
  private ringMeetingId: string | null = null;
  private cal: EventItem[] = [];
  private calAt = 0;

  start() {
    if (this.timer || process.platform !== 'win32' || !config.meetings.callWatch) return;
    this.timer = setInterval(() => void this.tick(), 1000);
    ringEvents.on('ring', this.onRingEvent);
    void this.refreshCalendar();
    void this.tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    ringEvents.off('ring', this.onRingEvent);
  }

  /** Takvim önbelleği: popup'ın takvim eşleşmesini beklemeden göstermek için */
  private async refreshCalendar() {
    this.calAt = Date.now();
    try {
      this.cal = await getStore().listEvents({ sinceDays: 2, limit: 3000 });
    } catch {
      /* depo erişilemedi: eski önbellek kalır */
    }
  }

  // ---------- çalan arama (Teams bildirim penceresi)
  private onRingEvent = (e: RingEvent) => {
    const now = Date.now();
    if (e.type === 'toast') {
      if (this.data.id) return; // zaten bir arama izleniyor
      this.data = { id: `ring:${e.hwnd}`, app: 'Teams', since: now, lastSeen: now, status: 'detecting' };
      this.event = null;
      this.identity = NO_IDENTITY;
      this.attachId = null;
      this.joinError = null;
      this.identifyOnAnswer = false;
      this.ringMeetingId = null;
      this.ring = { hwnd: e.hwnd, goneAt: null, answered: false, timer: setTimeout(() => this.confirmRing(e.hwnd), RING_CONFIRM_MS) };
    } else if (e.type === 'texts') {
      if (this.ring?.hwnd !== e.hwnd || this.data.status !== 'detecting') return;
      // Bildirimde arama sözcüğü yoksa (ör. sohbet/hatırlatma bildirimi) sorma; metin hiç okunamazsa yine de sorulur
      if (e.texts.length >= 3 && !hasCallWords(e.texts)) this.dropRing();
      else this.confirmRing(e.hwnd);
    } else if (e.type === 'toast-gone') {
      if (this.ring?.hwnd === e.hwnd) this.ring.goneAt = now;
    }
  };

  private confirmRing(hwnd: string) {
    if (this.ring?.hwnd !== hwnd || this.data.id !== `ring:${hwnd}` || this.data.status !== 'detecting') return;
    if (this.ring.timer) clearTimeout(this.ring.timer);
    this.data = { ...this.data, status: 'pending' };
    this.event = matchEvent(this.cal, Date.now());
    this.maybeShowPopup(true);
  }

  /** Çalan "arama" aslında arama değildi: hiçbir şey yapmadan bırak */
  private dropRing() {
    if (this.ring?.timer) clearTimeout(this.ring.timer);
    this.ring = null;
    this.data = { ...IDLE };
  }

  /** Arama çaldı ama cevaplanmadı (reddedildi/kaçırıldı): popup kapanır; "Katıl" denmişse başlayan dinleme ATILIR. */
  private async endRingUnanswered() {
    if (this.ring?.timer) clearTimeout(this.ring.timer);
    this.ring = null;
    this.popup?.close();
    const id = this.ringMeetingId;
    this.ringMeetingId = null;
    if (id) {
      await abortNative(id).catch(() => {});
      await getStore().deleteMeeting(id).catch(() => {});
      removeMeetingFiles(id);
    }
    this.data = { ...IDLE };
    this.event = null;
    this.identity = NO_IDENTITY;
    this.attachId = null;
    this.joinError = null;
    this.identifyOnAnswer = false;
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const entries = await readMicEntries();
      if (!entries) return;
      const now = Date.now();
      const active = activeCallApps(entries, config.meetings.callApps)[0] ?? null;
      const obs = active ? { sid: active.sid, app: active.label } : null;
      if (now - this.calAt > 60_000) void this.refreshCalendar();
      const before = this.data;
      // Çalan arama cevaplandı (mikrofon açıldı): çalma oturumunu gerçek aramaya devret; karar/olay/kimlik korunur
      const adopted = adoptRing(this.data, obs, now);
      if (adopted) {
        if (this.popupFor === this.data.id) this.popupFor = adopted.id;
        this.data = adopted;
        if (this.ring) this.ring.answered = true;
        this.ringMeetingId = null; // cevaplandı: başlayan dinleme artık gerçek aramanın dinlemesi
        if (this.identifyOnAnswer) {
          this.identifyOnAnswer = false;
          setTimeout(() => this.startIdentify(), 1500); // arama penceresi açılınca arayanı oku
        }
      } else if (this.ring && this.ring.goneAt === null && this.data.id) {
        this.data = { ...this.data, lastSeen: now }; // bildirim penceresi sürdükçe çalan oturum canlı
      }
      this.data = stepCall(this.data, obs, now);
      // Çaldı ama cevaplanmadı
      if (this.ring && !this.ring.answered && this.ring.goneAt && now - this.ring.goneAt > 4000 && !obs) await this.endRingUnanswered();
      // Arama bitti (mikrofon kapandı): Güneş'in o arama için başlattığı yerel dinleme kendiliğinden biter ve işlenir
      if (before.id && !this.data.id) {
        this.popup?.close();
        this.ring = null;
        const st = nativeStatus();
        if (st?.fromCall && !st.stopping) void finishNative(st.meetingId).catch(() => {});
      }
      if (this.data.id !== before.id && !adopted) {
        this.event = null;
        this.identity = NO_IDENTITY;
        this.attachId = null;
        this.joinError = null;
      }
      if (this.data.status === 'pending' && before.status !== 'pending') {
        // Güneş zaten bu toplantıyı dinliyorsa (kullanıcı elle başlattı) sorma
        const meetings = await getStore().listMeetings(5).catch(() => []);
        if (meetings.some((m) => m.status === 'recording')) this.data = { ...this.data, status: 'joined' };
        else if (!this.event) this.event = matchEvent(this.cal, now);
      }
      if (this.data.status === 'pending') this.maybeShowPopup(false);
    } catch {
      /* kayıt defteri okunamadı: sessiz geç, sonraki turda tekrar */
    } finally {
      this.busy = false;
    }
  }

  snapshot(): CallSnapshot {
    const d = this.data;
    return {
      prompt: d.status === 'pending',
      status: d.status,
      app: d.app,
      since: d.since ? new Date(d.since).toISOString() : null,
      planned: Boolean(this.event),
      event: this.event ? { external_id: this.event.external_id, subject: this.event.subject ?? this.event.summary.slice(0, 80), occurred_at: this.event.occurred_at } : null,
      screenshot: config.meetings.callScreenshot,
      ringing: Boolean(this.ring && !this.ring.answered && this.data.id?.startsWith('ring:')),
      nativePopup: this.popup !== null,
      error: this.joinError,
      identity: { status: this.identity.status, callers: this.identity.callers, title: this.identity.title, confidence: this.identity.confidence, note: this.identity.note },
    };
  }
  /** "Katıl" anında: arama penceresinin görüntüsünü alıp Claude'a okutur (arka planda; görüntü saklanmaz). */
  startIdentify() {
    if (this.identityJob || !config.meetings.callScreenshot) return;
    this.identity = { ...NO_IDENTITY, status: 'running', at: Date.now() };
    this.identityJob = identifyCaller()
      .then((id) => {
        this.identity = id;
      })
      .catch((e: Error) => {
        this.identity = { ...NO_IDENTITY, status: 'error', note: e.message.slice(0, 160), at: Date.now() };
      })
      .then(() => this.applyToMeeting())
      .catch(() => {})
      .finally(() => {
        this.identityJob = null;
      });
  }

  /** Dinleme başlayan toplantıya bağla: arayan adı katılımcı olur, plansız aramanın başlığı güncellenir. */
  attach(meetingId: string) {
    this.attachId = meetingId;
    if (this.identity.status === 'ok' && Date.now() - this.identity.at < 5 * 60_000) void this.applyToMeeting().catch(() => {});
  }

  private async applyToMeeting() {
    const id = this.attachId;
    if (!id || this.identity.status !== 'ok') return;
    const store = getStore();
    const m = await store.getMeeting(id);
    if (!m) return;
    const attendees = [...m.attendees];
    for (const c of this.identity.callers) if (!attendees.some((a) => sameName(a, c))) attendees.push(c);
    const patch: Partial<typeof m> = { attendees };
    if (/^Plansız arama/.test(m.title)) {
      const hhmm = new Date(m.started_at ?? m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });
      patch.title = `Arama · ${this.identity.callers.join(', ') || this.identity.title || 'plansız'} · ${hhmm}`.slice(0, 150);
    }
    await store.updateMeeting(id, patch);
  }

  /** Windows popup'ını gösterir (her arama için bir kez); karar gelince Katıl/Şimdi değil uygulanır. */
  private maybeShowPopup(ringing = false) {
    const d = this.data;
    if (!config.meetings.callPopup || !nativeAvailable() || !d.id || d.status !== 'pending' || this.popupFor === d.id) return;
    this.popupFor = d.id;
    const idAtShow = d.id;
    const text = popupText({ app: d.app, planned: Boolean(this.event), eventSubject: this.event ? (this.event.subject ?? this.event.summary) : null, screenshot: config.meetings.callScreenshot, ringing });
    const handle = showCallPopup(text);
    this.popup = handle;
    void handle.result.then(async (r) => {
      if (this.popup === handle) this.popup = null;
      if (this.data.id !== idAtShow || this.data.status !== 'pending') return;
      if (r === 'decline') this.decline();
      else if (r === 'join') await this.joinNative();
    });
  }

  /** Popup'tan "Katıl": önce arayanı oku (Teams hâlâ en üstte), sonra yerel dinlemeyi başlat. Tarayıcı gerekmez. */
  async joinNative() {
    // Çalarken katılındıysa arayanı cevaptan sonra (arama penceresi açılınca) oku; cevaplanmışsa hemen
    const ringing = Boolean(this.ring && !this.ring.answered);
    if (ringing) this.identifyOnAnswer = true;
    else this.startIdentify();
    const d = this.data;
    const hhmm = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });
    const title = this.event ? (this.event.subject ?? this.event.summary.slice(0, 80)) : `Plansız arama · ${d.app ?? 'arama'} · ${hhmm}`;
    try {
      const { meeting } = await startLiveMeeting({ title, event: this.event?.external_id ?? null, native: true, fromCall: true, requireNative: true });
      this.joinError = null;
      if (ringing && !this.ring?.answered) this.ringMeetingId = meeting.id; // cevaplanmazsa atılır
      this.joined();
      this.attach(meeting.id);
    } catch (e) {
      this.joinError = (e as Error).message.slice(0, 200);
    }
  }

  /** "Şimdi değil": bu arama için bir daha sorma */
  decline() {
    this.popup?.close();
    if (this.data.id) this.data = { ...this.data, status: 'declined' };
  }
  /** Kullanıcı katıldı (dinleme başladı) */
  joined() {
    this.popup?.close();
    if (this.data.id) this.data = { ...this.data, status: 'joined' };
  }
}

export const callWatcher = new CallWatcher();
