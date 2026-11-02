import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { ChevronDown, Clock, History as HistoryIcon, Mail, Sun, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Briefing, Status } from '../lib/api';
import { fmtTime, relTime } from '../lib/time';
import { Markdown } from './Markdown';
import { Button, Empty, Panel, PanelTitle } from './ui';

function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{rounded}</motion.span>;
}

const TILES = [
  { key: 'urgent', label: 'Öncelikli', icon: Zap, tone: 'var(--danger)' },
  { key: 'awaiting_my_reply', label: 'Cevapla', icon: Mail, tone: 'var(--accent)' },
  { key: 'waiting_on_others', label: 'Bekliyor', icon: Clock, tone: 'var(--info)' },
  { key: 'meetings_today', label: 'Toplantı', icon: Users, tone: 'var(--ok)' },
];

export function BriefingPanel({
  briefing,
  updates,
  status,
  onRun,
}: {
  briefing: Briefing | null;
  updates: Briefing[];
  status: Status | null;
  onRun: (k: 'morning' | 'backfill') => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Panel
      className="p-5"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <PanelTitle
        icon={<Sun size={14} />}
        right={briefing && <span className="text-[11px] text-ink-faint">{relTime(briefing.created_at)}</span>}
      >
        Sabah brifingi
      </PanelTitle>

      {!briefing ? (
        <Empty icon={<Sun size={30} />} title="Henüz brifing yok">
          {status?.schedule.backfillDone
            ? 'Sabah çalışması her iş günü 08:30\'da (ya da bilgisayar açıldığında) yapılır.'
            : 'Başlamak için önce geçmiş 45 günü taratın; Güneş panoyu ve hafızasını kursun.'}
          <div className="mt-4 flex justify-center gap-2">
            {!status?.schedule.backfillDone && (
              <Button variant="primary" size="sm" onClick={() => onRun('backfill')} disabled={Boolean(status?.run.running)}>
                Geçmişi tara
              </Button>
            )}
            <Button size="sm" onClick={() => onRun('morning')} disabled={Boolean(status?.run.running)}>
              Brifing hazırla
            </Button>
          </div>
        </Empty>
      ) : (
        <>
          <motion.h2
            key={briefing.id}
            className="font-display text-[17px] font-semibold leading-snug text-ink"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {briefing.headline}
          </motion.h2>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {TILES.map((t, i) => (
              <motion.div
                key={t.key}
                className="relative overflow-hidden rounded-xl border border-line bg-white/[0.04] px-2.5 py-2"
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.25 + i * 0.08, type: 'spring', stiffness: 260, damping: 22 }}
              >
                <div
                  className="absolute -right-3 -top-3 h-10 w-10 rounded-full opacity-30 blur-xl"
                  style={{ background: t.tone }}
                />
                <t.icon size={13} style={{ color: t.tone }} />
                <div className="mt-1 font-display text-xl font-semibold tabular-nums leading-none">
                  <CountUp value={Number(briefing.stats?.[t.key] ?? 0)} />
                </div>
                <div className="mt-1 truncate text-[10px] text-ink-faint">{t.label}</div>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => setOpen(!open)}
            className="mt-4 flex w-full items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink-dim"
          >
            Ayrıntılar
            <motion.span animate={{ rotate: open ? 180 : 0 }}>
              <ChevronDown size={13} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-2">
                  <Markdown>{briefing.content}</Markdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {updates.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            <HistoryIcon size={12} /> Gün içi gelişmeler
          </div>
          <div className="relative space-y-3 pl-4">
            <div className="absolute bottom-1 left-[3px] top-1 w-px bg-gradient-to-b from-[color:var(--accent)] to-transparent" />
            {updates.slice(0, 3).map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="relative"
              >
                <span className="absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_10px_rgb(var(--glow))]" />
                <div className="text-[11px] text-ink-faint">{fmtTime(u.created_at)}</div>
                <div className="text-sm text-ink">{u.headline}</div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
