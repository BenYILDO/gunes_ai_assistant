import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Brain, Mail, Search, SquareKanban } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type SearchHit } from '../lib/api';
import { relTime } from '../lib/time';

const TYPE: Record<SearchHit['type'], { label: string; icon: typeof Search }> = {
  wiki: { label: 'Wiki', icon: BookOpen },
  card: { label: 'Kart', icon: SquareKanban },
  event: { label: 'Mail / Teams', icon: Mail },
  memory: { label: 'Hafıza', icon: Brain },
};

/** Ctrl+K ile açılan birleşik arama: wiki, kartlar, mail/Teams kayıtları ve hafıza. */
export function SearchPalette({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
    else {
      setQ('');
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setBusy(true);
    let live = true;
    const t = setTimeout(() => {
      api
        .search(q.trim())
        .then((h) => live && (setHits(h), setSel(0)))
        .catch(() => live && setHits([]))
        .finally(() => live && setBusy(false));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const pick = (h: SearchHit) => {
    onPick(h);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(hits.length - 1, s + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
    else if (e.key === 'Enter' && hits[sel]) pick(hits[sel]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="glass-solid relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Search size={17} className={busy ? 'animate-pulse text-accent' : 'text-ink-faint'} />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Wiki, kart, mail, Teams ve hafızada ara…"
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">Esc</kbd>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {q.trim().length < 2 ? (
                <div className="px-3 py-8 text-center text-sm text-ink-faint">Bir kişi, proje ya da konu yazın. Türkçe karakter yazmanız şart değil.</div>
              ) : !hits.length && !busy ? (
                <div className="px-3 py-8 text-center text-sm text-ink-faint">“{q}” için sonuç yok.</div>
              ) : (
                hits.map((h, i) => {
                  const T = TYPE[h.type];
                  return (
                    <button
                      key={`${h.type}:${h.id}`}
                      onClick={() => pick(h)}
                      onMouseEnter={() => setSel(i)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === sel ? 'bg-white/[0.09]' : ''}`}
                    >
                      <T.icon size={16} className="mt-0.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{h.title}</span>
                          <span className="shrink-0 rounded-md border border-line px-1.5 text-[10px] text-ink-faint">{T.label}</span>
                          {h.date && <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{relTime(h.date)}</span>}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-dim">{h.snippet}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
