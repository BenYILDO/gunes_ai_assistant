import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Mic, Square, Trash2, Users, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MeetingItem, WikiPageMeta } from '../lib/api';
import { DEFAULT_FAREWELL, DEFAULT_GREETING, greetingText, parseNames } from '../lib/inperson';
import { liveCapture, useLive } from '../lib/liveCapture';
import { setSetting, useSettings } from '../lib/settings';
import { cancelSpeech, speak, speakAsync } from '../lib/speech';
import { Button } from './ui';
import { SunCore } from './SunCore';
import { useToast } from './Toasts';

const clock = (sn: number) => `${String(Math.floor(sn / 3600)).padStart(2, '0')}:${String(Math.floor((sn % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(sn % 60)).padStart(2, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Ses çıkmasa (TTS yok/kapalı) bile duyuru metni en az bu kadar ekranda kalır: odadakiler okuyabilsin. */
const MIN_ANNOUNCE_MS = 4000;

/**
 * Yüz yüze toplantı başlatıcı: Güneş önce sesli olarak odadakileri bilgilendirir, duyuru BİTTİKTEN sonra dinlemeye başlar
 * (böylece Güneş'in kendi sesi kayda/transkripte girmez). Yalnızca mikrofon alınır; hoparlör yakalanmaz.
 */
export function InPersonLauncher({ projects, userName, nativeOk, onDone }: { projects: WikiPageMeta[]; userName: string; nativeOk: boolean; onDone: (m: MeetingItem | null) => void }) {
  const toast = useToast();
  const settings = useSettings();
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [names, setNames] = useState('');
  const [editText, setEditText] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'announcing' | 'starting'>('idle');
  const skip = useRef(false);
  const cancelled = useRef(false);
  const text = greetingText(settings.inPersonText, userName);

  // Bileşen kapanırsa konuşma da kesilsin
  useEffect(() => () => cancelSpeech(), []);

  const go = async () => {
    if (phase !== 'idle') return;
    skip.current = false;
    cancelled.current = false;
    if (settings.inPersonAnnounce) {
      setPhase('announcing');
      const t0 = Date.now();
      await speakAsync(text, { force: true, rate: 0.95 });
      if (!skip.current && !cancelled.current) {
        const wait = MIN_ANNOUNCE_MS - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
      }
      if (cancelled.current) return void setPhase('idle');
    }
    setPhase('starting');
    try {
      await liveCapture.startInPerson({ title: title.trim() || undefined, project: project || undefined, attendees: parseNames(names) }, (m) => {
        if (m) {
          toast('Dinleme bitti, yazıya çevriliyor.');
          onDone(m);
        }
      });
      onDone(null);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPhase('idle');
    }
  };

  const abort = () => {
    cancelled.current = true;
    cancelSpeech();
    setPhase('idle');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Toplantı adı (ör. Haftalık operasyon)" maxLength={150} className="min-w-[180px] flex-1 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60" />
        <select value={project} onChange={(e) => setProject(e.target.value)} className="max-w-[210px] rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs text-ink outline-none focus:border-[color:var(--accent)]/60">
          <option value="">Proje seç (isteğe bağlı)</option>
          {projects
            .filter((p) => p.kind === 'project')
            .map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
        </select>
      </div>
      <label className="block space-y-1">
        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          <Users size={11} /> Odadakiler (isteğe bağlı)
        </span>
        <input value={names} onChange={(e) => setNames(e.target.value)} placeholder="Ali Veli, Ayşe Kaya, …" className="w-full rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60" />
        <span className="block text-[11px] leading-relaxed text-ink-faint">Adları yazarsanız ses tanıma yalnızca bu kişilerin kayıtlı seslerine bakar; yanlış eşleşme azalır.</span>
      </label>

      <div className="space-y-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={settings.inPersonAnnounce} onChange={(e) => setSetting('inPersonAnnounce', e.target.checked)} />
          <Volume2 size={13} className="text-accent" /> Başlamadan önce sesli duyuru yap
        </label>
        {settings.inPersonAnnounce && (
          <div className="space-y-1.5">
            <p className="text-[11.5px] italic leading-relaxed text-ink-dim">“{text}”</p>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <button className="text-ink-faint underline-offset-2 hover:underline" onClick={() => setEditText((v) => !v)}>
                {editText ? 'Metni gizle' : 'Metni düzenle'}
              </button>
              <button className="text-ink-faint underline-offset-2 hover:underline" onClick={() => speak(text)}>
                Önce dinle
              </button>
            </div>
            {editText && (
              <div className="space-y-1">
                <textarea value={settings.inPersonText || DEFAULT_GREETING} onChange={(e) => setSetting('inPersonText', e.target.value)} rows={4} maxLength={600} className="w-full resize-y rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs leading-relaxed outline-none focus:border-[color:var(--accent)]/60" />
                <div className="flex items-center justify-between text-[10.5px] text-ink-faint">
                  <span>{'{ad}'} yerine adınız okunur.</span>
                  <button className="underline-offset-2 hover:underline" onClick={() => setSetting('inPersonText', '')}>
                    Varsayılana dön
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void go()} disabled={phase !== 'idle' || !nativeOk}>
          {phase === 'idle' ? <Mic size={13} /> : <Loader2 size={13} className="animate-spin" />} {settings.inPersonAnnounce ? 'Duyuruyu yap ve dinle' : 'Dinlemeye başla'}
        </Button>
        {!nativeOk && <span className="text-[11px] text-danger">Yüz yüze dinleme yerel ses yakalama gerektirir (GUNES_NATIVE_CAPTURE kapalı).</span>}
      </div>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Yalnızca bu bilgisayarın mikrofonu dinlenir; hoparlör sesi alınmaz. Bilgisayarı konuşanların ortasına, mikrofonu onlara dönük koyun. Güneş toplantıya katılan bir bot değildir; toplantıdakilerin bilgisi/onayı için kurum politikanıza uyun.
      </p>

      {/* Duyuru ekranı: odadakiler okuyabilsin */}
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Güneş toplantıya katılıyor">
            <motion.div className="glass-solid w-full max-w-xl space-y-4 rounded-3xl p-8 text-center shadow-2xl" initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }}>
              <div className="flex justify-center">
                <SunCore size={120} phase="day" minimal busy />
              </div>
              <div className="font-display text-xl">{phase === 'announcing' ? 'Güneş toplantıya katılıyor' : 'Mikrofon açılıyor…'}</div>
              {settings.inPersonAnnounce && <p className="text-base leading-relaxed text-ink">{text}</p>}
              <div className="flex justify-center gap-2 pt-1">
                {phase === 'announcing' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      skip.current = true;
                      cancelSpeech();
                    }}
                  >
                    Duyuruyu geç, hemen başla
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={abort}>
                  Vazgeç
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Yüz yüze dinleme sürerken: sakin, büyük "dinliyorum" ekranı. */
export function InPersonLive() {
  const live = useLive();
  const settings = useSettings();
  const toast = useToast();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = live.startedAt ? Math.floor((Date.now() - live.startedAt) / 1000) : 0;

  const finish = async () => {
    await liveCapture.stop();
    // Duyuru dinleme KAPANDIKTAN sonra yapılır: kayda girmez
    if (settings.inPersonAnnounce) speak(DEFAULT_FAREWELL);
  };
  const discard = async () => {
    if (!window.confirm('Bu dinleme kaydı tamamen atılsın mı? Geri alınamaz.')) return;
    await liveCapture.discard();
    toast('Kayıt atıldı.');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-5 py-6 text-center">
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--danger)] opacity-25" />
        <span className="absolute inset-2 animate-pulse rounded-full bg-[color:var(--danger)] opacity-30" />
        <Mic size={26} className="relative text-danger" />
      </div>
      <div className="font-display text-lg">Sizi dinliyorum</div>
      <div className="text-3xl font-light tabular-nums tracking-wide" aria-live="off">
        {clock(s)}
      </div>
      <div className="truncate text-xs text-ink-dim">
        {live.title} · {live.micOk ? 'mikrofon açık' : 'mikrofon bekleniyor'} · yüz yüze
      </div>
      {live.error && <div className="text-xs text-danger">{live.error}</div>}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button variant="danger" disabled={live.stopping} onClick={() => void finish()}>
          {live.stopping ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />} Bitir ve işle
        </Button>
        <Button size="sm" variant="ghost" disabled={live.stopping} onClick={() => void discard()}>
          <Trash2 size={12} /> Kaydı at
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-faint">Toplantı bitince “Bitir ve işle”ye basın; Güneş yazıya çevirip kimin ne dediğini ayırır. Hesaplama bu bilgisayarda yapılır, ses dosyası dışarı çıkmaz.</p>
    </div>
  );
}
