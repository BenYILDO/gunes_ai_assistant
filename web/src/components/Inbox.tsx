import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellOff, Check, Headphones, MessageCircle, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Nudge } from '../lib/api';
import { classifyNudge, type NudgeKind } from '../lib/inbox';
import { relTime } from '../lib/time';

export interface InboxProposal {
  meetingId: string;
  title: string;
  count: number;
}

const plain = (s: string) => s.replace(/[*_`#>\[\]]/g, '').replace(/\s+/g, ' ').trim();
const ORDER: Record<NudgeKind, number> = { high: 0, meeting: 1, normal: 2 };

/** Tek gelen kutusu: Güneş'in seslendikleri, onay bekleyenler ve toplantı önerileri. Açılır pencereler sessizken de burada birikir. */
export function Inbox({
  nudges,
  approvals,
  proposals,
  quiet,
  onTalk,
  onSeen,
  onApprovals,
  onMeetings,
}: {
  nudges: Nudge[];
  approvals: number;
  proposals: InboxProposal[];
  /** Şu an sessiz mod (sessiz saat ya da aramadasınız) */
  quiet: 'hours' | 'call' | null;
  onTalk: (n: Nudge) => void;
  onSeen: (n: Nudge) => void;
  onApprovals: () => void;
  onMeetings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const propCount = proposals.reduce((s, p) => s + p.count, 0);
  const total = nudges.length + approvals + propCount;
  const sorted = [...nudges].sort((a, b) => ORDER[classifyNudge(a.title, a.message)] - ORDER[classifyNudge(b.title, b.message)] || b.created_at.localeCompare(a.created_at));
  const hasHigh = nudges.some((n) => classifyNudge(n.title, n.message) === 'high');

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={quiet ? (quiet === 'call' ? 'Gelen kutusu — aramadasınız, bildirimler burada bekliyor' : 'Gelen kutusu — sessiz saatler') : 'Gelen kutusu'}
        aria-label="Gelen kutusu"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
      >
        {quiet ? <BellOff size={16} /> : <Bell size={16} />}
        {total > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-[#1a0f05] ${hasHigh ? 'bg-danger' : 'bg-[color:var(--accent)]'}`}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
            className="glass-solid absolute right-0 top-11 z-[80] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Bell size={14} className="text-accent" />
              <span className="font-display text-sm font-semibold">Gelen kutusu</span>
              {quiet && (
                <span className="ml-auto flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10.5px] text-ink-faint">
                  <BellOff size={10} /> {quiet === 'call' ? 'Aramadasınız' : 'Sessiz saatler'}
                </span>
              )}
            </div>

            <div className="scroll-thin max-h-[70vh] overflow-y-auto p-2">
              {total === 0 && <div className="px-4 py-8 text-center text-xs text-ink-faint">Her şey yolunda, bekleyen bir şey yok. 🌿</div>}

              {approvals > 0 && (
                <button onClick={() => (setOpen(false), onApprovals())} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]">
                  <ShieldAlert size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 text-[13px]">
                    Onayınızı bekleyen <b>{approvals}</b> iş var
                  </span>
                  <span className="text-[11px] text-ink-faint">Aç →</span>
                </button>
              )}

              {proposals.map((p) => (
                <button key={p.meetingId} onClick={() => (setOpen(false), onMeetings())} className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]">
                  <Headphones size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <b>{p.count}</b> öneri onayınızı bekliyor
                    <span className="block truncate text-[11px] text-ink-faint">{p.title}</span>
                  </span>
                  <span className="text-[11px] text-ink-faint">Aç →</span>
                </button>
              ))}

              <AnimatePresence initial={false}>
                {sorted.map((n) => {
                  const kind = classifyNudge(n.title, n.message);
                  return (
                    <motion.div key={n.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="mb-1 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kind === 'high' ? 'bg-danger' : kind === 'meeting' ? 'bg-ok' : 'bg-accent'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{n.title}</span>
                            <span className="shrink-0 text-[10.5px] text-ink-faint">{relTime(n.created_at)}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-dim">{plain(n.message).slice(0, 220)}</p>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => (setOpen(false), onTalk(n))}
                              className="accent-gradient inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#1a0f05]"
                            >
                              <MessageCircle size={12} /> Konuşalım
                            </button>
                            <button onClick={() => onSeen(n)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-ink-dim hover:text-ink">
                              <Check size={12} /> Okundu
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
