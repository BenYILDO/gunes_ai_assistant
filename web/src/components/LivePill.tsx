import { AnimatePresence, motion } from 'motion/react';
import { Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { callerLine, useCall } from '../lib/callState';
import { liveCapture, useLive } from '../lib/liveCapture';

/** Canlı dinleme sürerken her ekranda görünen küçük gösterge: dinlediğiniz belli olsun. */
export function LivePill({ onOpen }: { onOpen: () => void }) {
  const live = useLive();
  const { call } = useCall(live.active);
  const who = callerLine(call);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!live.active) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [live.active]);
  const s = live.startedAt ? Math.floor((Date.now() - live.startedAt) / 1000) : 0;
  const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <AnimatePresence>
      {live.active && (
        <motion.div
          className="glass-solid fixed bottom-4 left-4 z-[65] flex items-center gap-2.5 rounded-full py-1.5 pl-3 pr-1.5 text-xs shadow-lg"
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--danger)] opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--danger)]" />
          </span>
          <button onClick={onOpen} className="max-w-[220px] truncate hover:text-accent" title="Toplantılar paneline git">
            Dinliyorum · {live.title}{who ? ` · ${who}` : ''} · {clock}
          </button>
          <button disabled={live.stopping} onClick={() => void liveCapture.stop()} className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.07] px-2.5 py-1 hover:bg-white/[0.14] disabled:opacity-50">
            <Square size={10} /> Bitir
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
