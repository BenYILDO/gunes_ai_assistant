import { motion } from 'motion/react';
import { Activity, CheckCircle2, CircleSlash, Loader2, Play, Terminal, XCircle } from 'lucide-react';
import type { AgentRun, Briefing, Status } from '../lib/api';
import { fmtDay, fmtTime, relTime } from '../lib/time';
import { Markdown } from './Markdown';
import { Button, Empty, Panel, PanelTitle } from './ui';

const KIND_TR: Record<string, string> = { morning: 'Sabah çalışması', tracker: '2 saatlik takip', backfill: 'Geçmiş taraması', wiki: 'Wiki kurulumu', prep: 'Toplantı hazırlığı', followup: 'Toplantı sonrası', weekly: 'Haftalık rapor', reflection: 'Haftalık iç gözlem' };

export function HistoryView({
  runs,
  updates,
  status,
  onRun,
}: {
  runs: AgentRun[];
  updates: Briefing[];
  status: Status | null;
  onRun: (k: 'morning' | 'tracker' | 'backfill' | 'wiki' | 'weekly' | 'reflection') => void;
}) {
  const running = status?.run.running;
  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[1fr_420px]">
      <div className="scroll-thin space-y-4 overflow-y-auto pb-6 pr-1">
        <Panel className="p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <PanelTitle icon={<Play size={14} />}>Elle çalıştır</PanelTitle>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(
              [
                ['morning', 'Sabah brifingi', 'Son 24 saati tarar, brifing yazar'],
                ['tracker', 'Gelişmeleri kontrol et', 'Son taramadan beri gelenlere bakar'],
                ['backfill', 'Geçmişi tara', 'Son 45 günü 7 günlük parçalarla tarar (uzun sürer)'],
                ['wiki', "Wiki'yi kayıtlardan kur", 'Taranmış kayıtlardan proje/kişi sayfaları oluşturur (Outlook’a gitmez)'],
                ['weekly', 'Haftalık rapor', 'Bu haftanın kapanan/ilerleyen/bekleyen işlerinden yönetici özeti'],
                ['reflection', 'Haftalık iç gözlem', 'Hafızayı ayıklar, dersleri ve wiki tutarlılığını gözden geçirir'],
              ] as const
            ).map(([k, t, d]) => (
              <motion.button
                key={k}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                disabled={Boolean(running)}
                onClick={() => onRun(k)}
                className="rounded-xl border border-line bg-white/[0.04] p-3 text-left hover:border-[color:var(--accent)]/50 disabled:opacity-40"
              >
                <div className="text-sm font-medium">{t}</div>
                <div className="mt-0.5 text-[11px] text-ink-faint">{d}</div>
              </motion.button>
            ))}
          </div>
          {status && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-ink-faint sm:grid-cols-4">
              <Info label="Son sabah" value={status.schedule.lastMorning ? `${fmtDay(status.schedule.lastMorning)} ${fmtTime(status.schedule.lastMorning)}` : '—'} />
              <Info label="Son tarama" value={relTime(status.schedule.lastCollect)} />
              <Info label="Geçmiş taraması" value={status.schedule.backfillDone ? fmtDay(status.schedule.backfillDone) : 'Yapılmadı'} />
              <Info label="Veri deposu" value={status.store === 'supabase' ? 'Supabase' : 'Yerel dosya'} />
            </div>
          )}
        </Panel>

        {running && status && (
          <Panel className="p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <PanelTitle icon={<Terminal size={14} />}>Canlı akış — {KIND_TR[running] ?? running}</PanelTitle>
            <div className="scroll-thin max-h-60 space-y-1 overflow-y-auto font-mono text-[11.5px]">
              {status.run.log.map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                  <span className="text-ink-faint">{fmtTime(l.at)}</span>
                  <span className="text-ink-dim">{l.text}</span>
                </motion.div>
              ))}
            </div>
          </Panel>
        )}

        <Panel className="p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <PanelTitle icon={<Activity size={14} />}>Çalışmalar</PanelTitle>
          {!runs.length ? (
            <Empty icon={<Activity size={26} />} title="Henüz çalışma yok" />
          ) : (
            <div className="divide-y divide-white/5">
              {runs.map((r) => {
                const dur = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
                return (
                  <div key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                    {r.status === 'ok' && <CheckCircle2 size={15} className="text-ok" />}
                    {r.status === 'error' && <XCircle size={15} className="text-danger" />}
                    {r.status === 'skipped' && <CircleSlash size={15} className="text-ink-faint" />}
                    {r.status === 'running' && <Loader2 size={15} className="animate-spin text-accent" />}
                    <div className="min-w-0 flex-1">
                      <div>{KIND_TR[r.kind] ?? r.kind}</div>
                      {r.error && <div className="truncate text-[11px] text-danger/80" title={r.error}>{r.error}</div>}
                      {r.status === 'skipped' && <div className="text-[11px] text-ink-faint">Yeni gelişme yoktu</div>}
                    </div>
                    <div className="text-right text-[11px] text-ink-faint">
                      <div>
                        {fmtDay(r.started_at)} {fmtTime(r.started_at)}
                      </div>
                      {dur !== null && <div>{dur < 60 ? `${dur} sn` : `${Math.round(dur / 60)} dk`}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="flex min-h-0 flex-col p-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
        <PanelTitle icon={<Activity size={14} />}>Gün içi güncellemeler</PanelTitle>
        {!updates.length ? (
          <Empty icon={<Activity size={26} />} title="Güncelleme yok">
            2 saatlik takipte kayda değer bir gelişme olursa burada özetlerim.
          </Empty>
        ) : (
          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto pr-1">
            {updates.map((u) => (
              <div key={u.id} className="rounded-xl border border-line bg-white/[0.03] p-3">
                <div className="text-[11px] text-ink-faint">
                  {fmtDay(u.created_at)} · {fmtTime(u.created_at)}
                </div>
                <div className="mb-1 font-medium">{u.headline}</div>
                <Markdown>{u.content}</Markdown>
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => onRun('tracker')} disabled={Boolean(running)}>
          Şimdi kontrol et
        </Button>
      </Panel>
    </div>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-line bg-white/[0.03] px-2.5 py-2">
    <div className="text-[10px] uppercase tracking-wider">{label}</div>
    <div className="mt-0.5 text-ink">{value}</div>
  </div>
);
