import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Brain, History, LayoutDashboard, MessageCircle, Play, RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { Status, Weather } from '../lib/api';
import { WeatherChip } from './WeatherChip';
import { useNow } from '../lib/hooks';
import { setVoiceEnabled, voiceEnabled } from '../lib/speech';
import { fmtTime, greetingOf, relTime, type Phase } from '../lib/time';
import { SunCore } from './SunCore';
import { Button } from './ui';
import { UsageMeter } from './UsageMeter';

export type View = 'board' | 'wiki' | 'memory' | 'history';

interface Props {
  phase: Phase;
  status: Status | null;
  view: View;
  onView: (v: View) => void;
  onRun: (k: 'morning' | 'tracker') => void;
  onChat: () => void;
  onReplayIntro: () => void;
  showSun: boolean;
  weather: Weather | null;
}

const TABS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'board', label: 'Pano', icon: LayoutDashboard },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
  { id: 'memory', label: 'Hafıza', icon: Brain },
  { id: 'history', label: 'Geçmiş', icon: History },
];

export function Header({ phase, status, view, onView, onRun, onChat, onReplayIntro, showSun, weather }: Props) {
  const now = useNow(1000);
  const [voice, setVoice] = useState(voiceEnabled());
  const running = status?.run.running;
  const user = status?.user;

  const hh = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const ss = String(now.getSeconds()).padStart(2, '0');
  const date = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="relative z-20 flex items-center gap-4 px-6 pb-3 pt-4">
      <button onClick={onReplayIntro} title="Karşılamayı tekrar oynat" className="relative shrink-0">
        {showSun ? <SunCore size={58} phase={phase} busy={Boolean(running)} layoutId="gunes-sun" /> : <div style={{ width: 58, height: 58 }} />}
      </button>

      <div className="min-w-0">
        <motion.div
          className="font-display text-lg font-semibold leading-tight"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          {greetingOf(now)}, <span className="accent-text">{user ? `${user.name} ${user.title}` : '…'}</span>
        </motion.div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
          <span className="capitalize">{date}</span>
          <span>·</span>
          <StatusLine status={status} />
        </div>
      </div>

      <nav className="mx-auto hidden items-center gap-1 rounded-2xl border border-line bg-white/[0.04] p-1 backdrop-blur md:flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onView(t.id)}
            className={`relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm transition-colors ${view === t.id ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'}`}
          >
            {view === t.id && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl border border-line-strong bg-white/[0.09]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <t.icon size={15} className="relative" />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3 md:ml-0">
        <div className="hidden text-right lg:block">
          <div className="font-display text-2xl font-light tabular-nums leading-none tracking-tight">
            {hh}
            <span className="ml-0.5 text-sm text-ink-faint">{ss}</span>
          </div>
        </div>

        <WeatherChip weather={weather} />
        <UsageMeter usage={status?.usage ?? null} />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setVoiceEnabled(!voice);
            setVoice(!voice);
          }}
          title={voice ? 'Sesli karşılama açık' : 'Sesli karşılama kapalı'}
          className="h-9 w-9 !px-0"
        >
          {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </Button>

        <Button
          variant="subtle"
          onClick={() =>
            onRun(
              status?.schedule.lastMorning && new Date(status.schedule.lastMorning).toDateString() === new Date().toDateString()
                ? 'tracker'
                : 'morning',
            )
          }
          disabled={Boolean(running)}
          title="Outlook ve Teams'i şimdi tara"
        >
          {running ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
          <span className="hidden sm:inline">{running ? 'Çalışıyor' : 'Şimdi tara'}</span>
        </Button>

        <Button variant="primary" onClick={onChat}>
          <MessageCircle size={16} />
          <span className="hidden sm:inline">Güneş'e yaz</span>
        </Button>
      </div>

      {/* Çalışırken üstte akan ince ışık */}
      <AnimatePresence>
        {running && (
          <motion.div
            className="shimmer absolute inset-x-0 top-0 h-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </header>
  );
}

function StatusLine({ status }: { status: Status | null }) {
  if (!status) return <span>Bağlanıyor…</span>;
  const r = status.run;
  if (r.running)
    return (
      <AnimatePresence mode="wait">
        <motion.span
          key={r.step}
          className="flex items-center gap-1.5 text-accent"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
        >
          <Sparkles size={12} className="animate-pulse" />
          {r.step || 'Hazırlanıyor…'}
        </motion.span>
      </AnimatePresence>
    );
  const s = status.schedule;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${r.lastResult?.status === 'error' ? 'bg-danger' : 'bg-ok'}`} />
      {s.lastCollect ? `Son tarama ${relTime(s.lastCollect)}` : 'Henüz tarama yapılmadı'}
      {s.nextTracker && s.enabled && <span className="hidden xl:inline">· sıradaki ~{fmtTime(s.nextTracker)}</span>}
    </span>
  );
}
