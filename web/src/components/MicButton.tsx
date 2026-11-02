import { motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listener, type ListenState } from '../lib/listener';

/** Mikrofon: varsayılan açık; tıklayınca kapanır/açılır (tercih hatırlanır). */
export function MicButton() {
  const [state, setState] = useState<ListenState>(listener.state);
  useEffect(() => listener.onState(setState), []);
  const on = state === 'listening';
  const title =
    state === 'unsupported'
      ? 'Bu tarayıcı konuşma tanımayı desteklemiyor (Edge kullanın)'
      : state === 'denied'
        ? 'Mikrofon izni verilmedi — adres çubuğundaki kilit simgesinden izin verin'
        : on
          ? 'Mikrofon açık — "Güneş, …" diye seslenebilirsiniz. Kapatmak için tıklayın.'
          : 'Mikrofon kapalı — açmak için tıklayın';
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => (on ? listener.stop() : listener.start())}
      disabled={state === 'unsupported'}
      title={title}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
        on ? 'border-[color:var(--ok)]/50 bg-[color:var(--ok)]/12 text-ok' : state === 'denied' ? 'border-[color:var(--danger)]/40 text-danger' : 'border-line text-ink-faint hover:text-ink'
      }`}
    >
      {on ? <Mic size={16} /> : <MicOff size={16} />}
      {on && (
        <motion.span
          className="absolute inset-0 rounded-xl border border-[color:var(--ok)]"
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.18, 1] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      )}
    </motion.button>
  );
}
