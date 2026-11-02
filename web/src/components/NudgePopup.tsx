import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Nudge } from '../lib/api';
import { speak } from '../lib/speech';
import { relTime, type Phase } from '../lib/time';
import { Markdown } from './Markdown';
import { SunCore } from './SunCore';

/** Güneş'in kendiliğinden seslendiği pop-up'lar (sağ alt köşe). */
export function NudgePopup({
  items,
  phase,
  onTalk,
  onLater,
}: {
  items: Nudge[];
  phase: Phase;
  onTalk: (n: Nudge) => void;
  onLater: (n: Nudge) => void;
}) {
  const announced = useRef(new Set<string>());

  useEffect(() => {
    for (const n of items) {
      if (announced.current.has(n.id)) continue;
      announced.current.add(n.id);
      if (document.visibilityState === 'visible') speak(n.title);
      // Pencere arka plandaysa tarayıcı bildirimi de göster
      else if ('Notification' in window && Notification.permission === 'granted') {
        const note = new Notification(`☀️ ${n.title}`, { body: n.message.replace(/[*_`#>]/g, '').slice(0, 180), tag: n.id });
        note.onclick = () => {
          window.focus();
          onTalk(n);
          note.close();
        };
      }
    }
  }, [items, onTalk]);

  const shown = items.slice(-3);
  return (
    <div className="pointer-events-none fixed bottom-16 right-5 z-[60] flex w-[min(400px,calc(100vw-40px))] flex-col gap-3">
      <AnimatePresence initial={false}>
        {shown.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.9, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 80, scale: 0.95, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="glass hud-corners pointer-events-auto relative overflow-hidden rounded-2xl !bg-[rgb(14_11_32/0.9)] p-4"
          >
            {/* Işık süpürmesi */}
            <motion.div
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--glow) / 0.18), transparent)' }}
              initial={{ x: '0%' }}
              animate={{ x: '400%' }}
              transition={{ duration: 1.6, delay: 0.2, ease: 'easeOut' }}
            />
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <SunCore size={40} phase={phase} minimal busy />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-semibold">{n.title}</span>
                  <span className="ml-auto text-[10.5px] text-ink-faint">{relTime(n.created_at)}</span>
                  <button onClick={() => onLater(n)} className="-mr-1 rounded p-0.5 text-ink-faint hover:text-ink" title="Kapat">
                    <X size={13} />
                  </button>
                </div>
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-1 max-h-40 overflow-y-auto">
                  <Markdown className="!text-[12.5px]">{n.message}</Markdown>
                </motion.div>
                <div className="mt-3 flex gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ y: -1 }}
                    onClick={() => onTalk(n)}
                    className="accent-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a0f05]"
                  >
                    <MessageCircle size={13} /> Konuşalım
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onLater(n)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
                  >
                    Sonra
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
