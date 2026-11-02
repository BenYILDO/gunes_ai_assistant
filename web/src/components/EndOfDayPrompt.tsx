import { AnimatePresence, motion } from 'motion/react';
import { MoonStar } from 'lucide-react';
import type { Phase } from '../lib/time';
import { SunCore } from './SunCore';

/** Mesai bitince sağ altta: "Günü kapatalım mı?" */
export function EndOfDayPrompt({ open, phase, onYes, onNo }: { open: boolean; phase: Phase; onYes: () => void; onNo: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          className="glass-solid hud-corners fixed bottom-16 left-1/2 z-[65] flex w-[min(460px,calc(100vw-40px))] -translate-x-1/2 items-center gap-3 rounded-2xl p-4"
        >
          <SunCore size={44} phase={phase === 'night' ? 'night' : 'dusk'} minimal />
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold">Mesai bitti ☀️</div>
            <div className="text-xs text-ink-dim">Günü kapatalım mı? Son değişiklikleri kaydedip sizi uğurlayayım.</div>
            <div className="mt-2.5 flex gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onYes}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ffb37a] to-[#ff7e5f] px-3 py-1.5 text-xs font-semibold text-[#1a0f05]"
              >
                <MoonStar size={13} /> Bugünlük yeter
              </motion.button>
              <button onClick={onNo} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink">
                Biraz daha çalışacağım
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
