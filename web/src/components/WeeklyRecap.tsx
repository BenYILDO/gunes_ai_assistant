import { motion } from 'motion/react';
import { Award, CalendarCheck, CheckCircle2, Headphones, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { recapLine, recapWorthShowing, weekRecap, type RecapCard, type RecapMeeting } from '../lib/recap';
import { Panel } from './ui';

const KEY = 'gunes.recapSeen';
const seen = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Pazartesi–Çarşamba günlerinde "geçen hafta neler yaptın" kartı. Kapatılınca o hafta bir daha çıkmaz. */
export function WeeklyRecap({ cards, meetings, achievements }: { cards: RecapCard[]; meetings: RecapMeeting[]; achievements: Record<string, string> }) {
  const [hidden, setHidden] = useState(false);
  const r = useMemo(() => weekRecap(new Date(), cards, meetings, achievements), [cards, meetings, achievements]);
  if (hidden || !recapWorthShowing(r) || seen() === r.weekKey) return null;
  const tiles = [
    { icon: CheckCircle2, n: r.cardsClosed, label: 'kart kapandı' },
    { icon: Headphones, n: r.meetings, label: 'toplantı işlendi' },
    { icon: CalendarCheck, n: r.proposalsApplied, label: 'öneri uygulandı' },
    { icon: Award, n: r.achievements.length, label: 'rozet' },
  ].filter((t) => t.n > 0);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
      <Panel className="relative p-4 md:p-5">
        <button
          aria-label="Haftalık özeti kapat"
          onClick={() => {
            try {
              localStorage.setItem(KEY, r.weekKey);
            } catch {
              /* yoksay */
            }
            setHidden(true);
          }}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-faint hover:bg-white/10 hover:text-ink"
        >
          <X size={14} />
        </button>
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">Geçen hafta</div>
        <p className="mt-1 pr-8 font-display text-[15px] leading-snug">{recapLine(r)} 👏</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tiles.map((t) => (
            <span key={t.label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.05] px-3 py-1.5 text-xs">
              <t.icon size={13} className="text-accent" /> <b className="tabular-nums">{t.n}</b> {t.label}
            </span>
          ))}
        </div>
      </Panel>
    </motion.div>
  );
}
