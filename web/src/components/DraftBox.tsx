import { Check, Copy, Loader2, PenLine } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toasts';

const TONES = [
  { id: 'kisa', label: 'Kısa' },
  { id: 'resmi', label: 'Resmi' },
  { id: 'samimi', label: 'Samimi' },
] as const;

/** Kart için yanıt taslağı. Güneş göndermez; metni kopyalayıp kendiniz gönderirsiniz. */
export function DraftBox({ cardId }: { cardId: string }) {
  const toast = useToast();
  const [tone, setTone] = useState<(typeof TONES)[number]['id']>('kisa');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const make = async () => {
    setBusy(true);
    try {
      setDraft((await api.draftReply(cardId, tone, note)).draft);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
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

  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Yanıt taslağı</div>
      <div className="rounded-xl border border-line bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5 text-xs">
            {TONES.map((t) => (
              <button key={t.id} onClick={() => setTone(t.id)} className={`rounded-md px-2.5 py-1 ${tone === t.id ? 'bg-white/[0.1] text-ink' : 'text-ink-faint hover:text-ink-dim'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="İsterseniz yönlendirin: “Cuma teslim edebiliriz de”"
            className="min-w-[200px] flex-1 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs outline-none focus:border-[color:var(--accent)]/60"
          />
          <button onClick={() => void make()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.07] px-3 py-1.5 text-xs hover:bg-white/[0.12] disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />}
            {draft ? 'Yeniden yaz' : 'Taslak hazırla'}
          </button>
        </div>
        {draft && (
          <div className="mt-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={9}
              className="scroll-thin w-full resize-y rounded-xl border border-line bg-black/20 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]/60"
            />
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-faint">
              <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink hover:bg-white/[0.08]">
                {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />} {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
              Güneş göndermez: [KONTROL ET] yerlerini düzeltip kendiniz gönderin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
