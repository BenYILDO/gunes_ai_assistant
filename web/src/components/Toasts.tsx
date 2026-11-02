import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast { id: number; text: string; kind: 'ok' | 'error' }
const Ctx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), Math.max(3800, text.length * 70));
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
            >
              {t.kind === 'ok' ? <CheckCircle2 size={16} className="text-ok" /> : <AlertCircle size={16} className="text-danger" />}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
