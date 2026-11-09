import { Target } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { usePoll } from '../lib/hooks';
import { fmtTime } from '../lib/time';
import { Empty, Panel, PanelTitle } from './ui';

const DOT: Record<string, string> = { critical: 'bg-[color:var(--danger)]', high: 'bg-[color:var(--warn,#f59e0b)]', medium: 'bg-accent', low: 'bg-ink-faint' };

/** Odak planı: takvimdeki boş zamanlara en önemli işleri yerleştirir. Sadece öneridir; takvime yazılmaz. */
export function FocusPanel({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const plan = usePoll(() => api.focus(day), 120_000, [day]);
  const d = plan.data;
  const hours = d ? `${Math.floor(d.free_minutes / 60)} sa ${d.free_minutes % 60} dk` : '';

  return (
    <Panel className="p-5">
      <PanelTitle
        icon={<Target size={14} />}
        right={
          <div className="flex rounded-lg border border-line p-0.5 text-[11px]">
            {(['today', 'tomorrow'] as const).map((k) => (
              <button key={k} onClick={() => setDay(k)} className={`rounded-md px-2.5 py-1 ${day === k ? 'bg-white/[0.1] text-ink' : 'text-ink-faint hover:text-ink-dim'}`}>
                {k === 'today' ? 'Bugün' : 'Yarın'}
              </button>
            ))}
          </div>
        }
      >
        Odak planı {d && d.free_minutes > 0 && <span className="ml-1 normal-case tracking-normal text-ink-faint">· {hours} boş zaman</span>}
      </PanelTitle>

      {!d ? (
        <div className="py-4 text-center text-xs text-ink-faint">Plan hazırlanıyor…</div>
      ) : !d.items.length ? (
        <Empty icon={<Target size={24} />} title={d.free_minutes ? 'Yerleştirilecek açık iş yok' : 'Boş zaman kalmadı'}>
          {d.free_minutes ? 'Panodaki "Gelen / Yapılacak / Devam" kartları buraya önerilir.' : 'Takvim dolu ya da mesai bitti.'}
        </Empty>
      ) : (
        <div className="space-y-1.5">
          {d.items.map((i) => (
            <button key={i.card_id} onClick={() => onOpenCard(i.card_id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.07]">
              <div className="w-[88px] shrink-0 text-xs tabular-nums text-ink-dim">
                {fmtTime(i.start)}–{fmtTime(i.end)}
              </div>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[i.priority]}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{i.title}</div>
                <div className="truncate text-[11px] text-ink-faint">
                  {i.reason}
                  {i.partial && ' · süre kısa, devamı sonra'}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-ink-faint">{i.minutes} dk</span>
            </button>
          ))}
          {d.overflow.length > 0 && (
            <div className="px-1 pt-1 text-[11px] text-ink-faint">Sığmayanlar: {d.overflow.map((o) => o.title).join(' · ')}</div>
          )}
          <div className="px-1 pt-1 text-[10.5px] text-ink-faint">Bu yalnızca öneridir; takviminize yazılmaz.</div>
        </div>
      )}
    </Panel>
  );
}
