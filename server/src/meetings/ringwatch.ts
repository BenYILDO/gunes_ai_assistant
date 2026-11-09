/**
 * Çalan aramayı yakalama: Teams bir arama GELİRKEN kısa süre (≈8 sn) başlığı yalnızca "Microsoft Teams" olan küçük bir
 * bildirim penceresi açar; arama cevaplanınca bu pencere kapanıp "Arayan | Microsoft Teams" penceresi açılır
 * (gerçek bir test aramasının günlüğünden: 14:55:17 bildirim açıldı, 14:55:25 cevaplandı, mikrofon 14:55:23'te açıldı).
 * scripts/windows/pencere-izle.ps1 pencere olaylarını yazar; burada ayrıştırılır, bildirim penceresi "ring" olayı olur
 * ve Güneş cevaplanmadan ÖNCE "katılmamı ister misiniz?" diye sorabilir. Tüm olaylar data/callwatch.log'a da yazılır (ayar için).
 * Pencere başlıkları sohbet/kişi adı içerebilir; günlük yalnızca bu bilgisayarda kalır ve 1 MB'ı geçince sıfırlanır.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, DATA_DIR, ROOT } from '../config.js';
import { procPattern } from './callid.js';

export const RING_LOG = join(DATA_DIR, 'callwatch.log');

export interface WinEvent {
  kind: 'BASE' | 'ADD' | 'DEL';
  proc: string;
  pid: number;
  hwnd: string;
  w: number;
  h: number;
  cls: string;
  title: string;
}
export type WinLine = ({ type: 'win' } & WinEvent) | { type: 'txt'; hwnd: string; texts: string[] };

/** pencere-izle.ps1 satırını ayrıştırır (başlık '|' içerebilir). */
export function parseWinLine(line: string): WinLine | null {
  const t = line.replace(/\r$/, '');
  const head = t.split('|', 1)[0];
  if (head === 'TXT') {
    const [, hwnd, b64] = t.split('|');
    if (!hwnd || !b64) return null;
    try {
      const arr = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as unknown;
      return { type: 'txt', hwnd, texts: Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [] };
    } catch {
      return null;
    }
  }
  if (head !== 'BASE' && head !== 'ADD' && head !== 'DEL') return null;
  const p = t.split('|');
  if (p.length < 7) return null;
  const size = /^(\d+)x(\d+)$/.exec(p[4]!);
  if (!size) return null;
  return { type: 'win', kind: head, proc: p[1]!, pid: Number(p[2]), hwnd: p[3]!, w: Number(size[1]), h: Number(size[2]), cls: p[5]!, title: p.slice(6).join('|') };
}

/** Teams'in gelen arama bildirimi: başlığı tam olarak "Microsoft Teams" olan küçük pencere (gerçek günlükten). */
export function isToast(e: Pick<WinEvent, 'proc' | 'title' | 'w' | 'h'>, procRe: RegExp = /teams/i) {
  // alt sınır: küçültülmüş (iconic) pencereler de küçük (≈199x34) görünür; gerçek bildirim ≈372x88
  return procRe.test(e.proc) && e.title.trim() === 'Microsoft Teams' && e.w >= 250 && e.w <= 620 && e.h >= 60 && e.h <= 260;
}

const CALL_WORDS = /(arıyor|aranıyor|aramasi|gelen arama|calling|incoming|ringing|kabul|cevapla|yanıtla|accept|answer|reddet|decline)/i;
/** Bildirimin gösterdiği metinlerde arama sözcükleri var mı? (Sohbet bildirimi değil, arama olduğunu doğrulamak için) */
export function hasCallWords(texts: string[]) {
  return texts.some((t) => CALL_WORDS.test(t));
}

export type RingEvent = { type: 'toast'; hwnd: string } | { type: 'texts'; hwnd: string; texts: string[] } | { type: 'toast-gone'; hwnd: string };
export const ringEvents = new EventEmitter();

let child: ChildProcess | null = null;
function log(line: string) {
  try {
    if (existsSync(RING_LOG) && statSync(RING_LOG).size > 1_000_000) writeFileSync(RING_LOG, '');
    appendFileSync(RING_LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* günlük yazılamadı: önemli değil */
  }
}

export function startRingWatch() {
  if (child || process.platform !== 'win32' || !config.meetings.callWatch) return;
  const script = join(ROOT, 'scripts', 'windows', 'pencere-izle.ps1');
  if (!existsSync(script)) return;
  const pattern = procPattern();
  const procRe = new RegExp(pattern, 'i');
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Pattern', pattern], { windowsHide: true });
  } catch {
    return;
  }
  const toasts = new Set<string>();
  let buf = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const p = parseWinLine(line);
      // TXT satırları günlükte okunabilir yazılır (ayar için), diğerleri olduğu gibi
      log(p?.type === 'txt' ? `TXT|${p.hwnd}|${JSON.stringify(p.texts).slice(0, 400)}` : line.replace(/\r$/, ''));
      if (!p) continue;
      if (p.type === 'txt') {
        if (toasts.has(p.hwnd)) ringEvents.emit('ring', { type: 'texts', hwnd: p.hwnd, texts: p.texts } satisfies RingEvent);
        continue;
      }
      if (!isToast(p, procRe)) continue;
      if (p.kind === 'ADD') {
        toasts.add(p.hwnd);
        ringEvents.emit('ring', { type: 'toast', hwnd: p.hwnd } satisfies RingEvent);
      } else if (p.kind === 'DEL') {
        toasts.delete(p.hwnd);
        ringEvents.emit('ring', { type: 'toast-gone', hwnd: p.hwnd } satisfies RingEvent);
      }
    }
  });
  child.on('exit', () => (child = null));
  child.on('error', () => (child = null));
  process.once('exit', () => child?.kill());
}

export function stopRingWatch() {
  child?.kill();
  child = null;
}
