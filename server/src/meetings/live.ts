/**
 * Canlı dinleme toplantısı oluşturma (hem arayüzdeki "Dinle" düğmeleri hem de Windows popup'ındaki "Katıl" kullanır).
 * Önce yerel ses yakalama denenir (ekran paylaşımı/izin yok); olmazsa çağıran isterse tarayıcı yöntemi için live.webm hazırlanır.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getStore } from '../store/index.js';
import type { Meeting } from '../store/types.js';
import { nativeAvailable, startNative } from './capture.js';
import { meetingDir, removeMeetingFiles } from './pipeline.js';

export interface LiveOptions {
  title?: string;
  event?: string | null;
  project?: string | null;
  /** false = yalnızca tarayıcı yöntemi */
  native?: boolean;
  fromCall?: boolean;
  /** true: yerel yakalama başlamazsa kaydı sil ve hata fırlat (tarayıcı yöntemine geçilemeyecek bağlamlar: popup) */
  requireNative?: boolean;
}

export async function startLiveMeeting(o: LiveOptions): Promise<{ meeting: Meeting; native: boolean; nativeError: string | null }> {
  const store = getStore();
  const meeting = await store.createMeeting({
    title: (o.title ?? '').trim().slice(0, 150) || 'Canlı toplantı',
    source: 'live',
    status: 'recording',
    step: 'Dinleniyor',
    event_external_id: o.event ? o.event.slice(0, 300) : null,
    project_slug: o.project ? o.project.slice(0, 120) : null,
    started_at: new Date().toISOString(),
  });
  const dir = meetingDir(meeting.id);
  mkdirSync(dir, { recursive: true });
  let native = false;
  let nativeError: string | null = null;
  if (nativeAvailable() && o.native !== false) {
    try {
      await startNative(meeting.id, { fromCall: Boolean(o.fromCall) });
      native = true;
    } catch (e) {
      nativeError = (e as Error).message;
    }
  } else if (o.native !== false) nativeError = 'Yerel ses yakalama bu bilgisayarda kapalı ya da kullanılamıyor.';
  if (!native && o.requireNative) {
    await store.deleteMeeting(meeting.id).catch(() => {});
    removeMeetingFiles(meeting.id);
    throw new Error(nativeError ?? 'Yerel ses yakalama başlamadı.');
  }
  const started = native ? meeting : await store.updateMeeting(meeting.id, { audio_file: join(dir, 'live.webm') });
  return { meeting: started, native, nativeError };
}
