import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Briefing } from '../lib/api';
import { fmtDay, fmtTime } from '../lib/time';
import { Markdown } from './Markdown';
import { Panel, PanelTitle } from './ui';

/** Haftalık rapor / haftalık iç gözlem kartı: başlık + açılır içerik */
export function WeeklyCard({ title, icon, item, defaultOpen = false }: { title: string; icon: ReactNode; item: Briefing; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Panel className="p-5">
      <PanelTitle icon={icon}>{title}</PanelTitle>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-ink-faint">
            {fmtDay(item.created_at)} · {fmtTime(item.created_at)}
          </div>
          <div className="mt-0.5 text-sm leading-snug">{item.headline}</div>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="mt-1 text-ink-faint">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 border-t border-line pt-3">
              <Markdown>{item.content}</Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}
