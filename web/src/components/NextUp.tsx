import { motion } from 'motion/react';
import { CalendarClock, FileText, Headphones, Mail, ShieldAlert } from 'lucide-react';
import type { Nudge, Today } from '../lib/api';
import { useNow } from '../lib/hooks';
import { prepFor, untilText } from '../lib/inbox';
import { fmtTime } from '../lib/time';
import { Panel } from './ui';

/** "Şimdi ne yapmalıyım?": sıradaki toplantı (hazırlık notuyla) ve karar bekleyen işler. */
export function NextUp({
  today,
  nudges,
  approvals,
  proposals,
  onTalk,
  onApprovals,
  onMeetings,
}: {
  today: Today | null;
  nudges: Nudge[];
  approvals: number;
  proposals: number;
  onTalk: (n: Nudge) => void;
  onApprovals: () => void;
  onMeetings: () => void;
}) {
  const now = useNow(20_000).getTime();
  const list = (today?.meetings ?? []).map((m) => ({ ...m, ms: Date.parse(m.at) })).filter((m) => Number.isFinite(m.ms)).sort((a, b) => a.ms - b.ms);
  // Başlamasına kadar ya da başladıktan sonraki ilk 15 dk
  const next = list.find((m) => m.ms > now - 15 * 60_000) ?? null;
  const prep = next ? prepFor(nudges, next.title) : null;
  const minsAway = next ? Math.round((next.ms - now) / 60_000) : null;
  const soon = minsAway !== null && minsAway <= 30;
  const reply = today?.awaitingReply ?? 0;
  const chips = [
    approvals > 0 && { icon: ShieldAlert, text: `${approvals} onay`, go: onApprovals },
    proposals > 0 && { icon: Headphones, text: `${proposals} toplantı önerisi`, go: onMeetings },
    reply > 0 && { icon: Mail, text: `${reply} cevap bekleyen`, go: undefined },
  ].filter(Boolean) as { icon: typeof Mail; text: string; go?: () => void }[];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-4">
      <Panel className={`p-4 md:p-5 ${soon ? 'border-[color:var(--ok)]/50' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${soon ? 'bg-[color:var(--ok)]/15 text-ok' : 'bg-white/[0.06] text-accent'}`}>
              <CalendarClock size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">Sıradaki</div>
              {next ? (
                <>
                  <div className="truncate font-display text-lg font-semibold leading-tight">{next.title}</div>
                  <div className="text-xs text-ink-dim">
                    {fmtTime(next.at)} · <span className={soon ? 'font-semibold text-ok' : ''}>{minsAway! <= 0 ? 'başladı' : untilText(next.ms, now)}</span>
                  </div>
                </>
              ) : (
                <div className="font-display text-base text-ink-dim">Bugün başka toplantı yok</div>
              )}
            </div>
          </div>

          {next && (
            <div className="flex items-center gap-2">
              {prep ? (
                <button onClick={() => onTalk(prep)} className="accent-gradient inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#1a0f05]">
                  <FileText size={13} /> Hazırlık notunu oku
                </button>
              ) : (
                <span className="text-[11px] text-ink-faint">{minsAway! > 45 ? 'Hazırlık notu toplantıdan ~30 dk önce gelir' : minsAway! > 0 ? 'Hazırlık notu hazırlanıyor…' : ''}</span>
              )}
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c.text}
                  onClick={c.go}
                  disabled={!c.go}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.05] px-3 py-1.5 text-xs text-ink enabled:hover:border-line-strong"
                >
                  <c.icon size={12} className="text-accent" /> {c.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </motion.div>
  );
}
