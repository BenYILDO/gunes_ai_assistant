/**
 * Toplantı hattının dış araçları: whisper-cli, ffmpeg, sherpa-onnx (embedding) ve Python.
 * Hepsi bu bilgisayarda çalışır; hiçbir ses dosyası dışarı gönderilmez.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from '../config.js';

const cache = new Map<string, string | null>();

/** Klasörde (alt klasörler dahil) ada göre dosya arar; sonuç önbelleğe alınır. */
export function findFile(root: string, name: string, depth = 6): string | null {
  const key = `${root}|${name}`;
  if (cache.has(key)) return cache.get(key)!;
  const hit = walk(root, name.toLowerCase(), depth);
  if (hit) cache.set(key, hit); // bulunamayanı önbelleğe alma: dosya sonradan eklenebilir
  return hit;
}
function walk(dir: string, name: string, depth: number): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const e of entries) if (e.toLowerCase() === name) return join(dir, e);
  for (const e of entries) {
    const p = join(dir, e);
    try {
      if (statSync(p).isDirectory()) {
        const r = walk(p, name, depth - 1);
        if (r) return r;
      }
    } catch {
      /* erişilemeyen klasör */
    }
  }
  return null;
}

export interface MeetingTools {
  whisper: string | null;
  ffmpeg: string | null;
  sherpaDll: string | null;
  whisperModel: string | null;
  vadModel: string | null;
  embeddingModel: string | null;
  python: string | null;
  script: string;
  /** Eksik olanların insan okur açıklaması; boşsa hat çalışabilir */
  missing: string[];
}

export function meetingTools(): MeetingTools {
  const m = config.meetings;
  const t: MeetingTools = {
    whisper: findFile(m.toolsDir, 'whisper-cli.exe'),
    ffmpeg: findFile(m.toolsDir, 'ffmpeg.exe'),
    sherpaDll: findFile(m.toolsDir, 'sherpa-onnx-c-api.dll'),
    whisperModel: findFile(m.toolsDir, m.whisperModel),
    vadModel: findFile(m.toolsDir, m.vadModel),
    embeddingModel: findFile(m.toolsDir, m.embeddingModel),
    python: null,
    script: join(ROOT, 'scripts', 'whisper', 'konusmaci.py'),
    missing: [],
  };
  const py = spawnSync(m.python, ['-I', '-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8', timeout: 8000 });
  if (py.status === 0 && py.stdout.trim() === '3') t.python = m.python;
  const need: [string, unknown][] = [
    [`whisper-cli.exe (${m.toolsDir} altında)`, t.whisper],
    [`ffmpeg.exe (${m.toolsDir} altında)`, t.ffmpeg],
    ['sherpa-onnx-c-api.dll', t.sherpaDll],
    [m.whisperModel, t.whisperModel],
    [m.vadModel, t.vadModel],
    [m.embeddingModel, t.embeddingModel],
    [`Python 3 (GUNES_PYTHON=${m.python})`, t.python],
    ['scripts/whisper/konusmaci.py', existsSync(t.script) ? t.script : null],
  ];
  t.missing = need.filter(([, v]) => !v).map(([n]) => n);
  return t;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Süreci çalıştırır; satır satır stderr/stdout için onLine verilebilir; signal ile iptal edilir. */
export function run(cmd: string, args: string[], opts: { onLine?: (line: string) => void; signal?: AbortSignal; cwd?: string } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const feed = (buf: string, isErr: boolean) => {
      if (isErr) stderr = (stderr + buf).slice(-20000);
      else stdout = (stdout + buf).slice(-200000);
      if (opts.onLine) for (const l of buf.split(/\r?\n|\r/)) if (l.trim()) opts.onLine(l);
    };
    child.stdout.on('data', (d) => feed(String(d), false));
    child.stderr.on('data', (d) => feed(String(d), true));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    opts.signal?.addEventListener('abort', () => child.kill());
  });
}
