/**
 * Çalan aramayı yakalamak için DENEYSEL sinyal: Teams/Zoom vb. uygulamaların pencereleri izlenir ve yeni açılan/kapanan
 * pencereler data/callwatch.log dosyasına yazılır. Henüz hiçbir şeyi TETİKLEMEZ: çalarken Teams'in nasıl bir pencere
 * açtığını (başlık/sınıf) bilmiyoruz; gerçek bir aramada günlüğe bakıp kural yazılacak.
 * Pencere başlığı sohbet/kanal adı içerebilir; günlük yalnızca bu bilgisayarda kalır ve 1 MB'ı geçince sıfırlanır.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, DATA_DIR, ROOT } from '../config.js';

export const RING_LOG = join(DATA_DIR, 'callwatch.log');
let child: ChildProcess | null = null;

export function startRingLog() {
  if (child || process.platform !== 'win32' || !config.meetings.callWatch) return;
  const script = join(ROOT, 'scripts', 'windows', 'pencere-izle.ps1');
  if (!existsSync(script)) return;
  const pattern = config.meetings.callApps.map((a) => a.replace(/[^a-z0-9]/gi, '')).filter(Boolean).join('|') || 'teams';
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Pattern', pattern.replace('msteams', 'teams')], { windowsHide: true });
  } catch {
    return;
  }
  let buf = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        if (existsSync(RING_LOG) && statSync(RING_LOG).size > 1_000_000) writeFileSync(RING_LOG, '');
        appendFileSync(RING_LOG, `${new Date().toISOString()} ${line}\n`);
      } catch {
        /* günlük yazılamadı: önemli değil */
      }
    }
  });
  child.on('exit', () => (child = null));
  child.on('error', () => (child = null));
  // Sunucu kapanırken izleyici de kapansın
  process.once('exit', () => child?.kill());
}

export function stopRingLog() {
  child?.kill();
  child = null;
}
