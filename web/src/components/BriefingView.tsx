import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { ArrowRight, CalendarCheck, CalendarClock, Clock, Flame, Hourglass, Mail, Sunrise, Sunset, Umbrella, Users, Volume2, Zap } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { AgendaItem } from '../lib/agenda';
import type { Briefing, Nudge, PendingAction, Status, Suggestion, Today, Weather } from '../lib/api';
import { NextUp } from './NextUp';
import { fmtTime, greetingOf, moodLine, relTime, type Phase } from '../lib/time';
import { Approvals } from './Approvals';
import { FocusPanel } from './FocusPanel';
import { Markdown } from './Markdown';
import { SuggestionsPanel } from './Suggestions';
import { SunCore } from './SunCore';
import { Button, Empty, Panel, PanelTitle } from './ui';
import { WEATHER_ICON } from './WeatherChip';
import { WeeklyCard } from './WeeklyCard';

const EASE = [0.16, 1, 0.3, 1] as const;
const rise = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.08 * i, duration: 0.7, ease: EASE },
});

function CountUp({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const v = useTransform(mv, (x) => Math.round(x));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.4, ease: EASE });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{v}</motion.span>;
}

/** Brifing markdown'ını "## " başlıklarına göre ayrı kartlara böler. */
function splitSections(md: string) {
  const parts = md.split(/^##\s+/m).filter((s) => s.trim());
  return parts.map((p) => {
    const nl = p.indexOf('\n');
    return nl < 0 ? { title: p.trim(), body: '' } : { title: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
  });
}

function weatherTip(w: Weather) {
  if (w.kind === 'rain' || w.kind === 'storm' || w.kind === 'drizzle') return 'Yağış var, şemsiyenizi yanınıza alın.';
  if ((w.rainChance ?? 0) >= 60) return `Bugün yağış ihtimali %${w.rainChance}, şemsiye iyi olur.`;
  if (w.kind === 'snow') return 'Kar yağıyor, yollar kaygan olabilir.';
  if (w.temp <= 5) return 'Hava soğuk, sıkı giyinin.';
  if (w.kind === 'clear' && w.temp >= 25) return 'Güneşli ve sıcak bir gün.';
  return null;
}

interface Props {
  phase: Phase;
  status: Status | null;
  userName: string;
  briefing: Briefing | null;
  updates: Briefing[];
  weekly: Briefing | null;
  today: Today | null;
  agenda: AgendaItem[];
  weather: Weather | null;
  suggestions: Suggestion[];
  actions: PendingAction[];
  onAct: (s: Suggestion, st: 'accepted' | 'dismissed', lesson?: string) => void;
  onResolve: (a: PendingAction, d: 'approve' | 'reject') => void;
  onOpenCard: (id: string) => void;
  onRun: (k: 'morning' | 'backfill') => void;
  onGoBoard: () => void;
  onVoice: () => void;
  /** Gelen kutusundaki (okunmamış) Güneş mesajları: hazırlık notu buradan bulunur */
  nudges: Nudge[];
  proposalCount: number;
  onTalkNudge: (n: Nudge) => void;
  onGoMeetings: () => void;
}


const TILES = [
  { key: 'urgent', label: 'Öncelikli', icon: Zap, tone: 'var(--danger)' },
  { key: 'awaiting_my_reply', label: 'Cevap bekleyen', icon: Mail, tone: 'var(--accent)' },
  { key: 'waiting_on_others', label: 'Beklediğiniz', icon: Clock, tone: 'var(--info)' },
  { key: 'meetings_today', label: 'Toplantı', icon: Users, tone: 'var(--ok)' },
];

export function BriefingView(p: Props) {
  const { briefing, today, weather } = p;
  const sections = useMemo(() => (briefing ? splitSections(briefing.content) : []), [briefing]);
  const now = new Date();
  const headline = briefing?.headline.replace(/^(günaydın|iyi günler|iyi akşamlar|iyi geceler)[^,.!]*[,.!]\s*/i, '').trim();
  const WIcon = weather ? WEATHER_ICON[weather.kind] : null;
  const tip = weather ? weatherTip(weather) : null;
  const meetings = today?.meetings ?? [];
  const nowIso = now.toISOString();

  return (
    <div className="scroll-thin h-full overflow-y-auto pb-8 pr-1">
      {/* Kahraman alanı: selamlama + hava */}
      <motion.section {...rise(0)} className="glass hud-corners relative mb-4 overflow-hidden rounded-3xl p-6 md:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--glow) / 0.35), transparent 70%)' }}
        />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-6">
            <SunCore size={120} phase={p.phase} />
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.22em] text-ink-faint">
                {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <h1 className="mt-1 font-display text-3xl font-semibold leading-tight md:text-4xl">
                {greetingOf(now)}, <span className="accent-text">{p.userName}</span>
              </h1>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
                {headline ? headline.charAt(0).toLocaleUpperCase('tr') + headline.slice(1) : moodLine(now)}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={p.onVoice}
                  className="accent-gradient inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#1a0f05] shadow-[0_8px_24px_-8px_rgb(var(--glow)/0.7)]"
                >
                  <Volume2 size={13} /> Sesli dinle
                </motion.button>
                {briefing && <span className="text-[11px] text-ink-faint">Brifing {relTime(briefing.created_at)} hazırlandı</span>}
              </div>
            </div>
          </div>

          {weather && WIcon && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.7, ease: EASE }}
              className="min-w-[260px] rounded-2xl border border-line bg-white/[0.04] p-4"
            >
              <div className="flex items-center gap-3">
                <motion.div animate={{ y: [0, -4, 0], rotate: [0, 3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
                  <WIcon size={44} className="text-accent" strokeWidth={1.5} />
                </motion.div>
                <div>
                  <div className="font-display text-4xl font-light tabular-nums leading-none">{weather.temp}°</div>
                  <div className="mt-1 text-sm text-ink">{weather.label}</div>
                </div>
                <div className="ml-auto text-right text-[11px] text-ink-faint">
                  <div>{weather.place ?? 'Konumunuz'}</div>
                  {weather.todayMax !== null && (
                    <div className="mt-0.5">
                      ↑{weather.todayMax}° ↓{weather.todayMin}°
                    </div>
                  )}
                  {weather.feelsLike !== null && <div className="mt-0.5">Hissedilen {weather.feelsLike}°</div>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-dim">
                {weather.rainChance !== null && (
                  <span className="flex items-center gap-1">
                    <Umbrella size={11} /> %{weather.rainChance}
                  </span>
                )}
                {weather.sunrise && (
                  <span className="flex items-center gap-1">
                    <Sunrise size={11} /> {fmtTime(weather.sunrise)}
                  </span>
                )}
                {weather.sunset && (
                  <span className="flex items-center gap-1">
                    <Sunset size={11} /> {fmtTime(weather.sunset)}
                  </span>
                )}
              </div>
              {tip && <div className="mt-2 rounded-lg bg-[color:var(--accent)]/10 px-2.5 py-1.5 text-[12px] text-accent">{tip}</div>}
            </motion.div>
          )}
        </div>
      </motion.section>

      <NextUp today={today} nudges={p.nudges} approvals={p.actions.length} proposals={p.proposalCount} onTalk={p.onTalkNudge} onApprovals={() => document.getElementById('onay-paneli')?.scrollIntoView({ behavior: 'smooth' })} onMeetings={p.onGoMeetings} />

      {/* Sayılar */}
      {briefing && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TILES.map((t, i) => (
            <motion.div key={t.key} {...rise(i + 1)} className="glass relative overflow-hidden rounded-2xl p-4">
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-25 blur-2xl" style={{ background: t.tone }} />
              <t.icon size={16} style={{ color: t.tone }} />
              <div className="mt-2 font-display text-3xl font-semibold tabular-nums">
                <CountUp value={Number(briefing.stats?.[t.key] ?? 0)} />
              </div>
              <div className="text-xs text-ink-faint">{t.label}</div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {/* Bugün: toplantı zaman çizelgesi + öncelikler */}
          <motion.div {...rise(5)}>
            <Panel className="p-5">
              <PanelTitle icon={<CalendarClock size={14} />}>Bugün sizi bekleyenler</PanelTitle>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Toplantılar</div>
                  {meetings.length ? (
                    <div className="relative space-y-3 pl-5">
                      <div className="absolute bottom-1 left-[5px] top-1 w-px bg-gradient-to-b from-[color:var(--ok)] to-transparent" />
                      {meetings.map((m, i) => {
                        const past = m.at < nowIso;
                        return (
                          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08 }} className="relative">
                            <span className={`absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 ${past ? 'border-white/20 bg-transparent' : 'border-[color:var(--ok)] bg-[color:var(--ok)]/30 shadow-[0_0_10px_var(--ok)]'}`} />
                            <div className={`font-display text-sm tabular-nums ${past ? 'text-ink-faint' : 'text-ink'}`}>{fmtTime(m.at)}</div>
                            <div className={`text-[13px] ${past ? 'text-ink-faint line-through decoration-white/20' : 'text-ink-dim'}`}>{m.title}</div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-ink-faint">Bugün takvimde toplantı görünmüyor.</div>
                  )}
                </div>
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Öncelikler</div>
                  <div className="space-y-1.5">
                    {(today?.critical ?? []).map((c) => (
                      <button key={c.id} onClick={() => p.onOpenCard(c.id)} className="flex w-full items-start gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-2 text-left hover:border-line-strong">
                        <Flame size={13} className="mt-0.5 shrink-0 text-danger" />
                        <span className="min-w-0 text-[13px] leading-snug">
                          {c.title}
                          {c.requested_by && <span className="text-ink-faint"> · {c.requested_by}</span>}
                        </span>
                      </button>
                    ))}
                    {(today?.due ?? []).filter((c) => !today?.critical.some((x) => x.id === c.id)).map((c) => (
                      <button key={c.id} onClick={() => p.onOpenCard(c.id)} className="flex w-full items-start gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-2 text-left hover:border-line-strong">
                        <Hourglass size={13} className={`mt-0.5 shrink-0 ${c.overdue ? 'text-danger' : 'text-accent'}`} />
                        <span className="min-w-0 text-[13px] leading-snug">
                          {c.title} <span className="text-ink-faint">· {c.overdue ? 'gecikti' : 'bugün'}</span>
                        </span>
                      </button>
                    ))}
                    {!today?.critical.length && !today?.due.length && <div className="text-xs text-ink-faint">Acil ya da bugün tarihli iş yok. 🌿</div>}
                    {p.agenda
                      .filter((a) => a.icon === 'reply' || a.icon === 'review')
                      .map((a) => (
                        <div key={a.text} className="px-1 text-xs text-ink-dim">
                          • {a.text}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </Panel>
          </motion.div>

          <motion.div {...rise(6)}>
            <FocusPanel onOpenCard={p.onOpenCard} />
          </motion.div>

          {/* Brifing bölümleri */}
          {!briefing ? (
            <Panel className="p-6">
              <Empty icon={<Sunrise size={30} />} title="Bugünün brifingi henüz hazır değil">
                Sabah çalışması her iş günü 08:30'da (ya da bilgisayar açıldığında) yapılır.
                <div className="mt-4 flex justify-center gap-2">
                  {!p.status?.schedule.backfillDone && (
                    <Button variant="primary" size="sm" onClick={() => p.onRun('backfill')} disabled={Boolean(p.status?.run.running)}>
                      Geçmişi tara
                    </Button>
                  )}
                  <Button size="sm" onClick={() => p.onRun('morning')} disabled={Boolean(p.status?.run.running)}>
                    Brifing hazırla
                  </Button>
                </div>
              </Empty>
            </Panel>
          ) : (
            <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4">
              {sections.map((s, i) => (
                <motion.div key={s.title + i} {...rise(6 + i)} className="break-inside-avoid">
                  <Panel className="p-5">
                    <h3 className="mb-2 font-display text-[15px] font-semibold">{s.title}</h3>
                    <Markdown>{s.body || '—'}</Markdown>
                  </Panel>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Sağ sütun */}
        <div className="space-y-4">
          <div id="onay-paneli">
            <Approvals items={p.actions} onResolve={p.onResolve} />
          </div>
          <SuggestionsPanel items={p.suggestions} onAct={p.onAct} onOpenCard={p.onOpenCard} />
          {p.weekly && Date.now() - new Date(p.weekly.created_at).getTime() < 7 * 864e5 && (
            <motion.div {...rise(7)}>
              <WeeklyCard title="Haftalık rapor" icon={<CalendarCheck size={14} />} item={p.weekly} />
            </motion.div>
          )}
          {p.updates.length > 0 && (
            <motion.div {...rise(8)}>
              <Panel className="p-5">
                <PanelTitle icon={<Clock size={14} />}>Gün içi gelişmeler</PanelTitle>
                <div className="relative space-y-3 pl-4">
                  <div className="absolute bottom-1 left-[3px] top-1 w-px bg-gradient-to-b from-[color:var(--accent)] to-transparent" />
                  {p.updates.map((u) => (
                    <div key={u.id} className="relative">
                      <span className="absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_10px_rgb(var(--glow))]" />
                      <div className="text-[11px] text-ink-faint">{fmtTime(u.created_at)}</div>
                      <div className="text-sm">{u.headline}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          )}
          <motion.div {...rise(9)}>
            <Button variant="primary" className="w-full" onClick={p.onGoBoard}>
              Panoya geç <ArrowRight size={15} />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
