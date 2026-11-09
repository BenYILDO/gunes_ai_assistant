/**
 * Kendi sesiniz: yerel yakalama stereo kaydeder (SOL = mikrofonunuz, SAĞ = karşı taraf/hoparlör). Hangi satırı kimin söylediğini
 * ses profiline bakmadan kanal enerjisinden anlarız: mikrofon kanalı baskınsa siz konuşuyorsunuz. Böylece kendi sesinizi
 * işaretlemeniz gerekmez ve kendi ses profiliniz her toplantıda kendiliğinden güçlenir.
 * Sınır: hoparlörle konuşuyorsanız karşı tarafın sesi mikrofona sızar; oran eşiği bunu ayırır, belirsiz kalanlar ses profiline bırakılır.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './tools.js';
import { sameName } from './voices.js';

export type ChannelClass = 'user' | 'remote' | 'both' | 'silent';

export const RATE = 16000;
/** Bu seviyenin altı "konuşma yok" sayılır (16 bit tam ölçeğe göre RMS) */
export const MIN_ACTIVE = 0.006;
export const USER_RATIO = 1.25; // mikrofon / karşı taraf: üstü = siz
export const REMOTE_RATIO = 0.8; // altı = karşı taraf

export function rms(x: Int16Array | number[], from = 0, to = x.length) {
  let s = 0;
  const n = Math.max(0, to - from);
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return n ? Math.sqrt(s / n) / 32768 : 0;
}

/** Gürültü tabanı: 0,5 sn'lik pencerelerin en sessiz %20'sinin medyanı */
export function noiseFloor(x: Int16Array) {
  const w = RATE / 2;
  const vals: number[] = [];
  for (let i = 0; i + w <= x.length; i += w) vals.push(rms(x, i, i + w));
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  const low = vals.slice(0, Math.max(1, Math.floor(vals.length * 0.2)));
  return low[Math.floor(low.length / 2)]!;
}

/** Saf: bir satırın mikrofon (l) ve karşı taraf (r) seviyesinden kimin konuştuğu */
export function classifyLevels(l: number, r: number, floorL = 0, floorR = 0): ChannelClass {
  const actL = l > Math.max(MIN_ACTIVE, floorL * 3);
  const actR = r > Math.max(MIN_ACTIVE, floorR * 3);
  if (!actL && !actR) return 'silent';
  if (actL && !actR) return 'user';
  if (!actL && actR) return 'remote';
  const ratio = l / Math.max(r, 1e-6);
  return ratio >= USER_RATIO ? 'user' : ratio <= REMOTE_RATIO ? 'remote' : 'both';
}

/** Kendi satırlarınızın etiketi: toplantı katılımcısı ya da ses profili olarak tam adınız varsa o, yoksa ayardaki ad */
export function ownLabel(userName: string, attendees: string[], profileNames: string[]) {
  if (!userName) return null;
  const hit = [...profileNames, ...attendees].find((n) => sameName(n, userName) && n.trim().split(/\s+/).length >= userName.trim().split(/\s+/).length);
  return hit ?? userName;
}

export interface CueChannel {
  cls: ChannelClass;
  /** Karşı taraf kanalı sessizken mikrofon etkin: kendi ses profilinizi güvenle besler */
  strictUser: boolean;
  l: number;
  r: number;
}

function readMono(file: string): Int16Array {
  const b = readFileSync(file);
  const n = Math.floor((b.length - 44) / 2); // ffmpeg wav başlığı 44 bayt
  const out = new Int16Array(Math.max(0, n));
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(44 + i * 2);
  return out;
}

/** Stereo yakalama dosyasında (sol mikrofon, sağ karşı taraf) her satırı sınıflar; stereo değilse/okunamazsa null. */
export async function classifyCuesByChannel(ffmpeg: string, capture: string, dir: string, cues: { b: number; e: number }[]): Promise<CueChannel[] | null> {
  const mic = join(dir, 'kanal-mic.wav');
  const sys = join(dir, 'kanal-sys.wav');
  try {
    const r = await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', capture, '-filter_complex', '[0:a]channelsplit=channel_layout=stereo[L][R]', '-map', '[L]', '-ar', String(RATE), '-c:a', 'pcm_s16le', mic, '-map', '[R]', '-ar', String(RATE), '-c:a', 'pcm_s16le', sys]);
    if (r.code !== 0) return null; // tek kanallı dosya: kanal bilgisi yok
    const L = readMono(mic);
    const R = readMono(sys);
    const fl = noiseFloor(L);
    const fr = noiseFloor(R);
    return cues.map((c) => {
      const a = Math.max(0, Math.floor(c.b * RATE));
      const b = Math.min(L.length, Math.ceil(c.e * RATE));
      const l = rms(L, a, b);
      const rr = rms(R, a, Math.min(R.length, b));
      const cls = classifyLevels(l, rr, fl, fr);
      return { cls, strictUser: cls === 'user' && !(rr > Math.max(MIN_ACTIVE, fr * 3)), l, r: rr };
    });
  } catch {
    return null;
  } finally {
    rmSync(mic, { force: true });
    rmSync(sys, { force: true });
  }
}
