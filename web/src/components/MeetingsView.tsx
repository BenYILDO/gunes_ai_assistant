import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CalendarClock, Sparkles, CheckCircle2, Download, FileAudio, FolderOpen, Headphones, Link2, Loader2, Mic, Play, Radio, RotateCw, ShieldAlert, Square, Trash2, Upload, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ChatRef, type CalendarMeeting, type MeetingItem, type MeetingProposal, type MeetingStatus, type WikiPageMeta } from '../lib/api';
import { usePoll } from '../lib/hooks';
import { callerLine, useCall } from '../lib/callState';
import { liveCapture, liveSupported, useLive } from '../lib/liveCapture';
import { relTime } from '../lib/time';
import { Button, Chip, Empty, Panel, PanelTitle } from './ui';
import { useToast } from './Toasts';
import { InPersonLauncher, InPersonLive } from './InPersonPanel';

const STATUS: Record<MeetingStatus, { label: string; cls: string }> = {
  recording: { label: 'Dinleniyor', cls: 'text-danger' },
  queued: { label: 'Sırada', cls: 'text-ink-dim' },
  processing: { label: 'İşleniyor', cls: 'text-accent' },
  review: { label: 'İnceleme bekliyor', cls: 'text-warn' },
  done: { label: 'Hazır', cls: 'text-ok' },
  error: { label: 'Hata', cls: 'text-danger' },
};
const dur = (sn: number | null) => (sn ? `${Math.max(1, Math.round(sn / 60))} dk` : '');
const clock = (sn: number) => `${String(Math.floor(sn / 60)).padStart(2, '0')}:${String(Math.floor(sn % 60)).padStart(2, '0')}`;
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const who = (name: string | null, cluster: string | null) => name ?? (cluster ? `Ses ${cluster.replace('ses-', '')}` : '?');

const KIND_LABEL: Record<MeetingProposal['kind'], string> = {
  create_card: '🗂️ Kart aç',
  update_card: '📝 Karta not',
  wiki_meeting_page: '📚 Wiki sayfası',
  wiki_append: "📚 Wiki'ye ekle",
  remember: '🧠 Hafızaya al',
  followup_mail: '✉️ Takip maili taslağı',
};
const detailOf = (p: MeetingProposal) => {
  const v = p.payload as Record<string, unknown>;
  if (p.kind === 'followup_mail') {
    const to = Array.isArray(v.to) ? (v.to as string[]).join(', ') : '';
    const pts = Array.isArray(v.points) ? (v.points as string[]).map((x) => `• ${x}`).join('  ') : '';
    return `Alıcı: ${to}. ${pts}`.slice(0, 260);
  }
  const t = [v.description, v.note, v.text, v.content].find((x) => typeof x === 'string' && x) as string | undefined;
  return t ? t.slice(0, 220) : '';
};

function play(url: string) {
  void new Audio(url).play().catch(() => {});
}

function Select({ value, onChange, children, className = '' }: { value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs text-ink outline-none focus:border-[color:var(--accent)]/60 ${className}`}>
      {children}
    </select>
  );
}

/** Toplantılar: canlı dinle, kayıt ekle, konuşmacıları adlandır, özetle ve wiki'ye bağla. */
export function MeetingsView({ projects, userName = '', onOpenWiki, onAsk, onFocusMeeting }: { projects: WikiPageMeta[]; userName?: string; onOpenWiki: (slug: string) => void; onAsk?: (text: string, ref: ChatRef) => void; onFocusMeeting?: (ref: ChatRef | null) => void }) {
  const toast = useToast();
  const live = useLive();
  const callNow = useCall(live.active).call;
  const tools = usePoll(api.meetingTools, 0);
  const list = usePoll(api.meetings, 4000);
  const calendar = usePoll(api.meetingCalendar, 0);
  const folder = usePoll(api.meetingFolder, 0);
  const voices = usePoll(api.voices, 0);
  const [project, setProject] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [liveTitle, setLiveTitle] = useState('');
  const [mode, setMode] = useState<'online' | 'inperson'>('online');
  const [upTitle, setUpTitle] = useState('');
  const [upEvent, setUpEvent] = useState('');
  const [upPct, setUpPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live.active) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [live.active]);
  void tick;

  const projectPages = useMemo(() => projects.filter((p) => p.kind === 'project'), [projects]);
  const meetings = list.data ?? [];
  const err = list.error;

  const startLive = async (c?: CalendarMeeting) => {
    try {
      await liveCapture.start({ title: c?.subject ?? (liveTitle.trim() || undefined), event: c?.external_id, project: project || undefined }, (m) => {
        void list.refresh();
        if (m) {
          toast('Dinleme bitti, yazıya çevriliyor.');
          setOpenId(m.id);
        }
      });
      void list.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      if (!/Permission denied|NotAllowed/i.test(msg)) toast(msg, 'error');
      else toast('Ekran paylaşımı izni verilmedi.', 'error');
    }
  };

  const upload = async (file: File) => {
    setUpPct(0);
    try {
      const m = await api.meetingUpload(file, { title: upTitle.trim() || undefined, event: upEvent || undefined, project: project || undefined }, setUpPct);
      toast('Kayıt yüklendi, işleniyor.');
      setUpTitle('');
      void list.refresh();
      setOpenId(m.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setUpPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fromFolder = async (path: string) => {
    try {
      const m = await api.meetingFromFolder(path, { event: upEvent || undefined, project: project || undefined });
      toast('İşleniyor.');
      void list.refresh();
      setOpenId(m.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const elapsed = live.startedAt ? Math.floor((Date.now() - live.startedAt) / 1000) : 0;

  return (
    <div className="scroll-thin h-full space-y-4 overflow-y-auto px-6 pb-8">
      {tools.data && !tools.data.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/10 px-4 py-3 text-xs leading-relaxed">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
          <div>
            <b>Yerel transkript için eksik parçalar var:</b> {tools.data.missing.join(', ')}. <code>.env</code> içinde <code>GUNES_WHISPER_DIR</code> klasörünü gösterin (bkz. scripts/whisper/RAPOR.md).
          </div>
        </div>
      )}
      {err && /0006|tablolar/i.test(err) && (
        <div className="flex items-start gap-2 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-xs">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" /> {err}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ---------- Canlı dinle */}
        <Panel className="p-4">
          <PanelTitle icon={<Radio size={14} />}>Toplantıyı benimle dinle</PanelTitle>
          {!live.active && (
            <div role="tablist" aria-label="Toplantı türü" className="mb-3 inline-flex rounded-lg border border-line bg-black/20 p-0.5 text-xs">
              {([['online', 'Çevrimiçi / arama'], ['inperson', 'Yüz yüze']] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1 ${mode === k ? 'bg-[color:var(--accent)]/20 text-ink' : 'text-ink-faint hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {live.active && live.inPerson ? (
            <InPersonLive />
          ) : live.active ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--danger)] opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--danger)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{live.title}</div>
                  <div className="text-[11px] text-ink-faint">
                    {clock(elapsed)} · {live.micOk ? 'karşı taraf + mikrofon' : 'yalnızca karşı taraf (mikrofon yok)'} · {live.native ? 'yerel yakalama' : `${live.chunks} parça aktarıldı`}
                  </div>
                  {callerLine(callNow) && (
                    <div className="text-[11px] text-ink-dim" title="Arama penceresinin ekran görüntüsünden okundu; doğrulayın">
                      {callerLine(callNow)} <span className="text-ink-faint">(ekrandan okundu, doğrulayın)</span>
                    </div>
                  )}
                </div>
                <Button variant="danger" size="sm" disabled={live.stopping} onClick={() => void liveCapture.stop()}>
                  {live.stopping ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />} Bitir ve işle
                </Button>
              </div>
              {live.error && <div className="text-xs text-danger">{live.error}</div>}
              <p className="text-[11px] leading-relaxed text-ink-faint">{live.native ? 'Arama bitince kendiliğinden biter; isterseniz "Bitir ve işle"ye basın.' : 'Toplantı bitince "Bitir ve işle"ye basın.'} Güneş yazıya çevirip sesleri ayırır; hesaplama bu bilgisayarda yapılır, ses dışarı çıkmaz.</p>
            </div>
          ) : mode === 'inperson' ? (
            <InPersonLauncher
              projects={projects}
              userName={userName}
              nativeOk={tools.data?.nativeCapture !== false}
              onDone={(m) => {
                void list.refresh();
                if (m) setOpenId(m.id);
              }}
            />
          ) : (
            <div className="space-y-3">
              {!liveSupported() && <div className="text-xs text-danger">Bu tarayıcı sistem sesi yakalamayı desteklemiyor.</div>}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={project} onChange={setProject} className="max-w-[210px]">
                  <option value="">Proje seç (isteğe bağlı)</option>
                  {projectPages.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.title}
                    </option>
                  ))}
                </Select>
                <input value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} placeholder="Takvimsiz toplantı adı" className="min-w-[160px] flex-1 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60" />
                <Button size="sm" variant="primary" onClick={() => void startLive()} disabled={!liveSupported()}>
                  <Headphones size={13} /> Başlat
                </Button>
              </div>
              <div className="space-y-1">
                <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Takvimden seç (katılımcılar otomatik alınır)</div>
                {(calendar.data ?? []).length === 0 && <div className="text-xs text-ink-faint">Yakın tarihli takvim toplantısı bulunamadı. Güneş taramasından sonra burada görünür.</div>}
                <div className="scroll-thin max-h-44 space-y-1 overflow-y-auto pr-1">
                  {(calendar.data ?? []).map((c) => (
                    <div key={c.external_id} className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs">
                      <CalendarClock size={13} className="shrink-0 text-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{c.subject}</div>
                        <div className="text-[10.5px] text-ink-faint">{new Date(c.occurred_at).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <Button size="sm" onClick={() => void startLive(c)} disabled={!liveSupported()}>
                        <Mic size={12} /> Dinle
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {tools.data?.nativeCapture !== false ? (
                  <>Başlatınca ekran paylaşımı ya da izin sorulmaz: mikrofonunuzu ve hoparlör/kulaklık çıkışını doğrudan alırım, arama bitince kendiliğinden biter. Kulaklık kullanırsanız karşı tarafın sesi mikrofonunuza sızmaz. </>
                ) : (
                  <>Başlatınca tarayıcı ekran paylaşımı ister: <b>Tüm ekran</b>ı seçip <b>Sistem sesini de paylaş</b> kutusunu işaretleyin. Kulaklık kullanırsanız sesler daha temiz ayrışır. </>
                )}
                Güneş toplantıya katılan bir bot değildir, toplantıyı bu bilgisayardan dinler;
                toplantıdakilerin bilgisi/onayı için kurum politikanıza uyun.
              </p>
            </div>
          )}
        </Panel>

        {/* ---------- Kayıt ekle */}
        <Panel className="p-4">
          <PanelTitle icon={<FileAudio size={14} />}>Kayıt ekle (mp4 / ses)</PanelTitle>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder="Toplantı adı (boşsa dosya adı)" className="min-w-[160px] flex-1 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60" />
              <Select value={upEvent} onChange={setUpEvent} className="max-w-[230px]">
                <option value="">Takvim kaydı bağla (isteğe bağlı)</option>
                {(calendar.data ?? []).map((c) => (
                  <option key={c.external_id} value={c.external_id}>
                    {new Date(c.occurred_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} · {c.subject}
                  </option>
                ))}
              </Select>
              <input ref={fileRef} type="file" accept=".mp4,.m4a,.mp3,.wav,.webm,.mkv,.ogg,.flac,.mov,.aac,video/*,audio/*" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={upPct !== null}>
                {upPct !== null ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {upPct !== null ? `%${upPct}` : 'Dosya seç'}
              </Button>
            </div>
            {folder.data?.enabled && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                  <FolderOpen size={12} /> Klasörden seç <span className="truncate normal-case tracking-normal">{folder.data.dir}</span>
                </div>
                <div className="scroll-thin max-h-40 space-y-1 overflow-y-auto pr-1">
                  {folder.data.files.length === 0 && <div className="text-xs text-ink-faint">Klasörde ses/video dosyası yok.</div>}
                  {folder.data.files.map((f) => (
                    <div key={f.path} className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{f.name}</div>
                        <div className="text-[10.5px] text-ink-faint">
                          {relTime(f.mtime)} · {(f.size / 1048576).toFixed(0)} MB
                        </div>
                      </div>
                      <Button size="sm" onClick={() => void fromFolder(f.path)}>
                        İşle
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {folder.data && !folder.data.enabled && <div className="text-[11px] text-ink-faint">İsterseniz <code>.env</code> içinde <code>GUNES_RECORDINGS_DIR</code> ile bir klasör gösterin (ör. OneDrive'daki Teams kayıtları); buradan seçebilirsiniz.</div>}
            <p className="text-[11px] leading-relaxed text-ink-faint">Dosya yalnızca bu bilgisayardaki Güneş sunucusuna gider; yazıya çevirme ve ses ayırma yerelde yapılır (≈ toplantı süresi kadar sürer).</p>
          </div>
        </Panel>
      </div>

      {/* ---------- Toplantılar */}
      <Panel className="p-4">
        <PanelTitle icon={<Users size={14} />} right={<span className="text-[11px] text-ink-faint">{meetings.length} kayıt</span>}>
          Toplantılar
        </PanelTitle>
        {meetings.length === 0 ? (
          <Empty icon={<Headphones size={26} />} title="Henüz toplantı yok">
            Yukarıdan canlı dinlemeyi başlatın ya da bir kayıt ekleyin.
          </Empty>
        ) : (
          <div className="space-y-1.5">
            {meetings.map((m) => (
              <button key={m.id} onClick={() => setOpenId(m.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-left hover:bg-white/[0.07]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                    <span>{relTime(m.started_at ?? m.created_at)}</span>
                    {m.duration_sec ? <span>· {dur(m.duration_sec)}</span> : null}
                    <Chip>{m.in_person ? 'yüz yüze' : m.source === 'live' ? 'canlı' : m.source === 'folder' ? 'klasör' : 'yüklendi'}</Chip>
                    {m.speakers.filter((s) => s.kind === 'unknown').length > 0 && (
                      <Chip className="!text-warn">
                        {m.speakers.filter((s) => s.kind === 'unknown').length} ses adlandırılmayı bekliyor
                      </Chip>
                    )}
                    {m.wiki_slug && <Chip className="!text-ok">wiki'de</Chip>}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 text-xs ${STATUS[m.status].cls}`}>
                  {(m.status === 'processing' || m.status === 'queued') && <Loader2 size={12} className="animate-spin" />}
                  {m.status === 'done' && <CheckCircle2 size={13} />}
                  {m.step && m.status !== 'error' ? m.step : STATUS[m.status].label}
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* ---------- Ses profilleri */}
      <Panel className="p-4">
        <PanelTitle icon={<ShieldAlert size={14} />}>Ses profilleri</PanelTitle>
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          Profiller kişilerin <b>biyometrik verisidir</b> (KVKK özel nitelikli kişisel veri). Yalnızca toplantılarda kimin konuştuğunu tanımak için kullanılır; ilgili kişilerin bilgisi/onayı ya da kurumsal politika gerekebilir. Dilediğiniz profili silebilirsiniz.
        </p>
        {(voices.data ?? []).length === 0 ? (
          <div className="text-xs text-ink-faint">Henüz profil yok. Bir toplantıda bir sesi adlandırınca oluşur.</div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(voices.data ?? []).map((v) => (
              <div key={v.id} className="flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(${hue(v.name)} 70% 60%)` }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{v.name}</div>
                  <div className="text-[10.5px] text-ink-faint">
                    {v.samples} örnek · {v.source === 'teams' ? 'Teams' : v.source === 'live' ? 'canlı' : 'elle'} · {relTime(v.updated_at)}
                  </div>
                </div>
                <button
                  title="Profili sil"
                  className="text-ink-faint hover:text-danger"
                  onClick={async () => {
                    if (!confirm(`${v.name} ses profili silinsin mi? Bu kişi sonraki toplantılarda tanınmaz.`)) return;
                    try {
                      await api.voiceDelete(v.id);
                      void voices.refresh();
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <MeetingDetail
        id={openId}
        onAsk={onAsk}
        onFocusMeeting={onFocusMeeting}
        retentionDays={tools.data?.audioRetentionDays ?? 30}
        projects={projectPages}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          void list.refresh();
          void voices.refresh();
        }}
        onOpenWiki={(s) => {
          setOpenId(null);
          onOpenWiki(s);
        }}
      />
    </div>
  );
}

// ======================================================================
function MeetingDetail({ id, projects, retentionDays, onClose, onChanged, onOpenWiki, onAsk, onFocusMeeting }: { id: string | null; projects: WikiPageMeta[]; retentionDays: number; onClose: () => void; onChanged: () => void; onOpenWiki: (slug: string) => void; onAsk?: (text: string, ref: ChatRef) => void; onFocusMeeting?: (ref: ChatRef | null) => void }) {
  const toast = useToast();
  const [m, setM] = useState<MeetingItem | null>(null);
  const [proj, setProj] = useState('');
  const [busy, setBusy] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [fix, setFix] = useState<string | null>(null);
  const [fixTo, setFixTo] = useState('');
  // Toplantı sonrası tek ekran akışı: sesler → özet ve kararlar → öneriler → bitir
  const [stepIdx, setStepIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  // Açık toplantı sohbetin bağlamı olur ("bu toplantı" demek yeter); kapanınca bağlam kalkar
  useEffect(() => {
    if (!id) return;
    onFocusMeeting?.(m ? { kind: 'meeting', id, title: m.title } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, m?.title]);
  useEffect(() => () => onFocusMeeting?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Güneş sohbette sesleri adlandırır/satırları düzeltir/önerileri uygular: pencere kendiliğinden tazelenir
  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !busy) void load();
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, busy]);
  // Esc ile kapanır (klavye kullanıcıları ve genel beklenti)
  useEffect(() => {
    if (!id) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [id, onClose]);

  const load = async () => {
    if (!id) return;
    try {
      const x = await api.meeting(id);
      if (alive.current) {
        setM(x);
        setProj((p) => p || x.project_slug || '');
      }
    } catch {
      /* yoksay */
    }
  };
  useEffect(() => {
    setM(null);
    setProj('');
    setNames({});
    setStepIdx(0);
    setShowAll(false);
    if (id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // İşlenirken ilerlemeyi izle
  useEffect(() => {
    if (!id || !m || !['queued', 'processing', 'recording'].includes(m.status)) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, m?.status]);

  const act = async (key: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const unknown = m?.speakers.filter((s) => s.kind === 'unknown') ?? [];
  const known = m?.speakers.filter((s) => s.kind === 'known') ?? [];
  // Aday adlar: takvim katılımcıları (henüz tanınmış olarak görünmeyenler önde)
  const candidates = useMemo(() => {
    const have = new Set(known.map((k) => (k.name ?? '').toLowerCase()));
    const att = m?.attendees ?? [];
    return [...att.filter((a) => !have.has(a.toLowerCase())), ...att.filter((a) => have.has(a.toLowerCase()))];
  }, [m, known]);

  const unknownBlock = m && unknown.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-warn">Bu sesler kim? (dinleyip adlandırın)</div>
                    {unknown.map((s) => (
                      <div key={s.id} className="rounded-xl border border-line bg-white/[0.03] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${hue(s.id)} 70% 60%)` }} />
                          <span className="text-sm">{who(null, s.id)}</span>
                          <span className="text-[11px] text-ink-faint">
                            {s.cues} satır · {Math.max(1, Math.round(s.seconds / 60))} dk
                          </span>
                          {s.samples.map((x, i) => (
                            <button key={i} onClick={() => play(api.meetingClipUrl(m.id, x.b, Math.min(x.e, x.b + 8)))} className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-dim hover:bg-white/[0.08]" title="Dinle">
                              <Play size={10} /> {clock(x.b)}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Select value={candidates.includes(names[s.id] ?? '') ? names[s.id]! : ''} onChange={(v) => setNames((n) => ({ ...n, [s.id]: v }))} className="max-w-[220px]">
                            <option value="">Katılımcılardan seç…</option>
                            {candidates.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </Select>
                          <input value={names[s.id] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))} placeholder="ya da adı yazın" className="min-w-[140px] flex-1 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60" />
                          <Button size="sm" variant="primary" disabled={(names[s.id] ?? '').trim().length < 2 || busy !== ''} onClick={() => void act('n' + s.id, () => api.meetingName(m.id, s.id, names[s.id]!), 'Kaydedildi: bu kişi sonraki toplantılarda tanınacak.')}>
                            {busy === 'n' + s.id ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                
  ) : null;
  const proposalsBlock = m && (m.proposals ?? []).length > 0 ? (
                  <div className="rounded-xl border border-[color:var(--accent)]/30 bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">
                      <Sparkles size={12} /> Güneş'in önerileri
                      {(m.proposals ?? []).filter((p) => p.status === 'pending').length > 1 && (
                        <Button size="sm" variant="primary" className="ml-auto" disabled={busy !== ''} onClick={() => void act('pall', () => api.proposalApplyAll(m.id), 'Önerilerin hepsi uygulandı.')}>
                          {busy === 'pall' ? <Loader2 size={12} className="animate-spin" /> : null} Hepsini uygula ({(m.proposals ?? []).filter((p) => p.status === 'pending').length})
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {(m.proposals ?? []).map((p) => (
                        <div key={p.id} className="flex items-start gap-2 rounded-lg border border-line bg-black/20 p-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="text-ink">
                              <span className="text-ink-faint">{KIND_LABEL[p.kind]}: </span>
                              {p.title}
                            </div>
                            {detailOf(p) && <div className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{detailOf(p)}</div>}
                            {p.reason && <div className="mt-0.5 text-[11px] italic text-ink-faint">{p.reason}</div>}
                            {p.result && <div className={`mt-0.5 text-[11px] ${p.status === 'failed' ? 'text-danger' : 'text-ok'}`}>{p.result}</div>}
                            {p.draft && (
                              <div className="mt-1.5 space-y-1">
                                <textarea readOnly value={p.draft} aria-label="Takip maili taslağı" rows={Math.min(12, p.draft.split('\n').length + 1)} className="w-full resize-y rounded-lg border border-line bg-black/30 p-2 text-[12px] leading-relaxed text-ink-dim outline-none" />
                                <Button size="sm" onClick={() => void navigator.clipboard.writeText(p.draft!).then(() => toast('Taslak kopyalandı. Güneş mail göndermez; kendiniz gönderin.'))}>
                                  Taslağı kopyala
                                </Button>
                              </div>
                            )}
                          </div>
                          {p.status === 'pending' ? (
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="primary" disabled={busy !== ''} onClick={() => void act('p' + p.id, () => api.proposalApply(m.id, p.id), 'Uygulandı.')}>
                                {busy === 'p' + p.id ? <Loader2 size={12} className="animate-spin" /> : null} Uygula
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={() => void act('s' + p.id, () => api.proposalSkip(m.id, p.id))}>
                                Geç
                              </Button>
                            </div>
                          ) : (
                            <Chip className={p.status === 'applied' ? '!text-ok' : p.status === 'failed' ? '!text-danger' : ''}>{p.status === 'applied' ? 'uygulandı' : p.status === 'failed' ? 'başarısız' : 'geçildi'}</Chip>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-ink-faint">Hiçbiri onayınız olmadan uygulanmaz. Güneş kartı "bitti"ye taşıyamaz. Rakam, tutar ve isimleri uygulamadan önce kontrol edin; sohbette de konuşabilirsiniz.</div>
                  </div>
                
  ) : null;

  // ---------- toplantı sonrası sihirbaz
  const pendingProps = (m?.proposals ?? []).filter((p) => p.status === 'pending');
  const hasProps = (m?.proposals ?? []).length > 0;
  const guidedOk = Boolean(m && ['review', 'done'].includes(m.status) && (unknown.length > 0 || m.analysis || hasProps));
  const guided = guidedOk && !showAll;
  const steps: { id: 'voices' | 'summary' | 'proposals' | 'finish'; label: string; done: boolean }[] = [
    ...(unknown.length > 0 ? [{ id: 'voices' as const, label: 'Sesler', done: false }] : []),
    { id: 'summary', label: 'Özet ve kararlar', done: false },
    ...(hasProps ? [{ id: 'proposals' as const, label: 'Öneriler', done: pendingProps.length === 0 }] : []),
    { id: 'finish', label: 'Bitir', done: Boolean(m?.wiki_slug) },
  ];
  const idx = Math.min(stepIdx, steps.length - 1);
  const cur = steps[idx]!;
  const guidedBlock =
    m && guided ? (
      <div className="space-y-4">
        {/* adım çubuğu */}
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((st, i) => (
            <button
              key={st.id}
              onClick={() => setStepIdx(i)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${i === idx ? 'border-[color:var(--accent)]/60 bg-[color:var(--accent)]/15 text-ink' : 'border-line text-ink-faint hover:text-ink-dim'}`}
            >
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${st.done ? 'bg-[color:var(--ok)]/25 text-ok' : 'bg-white/10'}`}>{st.done ? '✓' : i + 1}</span>
              {st.label}
            </button>
          ))}
          <button className="ml-auto text-[11px] text-ink-faint underline-offset-2 hover:underline" onClick={() => setShowAll(true)}>
            Tüm ayrıntıları göster
          </button>
        </div>

        {/* Güneş'le birlikte: sohbet bu toplantıyı görür, sesleri adlandırabilir, satırları düzeltebilir, adımları ilerletebilir */}
        {onAsk && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/[0.06] px-3 py-2">
            <Sparkles size={13} className="text-accent" />
            <span className="text-[11px] text-ink-dim">Güneş'le birlikte:</span>
            {[
              { t: 'İncele', q: 'Bu toplantıyı birlikte inceleyelim: önce sesleri, sonra yanlış duyulmuş yerleri kontrol et, özeti yenile ve önerileri anlat.' },
              ...(unknown.length > 0 ? [{ t: `Sesleri adlandıralım (${unknown.length})`, q: 'Bu toplantıdaki tanınmayan sesleri birlikte adlandıralım. Her sesin konuşmalarına bakıp kim olabileceğini söyle.' }] : []),
              { t: 'Yanlış duyulanları bul', q: 'Transkriptte yanlış duyulmuş isim ve terimleri bul, düzeltme önerilerini göster; onayımla düzelt.' },
              ...(pendingProps.length > 0 ? [{ t: 'Önerileri anlat', q: 'Güneş\'in önerilerini tek tek anlat; hangilerini uygulamanı istediğimi söyleyeceğim.' }] : []),
            ].map((b) => (
              <button
                key={b.t}
                onClick={() => onAsk(b.q, { kind: 'meeting', id: m.id, title: m.title })}
                className="rounded-full border border-line bg-white/[0.05] px-2.5 py-1 text-[11px] text-ink hover:border-[color:var(--accent)]/50"
              >
                {b.t}
              </button>
            ))}
          </div>
        )}

        {cur.id === 'voices' && (
          <div className="space-y-2">
            <p className="text-sm text-ink-dim">Önce kimlerin konuştuğunu belirleyelim; böylece özet ve öneriler doğru kişilere bağlanır. Sesleri dinleyip adlandırın, bilmiyorsanız bu adımı geçebilirsiniz.</p>
            {unknownBlock}
          </div>
        )}

        {cur.id === 'summary' && (
          <div className="space-y-3">
            {m.analysis ? (
              <>
                <p className="text-[15px] leading-relaxed">{m.analysis.ozet}</p>
                {m.analysis.konular.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.analysis.konular.map((k) => (
                      <Chip key={k}>{k}</Chip>
                    ))}
                  </div>
                )}
                {m.analysis.kararlar.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">Kararlar</div>
                    <ul className="space-y-1 text-sm">
                      {m.analysis.kararlar.map((k, i) => (
                        <li key={i} className="flex gap-2">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" /> <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.analysis.aksiyonlar.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">Aksiyonlar</div>
                    <ul className="space-y-1 text-sm">
                      {m.analysis.aksiyonlar.map((a, i) => (
                        <li key={i} className="rounded-lg border border-line bg-white/[0.03] px-3 py-1.5">
                          <b>{a.kim}</b> · {a.ne}
                          {a.ne_zaman && <span className="text-ink-faint"> — {a.ne_zaman}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-ink-faint">Özet otomatiktir: isim ve rakamları (tutar, tarih) kontrol edin.</p>
              </>
            ) : (
              <div className="space-y-2">
                {m.summary ? <p className="text-sm leading-relaxed text-ink-dim">{m.summary}</p> : <p className="text-sm text-ink-dim">Bu toplantı için henüz özet ve öneri yok.</p>}
                <Button size="sm" variant="primary" disabled={busy !== '' || Boolean(m.step)} onClick={() => void act('an', () => api.meetingAnalyze(m.id), 'Özet ve öneriler hazır.')}>
                  {busy === 'an' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Özet ve öneri üret
                </Button>
              </div>
            )}
          </div>
        )}

        {cur.id === 'proposals' && (
          <div className="space-y-2">
            <p className="text-sm text-ink-dim">
              {pendingProps.length > 0 ? `Güneş ${pendingProps.length} şey öneriyor. Hiçbiri onayınız olmadan uygulanmaz; her birini uygulayabilir ya da geçebilirsiniz.` : 'Tüm öneriler değerlendirildi. 👏'}
            </p>
            {proposalsBlock}
          </div>
        )}

        {cur.id === 'finish' && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">{(m.proposals ?? []).filter((p) => p.status === 'applied').length}</div>
                <div className="text-[11px] text-ink-faint">uygulanan öneri</div>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">{pendingProps.length}</div>
                <div className="text-[11px] text-ink-faint">bekleyen öneri</div>
              </div>
              <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
                <div className="text-lg font-semibold">{m.wiki_slug ? 'Bağlı' : 'Bağlı değil'}</div>
                <div className="text-[11px] text-ink-faint">wiki sayfası</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={proj} onChange={setProj} className="max-w-[260px]">
                <option value="">Projeye bağlama</option>
                {projects.map((pr) => (
                  <option key={pr.slug} value={pr.slug}>
                    {pr.title}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant={m.wiki_slug ? 'subtle' : 'primary'} disabled={busy !== '' || m.status === 'processing'} onClick={() => void act('fin', () => api.meetingFinalize(m.id, proj || null), 'Wiki sayfası oluşturuldu.')}>
                {busy === 'fin' ? <Loader2 size={12} className="animate-spin" /> : null} {m.wiki_slug ? 'Wiki sayfasını yenile' : "Wiki'ye bağla"}
              </Button>
              {m.wiki_slug && (
                <Button size="sm" onClick={() => onOpenWiki(m.wiki_slug!)}>
                  Wiki sayfasını aç
                </Button>
              )}
            </div>
            {pendingProps.length > 0 && <p className="text-[11px] text-warn">{pendingProps.length} öneri hâlâ bekliyor; sonra Toplantılar'dan bu ekrana dönebilirsiniz.</p>}
          </div>
        )}

        {/* ileri / geri */}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => setStepIdx(idx - 1)}>
            ← Geri
          </Button>
          {idx < steps.length - 1 ? (
            <Button size="sm" variant="primary" onClick={() => setStepIdx(idx + 1)}>
              {cur.id === 'voices' && unknown.length > 0 ? 'Şimdilik geç →' : 'İleri →'}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onClose}>
              <CheckCircle2 size={13} /> Bitti
            </Button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <AnimatePresence>
      {id && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[6vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div className="glass-solid relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl" initial={{ opacity: 0, y: -14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Users size={16} className="text-ink-dim" />
              <div className="min-w-0 flex-1 truncate font-display text-sm font-medium">{m?.title ?? 'Toplantı'}</div>
              {m && <span className={`text-xs ${STATUS[m.status].cls}`}>{m.step && m.status !== 'error' ? m.step : STATUS[m.status].label}</span>}
              <button onClick={onClose} className="text-ink-faint hover:text-ink">
                <X size={16} />
              </button>
            </div>

            {!m ? (
              <div className="flex items-center justify-center p-10 text-ink-faint">
                <Loader2 className="animate-spin" size={18} />
              </div>
            ) : (
              <div className="scroll-thin space-y-4 overflow-y-auto p-4">
                {m.status === 'error' && (
                  <div className="flex items-start gap-2 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2 text-xs">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                    <div className="flex-1">{m.error}</div>
                    <Button size="sm" onClick={() => void act('re', () => api.meetingReprocess(m.id))} disabled={busy !== ''}>
                      <RotateCw size={12} /> Yeniden işle
                    </Button>
                  </div>
                )}
                {(m.status === 'processing' || m.status === 'queued') && (
                  <div className="flex items-center gap-2 text-xs text-ink-dim">
                    <Loader2 size={13} className="animate-spin" /> {m.step || 'Sırada'} — kayıt süresi kadar sürebilir; bu pencereyi kapatabilirsiniz.
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void act('cancel', () => api.meetingCancel(m.id))}>
                      İptal
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                  <span>{relTime(m.started_at ?? m.created_at)}</span>
                  {m.duration_sec ? <span>· {dur(m.duration_sec)}</span> : null}
                  {m.attendees.length > 0 && <span>· Takvim katılımcıları:</span>}
                  {m.attendees.map((a) => (
                    <Chip key={a}>{a}</Chip>
                  ))}
                  {m.source !== 'folder' && ['review', 'done', 'error'].includes(m.status) && (
                    <Chip className={`ml-auto ${m.has_audio ? '' : '!text-ink-faint'}`} title="Ses dosyası hemen silinmez; süre dolunca silinir. Transkript, özet ve wiki sayfası kalır.">
                      {m.has_audio
                        ? retentionDays > 0
                          ? `Ses ${Math.max(0, Math.ceil((Date.parse(m.created_at) + retentionDays * 864e5 - Date.now()) / 864e5))} gün sonra silinir`
                          : 'Ses silinmez'
                        : 'Ses dosyası silindi'}
                    </Chip>
                  )}
                </div>

                {guided ? (
                  guidedBlock
                ) : (
                  <>
                    {guidedOk && (
                      <button className="text-[11px] text-accent underline-offset-2 hover:underline" onClick={() => setShowAll(false)}>
                        ← Adım adım görünüme dön
                      </button>
                    )}
                {/* Tanınmayan sesler: tek tıkla isimlendirme */}
                {unknownBlock}

                {/* Tanınan sesler */}
                {known.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Tanınan konuşmacılar</div>
                    <div className="flex flex-wrap gap-1.5">
                      {known.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.04] px-2 py-1 text-xs">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: `hsl(${hue(s.name ?? s.id)} 70% 60%)` }} />
                          {s.name} <span className="text-ink-faint">{Math.max(1, Math.round(s.seconds / 60))} dk</span>
                          <button className="text-[10.5px] text-ink-faint underline-offset-2 hover:underline" onClick={() => (setFix(s.id), setFixTo(''))}>
                            yanlış?
                          </button>
                        </div>
                      ))}
                    </div>
                    {fix && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-ink-dim">{fix} → doğru kişi:</span>
                        <Select value="" onChange={(v) => setFixTo(v)}>
                          <option value="">seç…</option>
                          {m.attendees.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </Select>
                        <input value={fixTo} onChange={(e) => setFixTo(e.target.value)} className="w-40 rounded-lg border border-line bg-black/20 px-2 py-1 text-xs outline-none" placeholder="ad" />
                        <Button size="sm" disabled={fixTo.trim().length < 2} onClick={() => void act('fix', () => api.meetingRelabel(m.id, fix, fixTo), 'Bu toplantıdaki satırlar düzeltildi.').then(() => setFix(null))}>
                          Düzelt
                        </Button>
                        <button className="text-ink-faint" onClick={() => setFix(null)}>
                          vazgeç
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Güneş'in önerileri: hiçbiri onaysız uygulanmaz */}
                {proposalsBlock}

                {/* Özet + wiki */}
                {m.transcript && m.transcript.length > 0 && (
                  <div className="rounded-xl border border-line bg-white/[0.03] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                      <Link2 size={12} /> Özet ve wiki bağlantısı
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={proj} onChange={setProj} className="max-w-[260px]">
                        <option value="">Projeye bağlama</option>
                        {projects.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.title}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="primary" disabled={busy !== '' || m.status === 'processing'} onClick={() => void act('fin', () => api.meetingFinalize(m.id, proj || null), 'Özet çıkarıldı ve wiki sayfası oluşturuldu.')}>
                        {busy === 'fin' ? <Loader2 size={12} className="animate-spin" /> : null} {m.wiki_slug ? 'Özeti yenile' : 'Özetle ve wiki\'ye bağla'}
                      </Button>
                      {m.wiki_slug && (
                        <Button size="sm" onClick={() => onOpenWiki(m.wiki_slug!)}>
                          Wiki sayfasını aç
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy !== '' || m.status === 'processing' || Boolean(m.step)} onClick={() => void act('an', () => api.meetingAnalyze(m.id), 'Özet ve öneriler yenilendi.')}>
                        {busy === 'an' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {m.analysis ? 'Önerileri yenile' : 'Özet ve öneri üret'}
                      </Button>
                      <a href={api.meetingTranscriptUrl(m.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink" download>
                        <Download size={12} /> Transkript (.md)
                      </a>
                    </div>
                    {unknown.length > 0 && <div className="mt-2 text-[11px] text-warn">Adlandırılmamış sesler özette "Bilinmeyen ses" olarak geçer; önce adlandırmanız daha iyi olur.</div>}
                    {m.summary && <p className="mt-2 text-sm leading-relaxed text-ink-dim">{m.summary}</p>}
                    <p className="mt-2 text-[11px] text-ink-faint">Özet otomatiktir: isim ve rakamları (tutar, tarih) kontrol edin. Güneş toplantıyı wiki'ye, takvim kaydına ve projeye referansla bağlar.</p>
                  </div>
                )}

                {/* Transkript */}
                {m.transcript && m.transcript.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Transkript ({m.transcript.length} satır) · saate tıklayınca dinlersiniz</div>
                    <div className="scroll-thin max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-line bg-black/20 p-2 text-[13px] leading-relaxed">
                      {m.transcript.map((c, i) => {
                        const name = who(c.speaker, c.cluster);
                        const prev = i > 0 ? who(m.transcript![i - 1]!.speaker, m.transcript![i - 1]!.cluster) : '';
                        return (
                          <div key={i} className="flex gap-2">
                            <button className="w-11 shrink-0 text-left text-[11px] tabular-nums text-ink-faint hover:text-accent" onClick={() => play(api.meetingClipUrl(m.id, c.b, Math.min(c.e, c.b + 10)))}>
                              {clock(c.b)}
                            </button>
                            {name !== prev ? (
                              <span className="w-28 shrink-0 truncate text-xs font-medium" style={{ color: `hsl(${hue(c.speaker ?? c.cluster ?? '?')} 70% 68%)` }} title={name}>
                                {name}
                              </span>
                            ) : (
                              <span className="w-28 shrink-0" />
                            )}
                            <span className="text-ink-dim">{c.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                  </>
                )}

                <div className="flex items-center justify-between border-t border-line pt-3">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Bu toplantı, transkripti ve yerel ses dosyası silinsin mi? (Wiki sayfası silinmez.)')) return;
                      await act('del', () => api.meetingDelete(m.id));
                      onClose();
                    }}
                  >
                    <Trash2 size={12} /> Toplantıyı sil
                  </Button>
                  {m.status !== 'processing' && m.status !== 'queued' && m.status !== 'recording' && m.has_audio !== false && (
                    <Button size="sm" variant="ghost" onClick={() => void act('re', () => api.meetingReprocess(m.id), 'Yeniden işleniyor.')}>
                      <RotateCw size={12} /> Yeniden işle
                    </Button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
