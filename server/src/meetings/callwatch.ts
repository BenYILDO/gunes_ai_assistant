/**
 * Arama algılama: Windows her uygulamanın mikrofon kullanımını kayıt defterinde tutar
 * (HKCU\...\CapabilityAccessManager\ConsentStore\microphone\<uygulama>: LastUsedTimeStart / LastUsedTimeStop;
 * Stop = 0 ise mikrofon ŞU AN kullanımda). Teams, Zoom vb. bir aramaya girince mikrofonu açar → Güneş fark eder
 * ve kullanıcıya "katılmamı ister misiniz?" diye sorar. Kullanıcı onaylamadan hiçbir şey kaydedilmez.
 * Takvimde o saatte toplantı varsa onunla eşleştirilir; yoksa "plansız arama" sayılır.
 *
 * Sınır: mikrofon arama CEVAPLANINCA (ya da başlatılınca) açılır; çalma anı bu yöntemle görülmez.
 * Çalma anı için ikinci bir sinyal denenir (bkz. ringlog.ts: Teams pencereleri günlüğe yazılır, henüz tetiklemez).
 */
import type { EventItem } from '../store/types.js';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { run } from './tools.js';
import { finishNative, nativeStatus } from './capture.js';
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
  const debounce = o.debounceMs ?? 4000;
  const grace = o.graceMs ?? 20000;
  if (obs) {
    if (prev.id !== obs.sid) return { id: obs.sid, app: obs.app, since: now, lastSeen: now, status: 'detecting' };
    const status = prev.status === 'detecting' && now - (prev.since ?? now) >= debounce ? 'pending' : prev.status;
    return { ...prev, lastSeen: now, status };
  }
  if (prev.id && now - prev.lastSeen >= grace) return { ...IDLE };
  return prev;
}

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
  private attachId: string | null = null;

  start() {
    if (this.timer || process.platform !== 'win32' || !config.meetings.callWatch) return;
    this.timer = setInterval(() => void this.tick(), 4000);
    void this.tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const entries = await readMicEntries();
      if (!entries) return;
      const active = activeCallApps(entries, config.meetings.callApps)[0] ?? null;
      const before = this.data;
      this.data = stepCall(this.data, active ? { sid: active.sid, app: active.label } : null, Date.now());
      // Arama bitti (mikrofon kapandı): Güneş'in o arama için başlattığı yerel dinleme kendiliğinden biter ve işlenir
      if (before.id && !this.data.id) {
        const st = nativeStatus();
        if (st?.fromCall && !st.stopping) void finishNative(st.meetingId).catch(() => {});
      }
      if (this.data.id !== before.id) {
        this.event = null;
        this.identity = NO_IDENTITY;
        this.attachId = null;
      }
      if (this.data.status === 'pending' && before.status !== 'pending') {
        // Güneş zaten bu toplantıyı dinliyorsa (kullanıcı elle başlattı) sorma
        const meetings = await getStore().listMeetings(5).catch(() => []);
        if (meetings.some((m) => m.status === 'recording')) this.data = { ...this.data, status: 'joined' };
        else this.event = matchEvent(await getStore().listEvents({ sinceDays: 2, limit: 3000 }).catch(() => []), Date.now());
      }
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

  /** "Şimdi değil": bu arama için bir daha sorma */
  decline() {
    if (this.data.id) this.data = { ...this.data, status: 'declined' };
  }
  /** Kullanıcı katıldı (dinleme başladı) */
  joined() {
    if (this.data.id) this.data = { ...this.data, status: 'joined' };
  }
}

export const callWatcher = new CallWatcher();
