import { AnimatePresence, motion } from 'motion/react';
import { Brain, Check, ShieldAlert, SquareKanban, X } from 'lucide-react';
import type { PendingAction } from '../lib/api';
import { relTime } from '../lib/time';
import { Panel, PanelTitle } from './ui';

/** Güneş'in kendi yapamadığı (geri alınamaz) işler için onay paneli. Bekleyen yoksa görünmez. */
export function Approvals({ items, onResolve }: { items: PendingAction[]; onResolve: (a: PendingAction, d: 'approve' | 'reject') => void }) {
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <Panel
          className="border-[color:var(--danger)]/35 p-5"
          initial={{ opacity: 0, y: -12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -12, height: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <PanelTitle
            icon={<ShieldAlert size={14} className="text-danger" />}
            right={<span className="rounded-full bg-[color:var(--danger)]/15 px-2 py-0.5 text-[11px] text-danger">{items.length}</span>}
          >
            Onayınızı bekliyor
          </PanelTitle>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {items.map((a) => (
                <motion.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40, height: 0 }}
                  className="rounded-xl border border-line bg-white/[0.035] p-3"
                >
                  <div className="flex items-start gap-2">
                    {a.action === 'delete_card' ? (
                      <SquareKanban size={14} className="mt-0.5 shrink-0 text-danger" />
                    ) : (
                      <Brain size={14} className="mt-0.5 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wider text-danger">
                        {a.action === 'delete_card' ? 'Kartı sil' : 'Hafızadan sil'}
                        <span className="normal-case tracking-normal text-ink-faint"> · {relTime(a.created_at)}</span>
                      </div>
                      <div className="text-[13px] leading-snug text-ink">{a.title}</div>
                      <div className="mt-1 text-xs text-ink-dim">Gerekçe: {a.reason}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-1.5 pl-[22px]">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onResolve(a, 'approve')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--danger)]/18 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-[color:var(--danger)]/28"
                    >
                      <Check size={12} /> Sil
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onResolve(a, 'reject')}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/[0.05] px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink"
                    >
                      <X size={12} /> Kalsın
                    </motion.button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Panel>
      )}
    </AnimatePresence>
  );
}
