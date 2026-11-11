/**
 * Toplantılar API'si (arayüzdeki "Toplantılar" paneli):
 *  kayıt yükleme / klasörden seçme / canlı yakalama parçaları → işleme → isimlendirme → özet + wiki bağlantısı.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import type { Meeting } from '../store/types.js';
import { earnPet } from '../pet.js';
import { cancelMeeting, editCues, finalizeMeeting, isInPerson, MeetingError, meetingDir, SAFE_MEETING_ID, nameSpeaker, processMeeting, relabelSpeaker, removeMeetingFiles, transcriptText } from './pipeline.js';
import { meetingTools } from './tools.js';
import { callWatcher } from './callwatch.js';
import { startLiveMeeting } from './live.js';
import { analyzeMeeting, applyAllProposals, applyProposal, skipProposal } from './proposals.js';
import { abortNative, finishNative, nativeActive, nativeAvailable, nativeStatus } from './capture.js';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const MEDIA = new Set(['.mp4', '.m4a', '.mp3', '.wav', '.webm', '.mkv', '.ogg', '.flac', '.mov', '.aac']);
const MAX_CHUNK = 64 * 1024 * 1024;
const idOf = (req: Request) => {
  const id = String(req.params.id ?? '');
  if (!SAFE_MEETING_ID.test(id)) throw new MeetingError('Geçersiz toplantı kimliği.', 400);
  return id;
};

/** Kayıt klasörü içinde mi? (yol kaçışı yok) */
export function insideDir(root: string, file: string) {
  const r = resolve(root);
  const f = resolve(file);
  return f === r || f.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** Listede transkript yok (büyük); ayrıntıda var */
const light = (m: Meeting) => ({ ...m, audio_file: undefined, has_audio: Boolean(m.audio_file), transcript: undefined, cues: m.transcript.length, in_person: isInPerson(m.id) });
/** Ayrıntı: yerel dosya yolu gizlenir, ses var mı bilgisi gider */
const full = (m: Meeting) => ({ ...m, audio_file: undefined, has_audio: Boolean(m.audio_file), in_person: isInPerson(m.id) });

function scanFolder(root: string, depth = 2, out: { path: string; name: string; size: number; mtime: string }[] = []) {
  if (!existsSync(root)) return out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isDirectory() && depth > 0) scanFolder(p, depth - 1, out);
    else if (e.isFile() && MEDIA.has(extname(e.name).toLowerCase())) {
      try {
        const s = statSync(p);
        out.push({ path: p, name: e.name, size: s.size, mtime: s.mtime.toISOString() });
      } catch {
        /* erişilemeyen dosya */
      }
    }
  }
  return out;
}


/** Beklenen kullanıcı hataları (ad kısa, ses zaten adlandırılmış…) 4xx döner; günlüğü kirletmez */
function userErrors(err: Error, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof MeetingError && !res.headersSent) return void res.status(err.status).json({ error: err.message });
  next(err);
}

/** Supabase'te 0006 migration'ı çalıştırılmamışsa anlaşılır bir mesaj ver */
function tableHint(err: Error, _req: Request, res: Response, next: NextFunction) {
  if (/voice_profiles|meetings|schema cache|does not exist|relation/i.test(err.message) && !res.headersSent)
    return void res.status(503).json({ error: "Toplantılar için veritabanı tabloları yok. Supabase SQL Editor'de supabase/migrations/0006_meetings_voices.sql dosyasını bir kez çalıştırın." });
  next(err);
}

export function meetingsRouter() {
  const r = Router();
  const store = getStore();

  // Hat için gereken araçlar var mı (arayüz uyarısı)
  r.get('/tools', wrap(async (_req, res) => {
    const t = meetingTools();
    res.json({ ok: t.missing.length === 0, missing: t.missing, recordingsDir: config.meetings.recordingsDir || null, threshold: config.meetings.voiceThreshold, storeMode: store.mode, audioRetentionDays: config.meetings.audioRetentionDays, callWatch: config.meetings.callWatch, nativeCapture: nativeAvailable() });
  }));

  // Takvim: yakın geçmiş ve gelecek toplantılar (kayıt/canlı dinleme için seçilir)
  r.get('/calendar', wrap(async (_req, res) => {
    const now = Date.now();
    const events = (await store.listEvents({ sinceDays: 10, limit: 3000 }))
      .filter((e) => e.source === 'calendar' && Date.parse(e.occurred_at) > now - 8 * 864e5 && Date.parse(e.occurred_at) < now + 8 * 864e5)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((e) => ({ external_id: e.external_id, subject: e.subject ?? e.summary.slice(0, 80), occurred_at: e.occurred_at, ends_at: e.ends_at ?? null, link: e.link, summary: e.summary.slice(0, 240) }));
    res.json(events);
  }));

  // Arama algılama: Güneş bir arama fark edince arayüz "katılmamı ister misiniz?" penceresini gösterir
  r.get('/call', wrap(async (_req, res) => res.json(callWatcher.snapshot())));
  r.post('/call/decline', wrap(async (_req, res) => {
    callWatcher.decline();
    res.json(callWatcher.snapshot());
  }));
  // "Katıl" anında: arama penceresinin görüntüsünden arayanı oku (arka planda; durum /call'da görünür)
  r.post('/call/identify', wrap(async (_req, res) => {
    callWatcher.startIdentify();
    res.json(callWatcher.snapshot());
  }));
  r.post('/call/joined', wrap(async (_req, res) => {
    callWatcher.joined();
    res.json(callWatcher.snapshot());
  }));

  r.get('/folder', wrap(async (_req, res) => {
    const dir = config.meetings.recordingsDir;
    if (!dir) return void res.json({ enabled: false, files: [] });
    res.json({ enabled: true, dir, files: scanFolder(dir).sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, 200) });
  }));

  r.get('/', wrap(async (_req, res) => res.json((await store.listMeetings(100)).map(light))));

  r.get('/:id', wrap(async (req, res) => {
    const m = await store.getMeeting(idOf(req));
    if (!m) return void res.status(404).json({ error: 'Toplantı bulunamadı.' });
    res.json(full(m));
  }));

  // Bir kayıt dosyası verilmişse işlemeyi başlatır
  async function create(body: Partial<Meeting> & { title: string }, startNow: boolean) {
    const m = await store.createMeeting(body);
    if (startNow) void processMeeting(m.id);
    return m;
  }
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

  // Dosya yükleme: ham gövde (octet-stream), ad/başlık/etkinlik sorgu parametresinde
  r.post('/upload', wrap(async (req, res) => {
    const name = basename(str(req.query.name, 200) || 'kayit.mp4');
    const ext = extname(name).toLowerCase();
    if (!MEDIA.has(ext)) return void res.status(400).json({ error: `Desteklenmeyen dosya türü (${ext || 'uzantısız'}). mp4, m4a, mp3, wav, webm, mkv ya da ogg yükleyin.` });
    const m = await store.createMeeting({
      title: str(req.query.title, 150) || name.replace(/\.[^.]+$/, ''),
      source: 'upload',
      status: 'queued',
      step: 'Dosya yükleniyor',
      event_external_id: str(req.query.event, 300) || null,
      project_slug: str(req.query.project, 120) || null,
      started_at: str(req.query.started, 40) || null,
    });
    const dir = meetingDir(m.id);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `original${ext}`);
    try {
      await new Promise<void>((ok, bad) => {
        const ws = createWriteStream(file);
        req.pipe(ws);
        ws.on('finish', ok);
        ws.on('error', bad);
        req.on('error', bad);
        req.on('aborted', () => bad(new Error('Yükleme yarıda kesildi.')));
      });
    } catch (e) {
      removeMeetingFiles(m.id);
      await store.deleteMeeting(m.id);
      throw e;
    }
    const done = await store.updateMeeting(m.id, { audio_file: file, step: 'Sırada' });
    void processMeeting(m.id);
    res.json(light(done));
  }));

  // Klasörden seçme (yalnızca GUNES_RECORDINGS_DIR içindeki dosyalar; dosya kopyalanmaz, silinmez)
  r.post('/from-folder', wrap(async (req, res) => {
    const dir = config.meetings.recordingsDir;
    const file = str(req.body?.path, 600);
    if (!dir) return void res.status(400).json({ error: 'Kayıt klasörü ayarlı değil (.env → GUNES_RECORDINGS_DIR).' });
    if (!file || !insideDir(dir, file) || !existsSync(file) || !MEDIA.has(extname(file).toLowerCase())) return void res.status(400).json({ error: 'Geçersiz dosya.' });
    const m = await create(
      {
        title: str(req.body?.title, 150) || basename(file).replace(/\.[^.]+$/, ''),
        source: 'folder',
        audio_file: file,
        event_external_id: str(req.body?.event, 300) || null,
        project_slug: str(req.body?.project, 120) || null,
        started_at: statSync(file).mtime.toISOString(),
        step: 'Sırada',
      },
      true,
    );
    res.json(light(m));
  }));

  // Canlı yakalama: tarayıcı ses parçalarını gönderir (siz kayıt almadan Güneş sizinle dinler)
  r.post('/live', wrap(async (req, res) => {
    if (nativeStatus()) return void res.status(409).json({ error: 'Zaten bir canlı dinleme sürüyor.' });
    const { meeting, native, nativeError } = await startLiveMeeting({
      title: str(req.body?.title, 150),
      event: str(req.body?.event, 300) || null,
      project: str(req.body?.project, 120) || null,
      native: req.body?.native !== false,
      fromCall: Boolean(req.body?.fromCall),
    });
    callWatcher.attach(meeting.id); // az önce bir arama okunduysa arayan adı bu toplantıya işlenir
    res.json({ ...light(meeting), native, nativeError });
  }));

  // Yüz yüze toplantı: yalnızca mikrofon (hoparlör yakalanmaz). Sesli duyuru arayüzde yapılır, dinleme duyurudan SONRA başlar.
  r.post('/inperson', wrap(async (req, res) => {
    if (nativeStatus()) return void res.status(409).json({ error: 'Zaten bir canlı dinleme sürüyor.' });
    const names = Array.isArray(req.body?.attendees) ? (req.body.attendees as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const { meeting } = await startLiveMeeting({
      title: str(req.body?.title, 150),
      project: str(req.body?.project, 120) || null,
      attendees: names,
      native: true,
      inPerson: true,
      requireNative: true,
    });
    res.json({ ...light(meeting), native: true, inPerson: true });
  }));

  // Sunucudaki canlı dinleme durumu (arayüz yeniden yüklense de gerçeği gösterir)
  r.get('/live/status', wrap(async (_req, res) => {
    const st = nativeStatus();
    if (!st) return void res.json({ active: false });
    const m = await store.getMeeting(st.meetingId);
    res.json({ active: true, native: true, meetingId: st.meetingId, title: m?.title ?? 'Canlı toplantı', startedAt: st.startedAt, inPerson: st.inPerson, micOk: st.micOk, sysOk: st.sysOk, devices: st.devices, error: st.error, stopping: st.stopping });
  }));

  r.post('/:id/chunk', wrap(async (req, res) => {
    const m = await store.getMeeting(idOf(req));
    if (!m || m.source !== 'live' || m.status !== 'recording' || !m.audio_file || nativeActive(m.id)) return void res.status(409).json({ error: 'Bu toplantı şu an dinlenmiyor.' });
    let size = 0;
    await new Promise<void>((ok, bad) => {
      const ws = createWriteStream(m.audio_file!, { flags: 'a' });
      req.on('data', (d: Buffer) => {
        size += d.length;
        if (size > MAX_CHUNK) {
          req.destroy();
          bad(new Error('Parça çok büyük.'));
        }
      });
      req.pipe(ws);
      ws.on('finish', ok);
      ws.on('error', bad);
      req.on('error', bad);
    });
    res.json({ ok: true, bytes: size });
  }));

  r.post('/:id/finish', wrap(async (req, res) => {
    const m = await store.getMeeting(idOf(req));
    if (!m) return void res.status(404).json({ error: 'Toplantı bulunamadı.' });
    if (m.status !== 'recording') return void res.status(409).json({ error: 'Bu toplantı dinleme modunda değil.' });
    if (nativeActive(m.id)) {
      const done = await finishNative(m.id);
      return void res.json(light(done ?? m));
    }
    if (!m.audio_file || !existsSync(m.audio_file) || statSync(m.audio_file).size < 20_000) {
      await store.updateMeeting(m.id, { status: 'error', error: 'Kayıtta ses yok. Ekran paylaşımında "sistem sesini paylaş" seçeneğini işaretlediniz mi?', step: '' });
      return void res.status(400).json({ error: 'Kayıtta ses yok. Ekran paylaşımında "sistem sesini paylaş" seçeneğini işaretleyin.' });
    }
    await store.updateMeeting(m.id, { status: 'queued', step: 'Sırada' });
    void processMeeting(m.id);
    res.json(light((await store.getMeeting(m.id))!));
  }));

  r.post('/:id/reprocess', wrap(async (req, res) => {
    const m = await store.getMeeting(idOf(req));
    if (!m) return void res.status(404).json({ error: 'Toplantı bulunamadı.' });
    if (m.status === 'processing') return void res.status(409).json({ error: 'Zaten işleniyor.' });
    await store.updateMeeting(m.id, { status: 'queued', step: 'Sırada', error: null });
    void processMeeting(m.id);
    res.json({ ok: true });
  }));

  r.post('/:id/cancel', wrap(async (req, res) => {
    await abortNative(idOf(req));
    cancelMeeting(idOf(req));
    res.json({ ok: true });
  }));

  r.patch('/:id', wrap(async (req, res) => {
    const patch: Partial<Meeting> = {};
    if (typeof req.body?.title === 'string' && req.body.title.trim()) patch.title = str(req.body.title, 150);
    if ('projectSlug' in (req.body ?? {})) patch.project_slug = str(req.body.projectSlug, 120) || null;
    if (Array.isArray(req.body?.attendees)) patch.attendees = (req.body.attendees as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 80);
    res.json(light(await store.updateMeeting(idOf(req), patch)));
  }));

  // Tek tıkla isimlendirme: tanınmayan ses grubuna ad ver (profil oluşur/güçlenir)
  r.post('/:id/name', wrap(async (req, res) => {
    const m = await nameSpeaker(idOf(req), str(req.body?.speakerId, 60), str(req.body?.name, 80));
    res.json(full(m));
  }));
  // Transkript satırı düzeltme (Güneş'in sohbet aracı ve arayüz): özgün metin `raw`da kalır
  r.patch('/:id/cues', wrap(async (req, res) => {
    const edits = Array.isArray(req.body?.edits) ? (req.body.edits as { index?: unknown; text?: unknown }[]).map((e) => ({ index: Number(e?.index), text: typeof e?.text === 'string' ? e.text : '' })) : [];
    res.json(full(await editCues(idOf(req), edits)));
  }));
  r.post('/:id/relabel', wrap(async (req, res) => {
    res.json(full(await relabelSpeaker(idOf(req), str(req.body?.from, 80), str(req.body?.to, 80))));
  }));

  // Güneş'in önerileri (kart/wiki/hafıza): hiçbiri onaysız uygulanmaz
  r.post('/:id/proposals/apply-all', wrap(async (req, res) => {
    const out = full(await applyAllProposals(idOf(req)));
    void earnPet('proposal');
    res.json(out);
  }));
  r.post('/:id/proposals/:pid/apply', wrap(async (req, res) => {
    const out = full(await applyProposal(idOf(req), String(req.params.pid ?? '')));
    void earnPet('proposal');
    res.json(out);
  }));
  r.post('/:id/proposals/:pid/skip', wrap(async (req, res) => {
    res.json(full(await skipProposal(idOf(req), String(req.params.pid ?? ''))));
  }));
  // Özeti ve önerileri yeniden üret (sohbet bildirimi göndermeden)
  r.post('/:id/analyze', wrap(async (req, res) => {
    const m = await analyzeMeeting(idOf(req), { notify: false });
    if (!m) return void res.status(502).json({ error: 'Analiz üretilemedi (transkript hazır mı? Claude yanıt verdi mi?).' });
    res.json(full(m));
  }));

  r.post('/:id/finalize', wrap(async (req, res) => {
    const slug = 'projectSlug' in (req.body ?? {}) ? str(req.body.projectSlug, 120) || null : undefined;
    const out = full(await finalizeMeeting(idOf(req), { projectSlug: slug }));
    void earnPet('meeting');
    res.json(out);
  }));

  r.delete('/:id', wrap(async (req, res) => {
    const id = idOf(req);
    await abortNative(id);
    cancelMeeting(id);
    await store.deleteMeeting(id);
    removeMeetingFiles(id); // yalnızca data/meetings/<id>; klasörden seçilen özgün dosyaya dokunulmaz
    res.json({ ok: true });
  }));

  // Bir sesin örneğini dinletme (en çok 20 sn, ffmpeg ile wav akıtılır)
  r.get('/:id/clip', wrap(async (req, res) => {
    const wav = join(meetingDir(idOf(req)), 'audio.wav');
    const t = meetingTools();
    const b = Math.max(0, Number(req.query.b) || 0);
    const len = Math.min(20, Math.max(1, (Number(req.query.e) || b + 5) - b));
    if (!existsSync(wav) || !t.ffmpeg) return void res.status(404).json({ error: 'Ses dosyası yok.' });
    res.setHeader('Content-Type', 'audio/wav');
    const p = spawn(t.ffmpeg, ['-loglevel', 'error', '-ss', String(b), '-t', String(len), '-i', wav, '-f', 'wav', 'pipe:1'], { windowsHide: true });
    p.stdout.pipe(res);
    req.on('close', () => p.kill());
  }));

  r.get('/:id/transcript.md', wrap(async (req, res) => {
    const m = await store.getMeeting(idOf(req));
    if (!m) return void res.status(404).json({ error: 'Toplantı bulunamadı.' });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="toplanti-${m.id.slice(0, 8)}.md"`);
    res.send(`# ${m.title}\n\n${m.attendees.length ? `Katılımcılar: ${m.attendees.join(', ')}\n\n` : ''}${transcriptText(m.transcript, 1_000_000)}\n`);
  }));

  r.use(userErrors);
  r.use(tableHint);
  return r;
}

/** Ses profilleri (BİYOMETRİK veri): listele ve kişi başı sil. Vektörler arayüze gönderilmez. */
export function voicesRouter() {
  const r = Router();
  const store = getStore();
  r.get('/', wrap(async (_req, res) => {
    res.json((await store.listVoiceProfiles()).map(({ embedding: _e, ...p }) => p));
  }));
  r.delete('/:id', wrap(async (req, res) => {
    await store.deleteVoiceProfile(idOf(req));
    res.json({ ok: true });
  }));
  r.use(userErrors);
  r.use(tableHint);
  return r;
}
