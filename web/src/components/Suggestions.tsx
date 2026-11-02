import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Bell, Check, Clock, HelpCircle, Lightbulb, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { Suggestion } from '../lib/api';
import { relTime } from '../lib/time';
import { Empty, Panel, PanelTitle } from './ui';

const KIND = {
  reminder: { icon: Bell, label: 'Hatırlatma', color: 'var(--accent)' },
  followup: { icon: Clock, label: 'Takip', color: 'var(--info)' },
  risk: { icon: AlertTriangle, label: 'Risk', color: 'var(--danger)' },
  question: { icon: HelpCircle, label: 'Güneş soruyor', color: '#c49bff' },
  idea: { icon: Lightbulb, label: 'Fikir', color: 'var(--ok)' },
} as const;

export function SuggestionsPanel({
  items,
  onAct,
  onOpenCard,
}: {
  items: Suggestion[];
  onAct: (s: Suggestion, status: 'accepted' | 'dismissed', lesson?: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Panel
      className="p-5"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <PanelTitle
        icon={<Sparkles size={14} />}
        right={items.length > 0 && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">{items.length}</span>}
      >
        Gözden kaçmasın
      </PanelTitle>

      {!items.length ? (
        <Empty icon={<Check size={26} />} title="Şimdilik her şey yolunda">
          Unutulan mail, geciken iş ya da riskli bir durum görürsem burada söyleyeceğim.
        </Empty>
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((s, i) => {
              const k = KIND[s.kind] ?? KIND.idea;
              const isOpen = expanded === s.id;
              return (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}
                  exit={{ opacity: 0, x: 40, height: 0, marginTop: 0, transition: { duration: 0.3 } }}
                  className="group relative overflow-hidden rounded-xl border border-line bg-white/[0.035] hover:bg-white/[0.06]"
                >
                  <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: k.color, boxShadow: `0 0 12px ${k.color}` }} />
                  <button className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => setExpanded(isOpen ? null : s.id)}>
                    <k.icon size={15} style={{ color: k.color }} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: k.color }}>
                        {k.label} <span className="text-ink-faint normal-case tracking-normal">· {relTime(s.created_at)}</span>
                      </div>
                      <div className="text-[13px] leading-snug text-ink">{s.title}</div>
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        {s.body && <p className="px-3 pb-2 pl-[38px] text-xs leading-relaxed text-ink-dim">{s.body}</p>}
                        <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-[38px]">
                          <ActionBtn onClick={() => onAct(s, 'accepted')} icon={<Check size={12} />}>
                            Tamam
                          </ActionBtn>
                          {s.card_id && (
                            <ActionBtn onClick={() => onOpenCard(s.card_id!)} icon={null}>
                              Karta git
                            </ActionBtn>
                          )}
                          <ActionBtn
                            onClick={() =>
                              onAct(s, 'dismissed', `Kullanıcı şunu bilerek böyle yaptı, tekrar sorma/hatırlatma: "${s.title}"`)
                            }
                            icon={null}
                          >
                            Bilerek yaptım
                          </ActionBtn>
                          <ActionBtn onClick={() => onAct(s, 'dismissed')} icon={<X size={12} />}>
                            Gereksiz
                          </ActionBtn>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </Panel>
  );
}

function ActionBtn({ children, icon, onClick }: { children: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/[0.05] px-2 py-1 text-[11px] text-ink-dim hover:border-line-strong hover:text-ink"
    >
      {icon}
      {children}
    </motion.button>
  );
}
