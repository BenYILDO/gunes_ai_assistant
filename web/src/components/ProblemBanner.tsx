import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { api, type RunProblem } from '../lib/api';
import { relTime } from '../lib/time';
import { useToast } from './Toasts';

const KIND_TR: Record<string, string> = { morning: 'Sabah çalışması', tracker: '2 saatlik takip', backfill: 'Geçmiş taraması', wiki: 'Wiki kurulumu', prep: 'Toplantı hazırlığı', followup: 'Toplantı sonrası', weekly: 'Haftalık rapor', reflection: 'Haftalık iç gözlem' };
const KEY = 'gunes.dismissedProblems';
const dismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};

/** Son çalışması hata veren işleri üstte gösterir; "Yeniden dene" ile tekrar başlatılır. */
export function ProblemBanner({ problems, busy, onRetried, onOpenHistory }: { problems: RunProblem[]; busy: boolean; onRetried: () => void; onOpenHistory: () => void }) {
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>(dismissed);
  const visible = problems.filter((p) => !hidden.includes(p.id));

  const hide = (id: string) => {
    const next = [...hidden, id].slice(-50);
    setHidden(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* yoksay */
    }
  };
  const retry = async (p: RunProblem) => {
    try {
      await api.retryRun(p.id);
      toast(`${KIND_TR[p.kind] ?? p.kind} yeniden başlatıldı`);
      hide(p.id);
      onRetried();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <AnimatePresence initial={false}>
      {visible.slice(0, 2).map((p) => (
        <motion.div
          key={p.id}
          layout
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="mx-6 mb-3 flex items-start gap-3 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-2.5 text-sm"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <div>
              <b>{KIND_TR[p.kind] ?? p.kind}</b> {relTime(p.at)} hata verdi.
              <button onClick={onOpenHistory} className="ml-2 text-xs text-ink-dim underline-offset-2 hover:underline">
                Geçmişi aç
              </button>
            </div>
            <div className="truncate text-xs text-ink-dim" title={p.error}>
              {p.error}
            </div>
            {p.hint && <div className="mt-0.5 text-xs text-ink">💡 {p.hint}</div>}
          </div>
          {p.retryable && (
            <button
              onClick={() => void retry(p)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white/[0.06] px-2.5 py-1 text-xs hover:bg-white/[0.12] disabled:opacity-40"
            >
              <RotateCw size={12} /> Yeniden dene
            </button>
          )}
          <button onClick={() => hide(p.id)} title="Gizle" className="shrink-0 text-ink-faint hover:text-ink">
            <X size={15} />
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
