/**
 * Yerel ses yakalama (ekran paylaşımı/izin penceresi YOK): scripts/windows/ses-yakala.ps1 mikrofonunuzu ve hoparlör/kulaklık
 * çıkışını (WASAPI loopback) doğrudan Windows'tan alır. "Katıl" denince başlar; arama bitince ya da "Bitir" denince durur,
 * ham dosyalar ffmpeg ile tek bir stereo wav'a (sol = mikrofon, sağ = karşı taraf) birleşir ve transkript hattına girer.
 * Hiçbir şey indirilmez ya da dışarı gönderilmez; ses yalnızca data/meetings/<id>/ içinde kalır (30 gün sonra silinir).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from '../config.js';
import { getStore } from '../store/index.js';
import type { Meeting } from '../store/types.js';
import { meetingDir, processMeeting } from './pipeline.js';
import { meetingTools, run } from './tools.js';

export interface NativeInfo {
  meetingId: string;
  startedAt: number;
  micOk: boolean;
  sysOk: number;
  devices: { kind: 'mikrofon' | 'cikis'; name: string }[];
  /** Kullanıcıya gösterilecek uyarı (ör. mikrofon açılamadı) */
  error: string | null;
  fromCall: boolean;
  /** Yüz yüze toplantı: yalnızca mikrofon, hoparlör yakalanmaz */
  inPerson: boolean;
  stopping: boolean;
}

/** Yardımcı programın satırını ayrıştırır (saf): durum bilgisini günceller, READY/DONE olaylarını döner. */
export function parseHelperLine(line: string, info: NativeInfo): 'ready' | 'done' | null {
  const [kind, a, ...rest] = line.trim().split('|');
  const msg = rest.join('|');
  if (kind === 'READY') return 'ready';
  if (kind === 'DONE') return 'done';
  if (kind === 'DEV' && (a === 'mikrofon' || a === 'cikis')) info.devices.push({ kind: a, name: msg });
  else if (kind === 'OK') {
    if (a === 'mic' || a?.startsWith('mic-')) info.micOk = true;
    else if (a?.startsWith('sys-')) info.sysOk++;
  } else if (kind === 'ERR') {
    if (a === 'mic' || a?.startsWith('mic-')) {
      // mic-N: birden çok mikrofon kaydedilir; biri açılamasa da diğeri açıksa sorun yok
      if (a === 'mic') info.micOk = false;
      if (a === 'mic' || !info.micOk) info.error = `Mikrofon açılamadı (${msg.slice(0, 80)}). Windows → Gizlilik → Mikrofon: masaüstü uygulamalarına izin verin.`;
    } else if (!info.error) info.error = `Ses çıkışı yakalanamadı (${a}: ${msg.slice(0, 80)}).`;
  }
  return null;
}

/** Saf: ham dosyaları (mikrofon + karşı taraf) tek stereo wav'a birleştiren ffmpeg argümanları. */
export function mergeArgs(files: { mic: string | null; sys: string[] }, out: string): string[] | null {
  const inputs = [...(files.mic ? [files.mic] : []), ...files.sys];
  if (!inputs.length) return null;
  const args = ['-y', '-loglevel', 'error'];
  for (const f of inputs) args.push('-f', 's16le', '-ar', '16000', '-ac', '1', '-i', f);
  const off = files.mic ? 1 : 0;
  const n = files.sys.length;
  const filters: string[] = [];
  let sysLabel: string | null = null;
  if (n > 1) {
    filters.push(`${files.sys.map((_, i) => `[${off + i}:a]`).join('')}amix=inputs=${n}:normalize=0[s]`);
    sysLabel = '[s]';
  } else if (n === 1) sysLabel = `[${off}:a]`;
  let map: string;
  if (files.mic && sysLabel) {
    filters.push(`[0:a]${sysLabel}amerge=inputs=2[a]`);
    map = '[a]';
  } else if (files.mic) map = '0:a';
  else map = sysLabel!.startsWith('[s') ? '[s]' : `${sysLabel}`.replace(/\[|\]/g, '');
  if (filters.length) args.push('-filter_complex', filters.join(';'));
  args.push('-map', map, '-c:a', 'pcm_s16le', '-ar', '16000', out);
  return args;
}

interface Cap {
  child: ChildProcess;
  info: NativeInfo;
  exited: Promise<void>;
  done: Promise<Meeting | null> | null;
}
const caps = new Map<string, Cap>();

export const nativeAvailable = () => process.platform === 'win32' && config.meetings.nativeCapture && existsSync(join(ROOT, 'scripts', 'windows', 'ses-yakala.ps1'));
export const nativeActive = (id: string) => caps.has(id);
export function nativeStatus(): NativeInfo | null {
  for (const c of caps.values()) return c.info;
  return null;
}

/** Yakalamayı başlatır; program hazır olana kadar bekler (en çok 25 sn). Başarısızsa hata fırlatır. */
export async function startNative(meetingId: string, opts: { fromCall?: boolean; inPerson?: boolean } = {}): Promise<NativeInfo> {
  if (!nativeAvailable()) throw new Error('Yerel ses yakalama bu bilgisayarda kullanılamıyor.');
  if (caps.size) throw new Error('Zaten bir canlı dinleme sürüyor.');
  const t = meetingTools();
  if (!t.ffmpeg) throw new Error('ffmpeg bulunamadı (GUNES_WHISPER_DIR).');
  const dir = meetingDir(meetingId);
  const script = join(ROOT, 'scripts', 'windows', 'ses-yakala.ps1');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Out', dir];
  if (config.meetings.micDevice) args.push('-Mic', config.meetings.micDevice);
  if (opts.inPerson) args.push('-NoSys');
  const child = spawn('powershell.exe', args, { windowsHide: true });
  const info: NativeInfo = { meetingId, startedAt: Date.now(), micOk: false, sysOk: 0, devices: [], error: null, fromCall: Boolean(opts.fromCall), inPerson: Boolean(opts.inPerson), stopping: false };
  let ready!: (v: 'ready' | 'closed') => void;
  const readyP = new Promise<'ready' | 'closed'>((r) => (ready = r));
  let buf = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const ev = parseHelperLine(buf.slice(0, i), info);
      buf = buf.slice(i + 1);
      if (ev === 'ready') ready('ready');
    }
  });
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-500)));
  const exited = new Promise<void>((r) =>
    child.on('close', () => {
      ready('closed');
      r();
    }),
  );
  child.on('error', () => ready('closed'));
  const cap: Cap = { child, info, exited, done: null };
  caps.set(meetingId, cap);
  const first = await Promise.race([readyP, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 25_000))]);
  if (first !== 'ready') {
    child.kill();
    caps.delete(meetingId);
    throw new Error(`Ses yakalama başlamadı${stderr ? ` (${stderr.trim().slice(-160)})` : ''}. Şirket güvenlik yazılımı engelliyor olabilir.`);
  }
  // READY, cihazlar açılmadan önce yazılır: mikrofon/çıkış "OK" satırlarının gelmesini kısa süre bekle (en çok 5 sn)
  for (let i = 0; i < 50 && !info.micOk && !info.sysOk; i++) await new Promise((r) => setTimeout(r, 100));
  if (!info.micOk && !info.sysOk) {
    child.kill();
    caps.delete(meetingId);
    throw new Error(info.error ?? 'Ne mikrofon ne de hoparlör çıkışı yakalanabildi.');
  }
  // Beklenmedik kapanma (ör. 4 saat sınırı, program çöktü): eldeki sesle devam et
  void exited.then(() => {
    const c = caps.get(meetingId);
    if (c && !c.info.stopping) void finishNative(meetingId).catch(() => {});
  });
  // Güneş sunucusu kapanırsa yardımcı da kapanır (stdin kapanınca kendiliğinden durur)
  return info;
}

/** Konuşma seviyesi: 0,5 sn pencerelerin RMS'inin en yüksek %30'unun ortalaması (sessizlik/gürültü tabanı sayılmaz). */
export function speechLevel(file: string): number {
  const win = 8000 * 2; // 0,5 sn, 16 bit
  const buf = Buffer.alloc(win * 40);
  const levels: number[] = [];
  const fd = openSync(file, 'r');
  try {
    let n: number;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let off = 0; off + win <= n; off += win) {
        let s = 0;
        for (let i = off; i < off + win; i += 2) {
          const v = buf.readInt16LE(i);
          s += v * v;
        }
        levels.push(Math.sqrt(s / (win / 2)) / 32768);
      }
    }
  } finally {
    closeSync(fd);
  }
  if (!levels.length) return 0;
  levels.sort((a, b) => b - a);
  const top = levels.slice(0, Math.max(1, Math.ceil(levels.length * 0.3)));
  return top.reduce((s, x) => s + x, 0) / top.length;
}

/** Saf: aday mikrofonlardan sizinkini seçer (en yüksek konuşma seviyesi); hepsi sessizse null. */
export function pickMic(cands: { file: string; level: number }[]): string | null {
  const best = [...cands].sort((a, b) => b.level - a.level)[0];
  return best && best.level > 0.003 ? best.file : null;
}

const rawFiles = (dir: string) => {
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const ok = (n: string) => statSync(join(dir, n)).size > 32000; // en az 1 sn
  const mics = names.filter((n) => /^mic(-\d+)?\.raw$/.test(n) && ok(n)).map((n) => join(dir, n));
  return {
    mics,
    mic: mics[0] ?? null,
    sys: names.filter((n) => /^sys-\d+\.raw$/.test(n) && ok(n)).map((n) => join(dir, n)),
    all: names.filter((n) => /^(mic(-\d+)?|sys-\d+)\.raw$/.test(n)).map((n) => join(dir, n)),
  };
};

/** Ham dosyaları birleştirip transkript hattına verir (yakalama durmuş olmalı). */
export async function mergeAndQueue(meetingId: string): Promise<Meeting | null> {
  const store = getStore();
  const dir = meetingDir(meetingId);
  const f = rawFiles(dir);
  const out = join(dir, 'capture.wav');
  const t = meetingTools();
  // Birden çok mikrofon kaydedildiyse (kulaklık / sistem mikrofonu) en yüksek konuşma seviyeli olan sizinkidir
  const mic = f.mics.length > 1 ? (pickMic(f.mics.map((file) => ({ file, level: speechLevel(file) }))) ?? f.mics[0]!) : f.mic;
  const args = mergeArgs({ mic, sys: f.sys }, out);
  if (!args || !t.ffmpeg) {
    await store.updateMeeting(meetingId, { status: 'error', error: 'Kayıtta ses yok: ne mikrofon ne hoparlör sesi yakalandı.', step: '' });
    return store.getMeeting(meetingId);
  }
  const r = await run(t.ffmpeg, args);
  if (r.code !== 0 || !existsSync(out)) {
    await store.updateMeeting(meetingId, { status: 'error', error: `Sesler birleştirilemedi: ${r.stderr.slice(-200)}`, step: '' });
    return store.getMeeting(meetingId);
  }
  for (const p of f.all) rmSync(p, { force: true }); // ham kopyalar gereksiz (birleşik dosya kalır)
  await store.updateMeeting(meetingId, { audio_file: out, status: 'queued', step: 'Sırada', error: null });
  void processMeeting(meetingId);
  return store.getMeeting(meetingId);
}

/** Dinlemeyi bitirir: yakalamayı durdurur, birleştirir, işlemeye alır. Aynı çağrı tekrarlanırsa aynı sonucu döner. */
export function finishNative(meetingId: string): Promise<Meeting | null> {
  const cap = caps.get(meetingId);
  if (!cap) return mergeAndQueue(meetingId);
  if (cap.done) return cap.done;
  cap.info.stopping = true;
  cap.done = (async () => {
    try {
      cap.child.stdin?.write('q\n');
      cap.child.stdin?.end();
    } catch {
      /* süreç zaten kapanmış */
    }
    const t = await Promise.race([cap.exited.then(() => 'ok'), new Promise<string>((r) => setTimeout(() => r('timeout'), 15_000))]);
    if (t === 'timeout') cap.child.kill();
    await cap.exited;
    caps.delete(meetingId);
    return mergeAndQueue(meetingId);
  })();
  return cap.done;
}

/** Kaydı atar (silme/iptal): yakalamayı durdurur, işleme almaz. */
export async function abortNative(meetingId: string) {
  const cap = caps.get(meetingId);
  if (!cap) return;
  cap.info.stopping = true;
  cap.child.kill();
  await cap.exited;
  caps.delete(meetingId);
}

/** Sunucu açılırken: 'recording' kalmış toplantılar (sunucu kapanmıştı). Ham ses varsa birleştirip işler, yoksa hataya çevirir. */
export async function recoverRecordings() {
  const store = getStore();
  try {
    for (const m of await store.listMeetings(200)) {
      if (m.status !== 'recording' || m.source !== 'live' || caps.has(m.id)) continue;
      const f = rawFiles(meetingDir(m.id));
      if (f.mic || f.sys.length) await mergeAndQueue(m.id);
      else if (!m.audio_file || !existsSync(m.audio_file)) await store.updateMeeting(m.id, { status: 'error', error: 'Güneş yeniden başladığı için dinleme yarıda kaldı, ses bulunamadı.', step: '' });
    }
  } catch {
    /* tablo yoksa sessiz geç */
  }
}

process.once('exit', () => {
  for (const c of caps.values()) c.child.kill();
});
