/**
 * Arama algılanınca Windows'ta kendi başına çıkan küçük pencere ("Bu aramaya katılmamı ister misiniz?").
 * Güneş penceresi kapalı/arkada olsa da görünür, Teams'ten odağı ALMAZ (scripts/windows/arama-penceresi.ps1).
 * Fare tıklaması, imleç düğmenin üzerinde hareket ettikten sonra sayılır (yanlışlıkla "Katıl" olmasın).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

export interface PopupText {
  title: string;
  body: string;
  note: string;
  join: string;
  decline: string;
}
export type PopupResult = 'join' | 'decline' | 'timeout' | 'closed' | 'error';

const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Saf: pencere metni (tarayıcıdaki popup ile aynı dil). */
export function popupText(o: { app: string | null; planned: boolean; eventSubject: string | null; screenshot: boolean }): PopupText {
  const who = o.app ? `${clip(o.app, 30)} mikrofonu açtı. ` : '';
  const cal = o.planned && o.eventSubject ? `Takvimde bu saatte ${clip(o.eventSubject, 80)} var.` : 'Takvimde görünmüyor, plansız bir arama gibi.';
  return {
    title: 'Bir arama fark ettim',
    body: `${who}${cal} Bu aramaya katılmamı ister misiniz?`,
    note: `Katıl derseniz sesi (mikrofonunuz + karşı taraf) dinleyip yazıya çeviririm; ${
      o.screenshot ? 'arayanı görmek için arama penceresinin görüntüsünü Claude’a okuturum (saklanmaz). ' : ''
    }Ekran paylaşımı gerekmez. Ses 30 gün sonra silinir.`,
    join: 'Katıl',
    decline: 'Şimdi değil',
  };
}

/** Saf: yardımcı programın tek satırlık kararını ayrıştırır. */
export function parsePopupLine(line: string): 'join' | 'decline' | 'timeout' | null {
  const t = line.trim();
  return t === 'JOIN' ? 'join' : t === 'DECLINE' ? 'decline' : t === 'TIMEOUT' ? 'timeout' : null;
}

export function popupAvailable() {
  return process.platform === 'win32' && existsSync(join(ROOT, 'scripts', 'windows', 'arama-penceresi.ps1'));
}

export interface PopupHandle {
  result: Promise<PopupResult>;
  /** Pencereyi kapatır (karar başka yerden verildi ya da arama bitti) */
  close(): void;
}

export function showCallPopup(text: PopupText, timeoutSec = 120): PopupHandle {
  const json = Buffer.from(JSON.stringify(text), 'utf8').toString('base64');
  const script = join(ROOT, 'scripts', 'windows', 'arama-penceresi.ps1');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script, '-Json', json, '-TimeoutSec', String(timeoutSec)], { windowsHide: false });
  let decision: PopupResult | null = null;
  let closing = false;
  let buf = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const r = parsePopupLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (r && !decision) decision = r;
    }
  });
  const result = new Promise<PopupResult>((resolve) => {
    child.on('error', () => resolve('error'));
    child.on('close', () => resolve(decision ?? (closing ? 'closed' : 'error')));
  });
  process.once('exit', () => child.kill());
  return {
    result,
    close: () => {
      closing = true;
      child.kill();
    },
  };
}
