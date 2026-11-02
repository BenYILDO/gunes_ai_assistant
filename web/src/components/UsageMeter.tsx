import { AnimatePresence, motion } from 'motion/react';
import { Gauge, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type Usage, type UsageWindow } from '../lib/api';
import { useNow } from '../lib/hooks';
import { relTime } from '../lib/time';

const tone = (u: number | null) =>
  u === null ? 'rgb(255 255 255 / 0.3)' : u >= 0.85 ? 'var(--danger)' : u >= 0.6 ? 'var(--accent)' : 'var(--ok)';

function countdown(iso: string | null, now: Date) {
  if (!iso) return '—';
  const s = Math.max(0, (new Date(iso).getTime() - now.getTime()) / 1000);
  if (s <= 0) return 'sıfırlandı';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} gün ${h} sa` : h ? `${h} sa ${m} dk` : `${m} dk`;
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

/** Sıfırlanma zamanı geçtiyse kullanım artık bilinmiyor sayılır (yeni pencere başladı). */
const effective = (w: UsageWindow | null, now: Date) =>
  !w ? null : w.resetsAt && new Date(w.resetsAt) < now ? { ...w, utilization: 0 } : w;

function Ring({ value, label, size = 30 }: { value: number | null; label: string; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="relative" style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="3" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone(value)}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, v)) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 4px ${tone(value)})` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-semibold tabular-nums text-ink">
        {value === null ? '–' : Math.round(v * 100)}
      </span>
    </div>
  );
}

export function UsageMeter({ usage }: { usage: Usage | null }) {
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Usage | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const u = local && (!usage || local.updatedAt > usage.updatedAt) ? local : usage;
  const five = effective(u?.fiveHour ?? null, now);
  const week = effective(u?.sevenDay ?? null, now);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const refresh = async () => {
    setBusy(true);
    try {
      setLocal(await api.refreshUsage());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-line bg-white/[0.04] px-2 py-1 hover:bg-white/[0.08]"
        title="Claude kullanımı"
      >
        <Ring value={five?.utilization ?? null} label="5 saatlik kullanım" />
        <Ring value={week?.utilization ?? null} label="Haftalık kullanım" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-2xl border border-line-strong bg-[rgb(14_11_32/0.95)] p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center gap-2">
              <Gauge size={14} className="text-accent" />
              <span className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">Claude kullanımı</span>
              {u?.status === 'rejected' && <span className="ml-auto rounded-md bg-[color:var(--danger)]/20 px-1.5 text-[10px] text-danger">Limit doldu</span>}
            </div>

            {!u ? (
              <p className="text-xs leading-relaxed text-ink-faint">
                Henüz bilgi yok. Güneş'in ilk çalışmasında ya da aşağıdaki butonla öğrenilir.
              </p>
            ) : (
              <div className="space-y-3">
                <WindowRow title="5 saatlik pencere" w={five} now={now} />
                <WindowRow title="Haftalık pencere" w={week} now={now} />
                {Object.entries(u.extra ?? {}).map(([k, w]) => (
                  <WindowRow key={k} title={k.replace(/_/g, ' ')} w={effective(w, now)} now={now} />
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
              <span className="text-[10.5px] text-ink-faint">{u ? `Güncelleme: ${relTime(u.updatedAt)}` : ''}</span>
              <button
                onClick={() => void refresh()}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-dim hover:text-ink disabled:opacity-50"
                title="Çok küçük bir istekle günceller"
              >
                <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Güncelle
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-ink-faint">
              Bilgi, Güneş'in her çalışmasında Claude'un bildirdiği limit durumundan alınır. Sohbet ve Claude Code kullanımınız da bu limitlere dahildir.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WindowRow({ title, w, now }: { title: string; w: UsageWindow | null; now: Date }) {
  const v = w?.utilization ?? null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink">{title}</span>
        <span className="font-display text-sm font-semibold tabular-nums" style={{ color: tone(v) }}>
          {v === null ? '—' : `%${Math.round(v * 100)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tone(v), boxShadow: `0 0 10px ${tone(v)}` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (v ?? 0) * 100)}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-faint">
        <span>Sıfırlanma: {when(w?.resetsAt ?? null)}</span>
        <span>{countdown(w?.resetsAt ?? null, now)}</span>
      </div>
    </div>
  );
}
