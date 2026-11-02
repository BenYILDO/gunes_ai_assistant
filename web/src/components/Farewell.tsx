import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { CalendarClock, Check, CheckCircle2, Loader2, MoonStar, TrendingUp, Plus, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type DayEndResult, type DaySummary, type Weather } from '../lib/api';
import { speak } from '../lib/speech';
import { fmtTime } from '../lib/time';
import { SunCore } from './SunCore';
import { WEATHER_ICON } from './WeatherChip';

const EASE = [0.16, 1, 0.3, 1] as const;

const STEP_TR: Record<string, string> = {
  jobs: 'Devam eden işler tamamlanıyor',
  wiki: 'Wiki kopyası yazılıyor',
  journal: 'Gün sonu günlüğe işleniyor',
  db: 'Veriler doğrulanıyor',
};
const STEP_KEYS = ['jobs', 'wiki', 'journal', 'db'];

function eveningTip(w: Weather) {
  if (w.kind === 'rain' || w.kind === 'storm' || w.kind === 'drizzle') return 'Dışarıda yağmur var, şemsiyenizi almayı unutmayın.';
  if (w.kind === 'snow') return 'Kar yağıyor, yollar kaygan olabilir; dikkatli gidin.';
  if ((w.rainChance ?? 0) >= 60) return `Akşam yağış ihtimali %${w.rainChance}; şemsiyeyi yanınıza alın.`;
  if (w.temp <= 5) return 'Hava soğuk, sıkı giyinin.';
  if (w.kind === 'fog') return 'Sis var, yolda dikkatli olun.';
  return 'Hava güzel, keyifli bir akşam geçirin.';
}

function CountUp({ value, delay }: { value: number; delay: number }) {
  const mv = useMotionValue(0);
  const v = useTransform(mv, (x) => Math.round(x));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, delay, ease: EASE });
    return () => c.stop();
  }, [mv, value, delay]);
  return <motion.span>{v}</motion.span>;
}

/** Rastgele yıldızlar (gökyüzü karardıkça belirir) */
function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 90 }, () => ({ x: Math.random() * 100, y: Math.random() * 60, s: Math.random() * 1.6 + 0.4, d: 1.5 + Math.random() * 3 })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.4, 0.9] }}
          transition={{ delay: s.d, duration: 3 + s.d, repeat: Infinity, repeatType: 'reverse' }}
        />
      ))}
    </div>
  );
}

interface Props {
  userName: string;
  voice: boolean;
  onCancel: () => void;
}

export function Farewell({ userName, voice, onCancel }: Props) {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [result, setResult] = useState<DayEndResult | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const spoken = useRef(false);
  const hour = new Date().getHours();
  const bye = hour >= 16 || hour < 5 ? 'İyi akşamlar' : 'Hoşça kalın';

  useEffect(() => {
    api.daySummary().then(setSummary).catch(() => undefined);
    api.endDay().then(setResult).catch(() => setResult({ steps: STEP_KEYS.map((k) => ({ key: k, ok: false })), summary: null as never }));
  }, []);

  // Sesli veda
  useEffect(() => {
    if (!summary || spoken.current || !voice) return;
    spoken.current = true;
    const w = summary.weather;
    const parts = [
      `${bye} ${userName}.`,
      summary.closed.length ? `Bugün ${summary.closed.length} işi kapattınız.` : summary.progressed.length ? `Bugün ${summary.progressed.length} işte ilerleme oldu.` : '',
      w ? eveningTip(w) : '',
      summary.meetingsTomorrow.length ? `Yarın ilk toplantınız ${fmtTime(summary.meetingsTomorrow[0].at)}'da.` : '',
      'Yarın görüşmek üzere.',
    ];
    setTimeout(() => speak(parts.filter(Boolean).join(' ')), 2200);
  }, [summary, voice, bye, userName]);

  // Kayıt bitince geri sayım
  useEffect(() => {
    if (!result) return;
    setCountdown(15);
  }, [result]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      void closeApp();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const closeApp = async () => {
    setCountdown(null);
    setClosed(true);
    window.speechSynthesis?.cancel();
    window.close();
    // Edge uygulama penceresi kendini kapatamazsa sunucu kapatır
    setTimeout(() => void api.closeApp().catch(() => undefined), 500);
  };

  const w = summary?.weather ?? null;
  const WIcon = w ? WEATHER_ICON[w.kind] : MoonStar;
  const stepState = (k: string) => result?.steps.find((s) => s.key === k);

  return (
    <motion.div className="fixed inset-0 z-[80] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
      {/* Gün batımından geceye */}
      <motion.div
        className="absolute inset-0"
        initial={{ background: 'linear-gradient(180deg, #2a1240 0%, #8a3a4a 55%, #f08a4b 100%)' }}
        animate={{ background: 'linear-gradient(180deg, #03040c 0%, #0b1033 60%, #1b1a48 100%)' }}
        transition={{ duration: 6, ease: 'easeInOut' }}
      />
      <Stars />
      {/* Ufuk */}
      <div className="absolute inset-x-0 top-[34%] h-px" style={{ background: 'linear-gradient(90deg, transparent, rgb(255 170 110 / 0.7), transparent)' }} />
      {/* Batan güneş (ufkun altı kesilir) */}
      <div className="absolute inset-x-0 top-0 h-[34%] overflow-hidden">
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: 0 }}
          initial={{ y: -40 }}
          animate={{ y: 190 }}
          transition={{ duration: 6, ease: [0.45, 0, 0.55, 1] }}
        >
          <SunCore size={220} phase="dusk" minimal />
        </motion.div>
      </div>
      {/* Ufuk parıltısı sönüyor */}
      <motion.div
        className="absolute left-1/2 top-[34%] h-[40vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgb(255 140 80 / 0.45), transparent)' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 6 }}
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-end px-6 pb-10">
        <motion.h1
          className="text-center font-display text-4xl font-semibold md:text-5xl"
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 1.2, duration: 1.2, ease: EASE }}
        >
          {bye}, <span style={{ color: '#ffb37a' }}>{userName}</span>
        </motion.h1>
        {w && (
          <motion.p
            className="mt-3 flex items-center gap-2 text-center text-lg text-ink-dim"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2, duration: 0.8 }}
          >
            <WIcon size={20} className="text-[#ffb37a]" /> {w.place ?? 'Dışarıda'} {w.temp}°, {w.label.toLocaleLowerCase('tr')} — {eveningTip(w)}
          </motion.p>
        )}

        <motion.div
          className="glass hud-corners mt-6 grid w-[min(920px,100%)] gap-5 rounded-3xl !bg-[rgb(10_10_30/0.6)] p-6 md:grid-cols-[1.1fr_1fr]"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 2.6, duration: 0.9, ease: EASE }}
        >
          {/* Günün özeti */}
          <div>
            <div className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Bugün</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Kapanan', v: summary?.closed.length ?? 0, icon: CheckCircle2, c: 'var(--ok)' },
                { label: 'İlerleyen', v: summary?.progressed.length ?? 0, icon: TrendingUp, c: '#ffb37a' },
                { label: 'Yeni gelen', v: summary?.created.length ?? 0, icon: Plus, c: 'var(--info)' },
              ].map((t, i) => (
                <div key={t.label} className="rounded-xl border border-line bg-white/[0.04] p-3">
                  <t.icon size={14} style={{ color: t.c }} />
                  <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
                    <CountUp value={t.v} delay={2.8 + i * 0.15} />
                  </div>
                  <div className="text-[11px] text-ink-faint">{t.label}</div>
                </div>
              ))}
            </div>
            {summary && summary.closed.length > 0 && (
              <div className="mt-3 space-y-1 text-[12.5px] text-ink-dim">
                {summary.closed.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-start gap-1.5">
                    <Check size={12} className="mt-0.5 shrink-0 text-ok" /> {c.title}
                  </div>
                ))}
              </div>
            )}
            {/* Kayıt adımları */}
            <div className="mt-4 space-y-1.5 border-t border-line pt-3">
              {STEP_KEYS.map((k, i) => {
                const st = stepState(k);
                return (
                  <motion.div key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 3 + i * 0.25 }} className="flex items-center gap-2 text-[12px]">
                    {!st ? <Loader2 size={13} className="animate-spin text-[#ffb37a]" /> : st.ok ? <CheckCircle2 size={13} className="text-ok" /> : <XCircle size={13} className="text-danger" />}
                    <span className={st ? 'text-ink-dim' : 'text-ink'}>{STEP_TR[k]}</span>
                    {st?.note && <span className="text-ink-faint">· {st.note}</span>}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Yarın */}
          <div>
            <div className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Yarın sizi bekleyenler</div>
            {summary?.meetingsTomorrow.length ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-[13px]">
                <CalendarClock size={14} className="text-ok" />
                İlk toplantı <b className="font-display tabular-nums">{fmtTime(summary.meetingsTomorrow[0].at)}</b> «{summary.meetingsTomorrow[0].title}»
                {summary.meetingsTomorrow.length > 1 && <span className="text-ink-faint">+{summary.meetingsTomorrow.length - 1}</span>}
              </div>
            ) : null}
            <div className="space-y-1.5">
              {(summary?.carry ?? []).slice(0, 4).map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 3.2 + i * 0.15 }}
                  className="flex items-start gap-2 text-[13px] text-ink-dim"
                >
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.priority === 'critical' ? 'var(--danger)' : '#ffb37a' }} />
                  <span>
                    {c.title}
                    {c.requested_by && <span className="text-ink-faint"> · {c.requested_by}</span>}
                  </span>
                </motion.div>
              ))}
              {summary && !summary.carry.length && <div className="text-[13px] text-ink-dim">Yarına devreden açık iş yok. 🌙</div>}
            </div>
            {w?.tomorrow && (
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-ink-dim">
                {(() => {
                  const T = WEATHER_ICON[w.tomorrow.kind];
                  return <T size={15} className="text-[#ffb37a]" />;
                })()}
                Yarın: {w.tomorrow.label.toLocaleLowerCase('tr')}, {w.tomorrow.min}°–{w.tomorrow.max}°
                {(w.tomorrow.rainChance ?? 0) >= 50 && <span className="text-ink-faint"> · yağış %{w.tomorrow.rainChance}</span>}
              </div>
            )}
          </div>
        </motion.div>

        <motion.div className="mt-6 flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.4 }}>
          <AnimatePresence mode="wait">
            {closed ? (
              <motion.div key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-ink-dim">
                Kaydedildi. Pencere kapanmazsa güvenle kapatabilirsiniz. Güneş arka planda sabahı bekliyor. ☀️
              </motion.div>
            ) : (
              <motion.div key="btns" className="flex items-center gap-3">
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  disabled={!result}
                  onClick={() => void closeApp()}
                  className="rounded-xl bg-gradient-to-r from-[#ffb37a] to-[#ff7e5f] px-5 py-2.5 text-sm font-semibold text-[#1a0f05] shadow-[0_10px_30px_-8px_rgb(255_140_90/0.7)] disabled:opacity-50"
                >
                  {result ? `Kapat${countdown !== null ? ` (${countdown})` : ''}` : 'Kaydediliyor…'}
                </motion.button>
                <button onClick={onCancel} className="rounded-xl border border-line-strong px-4 py-2.5 text-sm text-ink-dim hover:text-ink">
                  Vazgeç, devam edeyim
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}
