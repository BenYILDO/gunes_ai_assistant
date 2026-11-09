/**
 * Ses saklama: ses dosyaları hemen silinmez, `GUNES_AUDIO_RETENTION_DAYS` (varsayılan 30) gün sonra silinir.
 * Transkript, özet ve wiki sayfası kalır. Klasörden seçilen özgün dosyalara ASLA dokunulmaz (bize ait değil).
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import type { Meeting } from '../store/types.js';
import { meetingDir } from './pipeline.js';

/** Silinecek ses dosyaları (toplantı klasörü içinde). Transkript .vtt ve diğer metinler kalır. */
export const AUDIO_FILE = /^(audio\.wav|live\.webm|original\..+|araliklar\.json|vektorler\.json)$/i;

const DAY = 864e5;

/** Saf: hangi toplantıların sesi silinmeli? İşlenmekte olanlara ve klasörden seçilenlere dokunulmaz. */
export function purgeCandidates(meetings: Meeting[], days: number, now: number): Meeting[] {
  if (!(days > 0)) return [];
  return meetings.filter(
    (m) => m.source !== 'folder' && ['done', 'review', 'error'].includes(m.status) && m.audio_file !== null && now - Date.parse(m.created_at) >= days * DAY,
  );
}

/** Toplantının ses dosyalarını siler; silinen dosya sayısını döner. */
export function removeAudioFiles(id: string) {
  const dir = meetingDir(id);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const f of readdirSync(dir))
    if (AUDIO_FILE.test(f)) {
      rmSync(join(dir, f), { force: true });
      n++;
    }
  return n;
}

/** Konuşmacı vektör ara dosyaları (biyometrik ara veri): işlem biter bitmez silinir. */
export function removeDerivedFiles(id: string) {
  for (const f of ['araliklar.json', 'vektorler.json']) rmSync(join(meetingDir(id), f), { force: true });
}

export async function purgeAudio(now = Date.now()) {
  const store = getStore();
  const days = config.meetings.audioRetentionDays;
  let done = 0;
  try {
    for (const m of purgeCandidates(await store.listMeetings(500), days, now)) {
      removeAudioFiles(m.id);
      await store.updateMeeting(m.id, { audio_file: null });
      done++;
    }
  } catch {
    /* tablo (0006) yoksa ya da depo erişilemezse sessiz geç */
  }
  return done;
}

let timer: NodeJS.Timeout | null = null;
/** Açılışta ve her 6 saatte bir çalışır. */
export function startAudioRetention() {
  if (timer) return;
  void purgeAudio();
  timer = setInterval(() => void purgeAudio(), 6 * 3600_000);
  timer.unref?.();
}
