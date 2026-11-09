import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Copy, Loader2, Mail, PenLine, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toasts';

const TONES = [
  { id: 'kisa', label: 'Kısa' },
  { id: 'resmi', label: 'Resmi' },
  { id: 'samimi', label: 'Samimi' },
] as const;

type Result = Awaited<ReturnType<typeof api.composeMail>>;

const STAGES = [
  { id: 'plan', label: 'Sonnet gereken bilgileri belirliyor' },
  { id: 'research', label: 'Haiku wiki, hafıza, Outlook ve Teams geçmişini tarıyor' },
  { id: 'write', label: 'Sonnet taslağı yazıyor' },
] as const;

/** Serbest mail taslağı: Sonnet soru sorar → Haiku geçmişten bilgi toplar → Sonnet yazar. Güneş göndermez. */
export function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [request, setRequest] = useState('');
  const [tone, setTone] = useState<(typeof TONES)[number]['id']>('kisa');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'plan' | 'research' | 'write'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => area.current?.focus(), 40);
  }, [open]);

  // Çalışırken aşamayı sorgula
  useEffect(() => {
    if (!busy) return;
    let live = true;
    const tick = () =>
      api
        .composeProgress()
        .then((p) => live && (setStage(p.stage), setElapsed(p.elapsed)))
        .catch(() => {});
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [busy]);

  const make = async () => {
    if (request.trim().length < 5) return toast('Ne yazılacağını kısaca anlatın.', 'error');
    setBusy(true);
    setResult(null);
    try {
      const r = await api.composeMail(request.trim(), tone);
      setResult(r);
      setDraft(r.draft);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setStage('idle');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Kopyalanamadı; metni seçip kopyalayın.', 'error');
    }
  };
  const idx = STAGES.findIndex((s) => s.id === stage);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[8vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => !busy && onClose()} />
          <motion.div
            className="glass-solid relative flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Mail size={16} className="text-ink-dim" />
              <div className="font-display text-sm font-medium">Mail taslağı</div>
              <button onClick={onClose} disabled={busy} className="ml-auto text-ink-faint hover:text-ink disabled:opacity-40" title="Kapat">
                <X size={16} />
              </button>
            </div>

            <div className="scroll-thin overflow-y-auto p-4">
              <textarea
                ref={area}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                rows={4}
                placeholder="Ne yazılacak? Örn: “Ali Yılmaz'a, geçen toplantıda konuştuğumuz fiyat revizyonu için Cuma'ya kadar dönüş yapacağımı yaz.”"
                className="scroll-thin w-full resize-y rounded-xl border border-line bg-black/20 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]/60"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-line p-0.5 text-xs">
                  {TONES.map((t) => (
                    <button key={t.id} onClick={() => setTone(t.id)} className={`rounded-md px-2.5 py-1 ${tone === t.id ? 'bg-white/[0.1] text-ink' : 'text-ink-faint hover:text-ink-dim'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => void make()} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.07] px-3 py-1.5 text-xs hover:bg-white/[0.12] disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />}
                  {result ? 'Yeniden hazırla' : 'Taslak hazırla'}
                </button>
              </div>

              {busy && (
                <div className="mt-4 space-y-1.5 rounded-xl border border-line bg-white/[0.03] p-3 text-xs">
                  {STAGES.map((s, n) => (
                    <div key={s.id} className={`flex items-center gap-2 ${n < idx ? 'text-ink-faint' : n === idx ? 'text-ink' : 'text-ink-faint/50'}`}>
                      {n < idx ? <Check size={12} className="text-ok" /> : n === idx ? <Loader2 size={12} className="animate-spin" /> : <span className="inline-block h-3 w-3" />}
                      {s.label}
                    </div>
                  ))}
                  <div className="pt-1 text-[11px] text-ink-faint">{elapsed} sn · wiki/Outlook taraması birkaç dakika sürebilir</div>
                </div>
              )}

              {result && !busy && (
                <div className="mt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={12}
                    className="scroll-thin w-full resize-y rounded-xl border border-line bg-black/20 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]/60"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
                    <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-white/[0.08]">
                      {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />} {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                    Güneş göndermez: [KONTROL ET] yerlerini düzeltip kendiniz gönderin.
                    <span className="ml-auto">
                      {result.seconds.plan + result.seconds.research + result.seconds.write} sn (sorular {result.seconds.plan} · tarama {result.seconds.research} · yazım {result.seconds.write})
                    </span>
                  </div>

                  <button onClick={() => setShowFind((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-dim">
                    <ChevronDown size={13} className={showFind ? 'rotate-180' : ''} /> Güneş neleri sordu, ne buldu?
                  </button>
                  {showFind && (
                    <div className="mt-2 space-y-2 rounded-xl border border-line bg-white/[0.03] p-3 text-xs leading-relaxed">
                      {(result.plan.recipient || result.plan.purpose) && (
                        <div className="text-ink-dim">
                          {result.plan.recipient && <>Alıcı: {result.plan.recipient}. </>}
                          {result.plan.purpose && <>Amaç: {result.plan.purpose}</>}
                        </div>
                      )}
                      <ol className="list-decimal space-y-0.5 pl-4 text-ink-dim">
                        {result.plan.questions.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ol>
                      <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap font-sans text-[11.5px] text-ink-faint">{result.findings}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
