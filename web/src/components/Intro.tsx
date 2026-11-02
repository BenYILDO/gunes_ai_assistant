import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { greetingOf, moodLine, type Phase } from '../lib/time';
import { speak } from '../lib/speech';
import { SunCore } from './SunCore';

interface Props {
  phase: Phase;
  userName: string;
  userTitle: string;
  headline?: string | null;
  bootLines: string[];
  onDone: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/** Evreye göre güneşin sahneye girişi */
const sunEntrance: Record<Phase, { initial: Record<string, number | string>; animate: Record<string, number | string> }> = {
  dawn: { initial: { y: 260, scale: 0.75, opacity: 0.4 }, animate: { y: 0, scale: 1, opacity: 1 } },
  day: { initial: { scale: 0.15, opacity: 0, filter: 'blur(18px)' }, animate: { scale: 1, opacity: 1, filter: 'blur(0px)' } },
  dusk: { initial: { y: -220, scale: 1.15, opacity: 0 }, animate: { y: 0, scale: 1, opacity: 1 } },
  night: { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 } },
};

function Letters({
  text,
  delay,
  className,
  charClassName = '',
  stagger = 0.045,
}: {
  text: string;
  delay: number;
  className?: string;
  charClassName?: string;
  stagger?: number;
}) {
  return (
    <span className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={`inline-block whitespace-pre ${charClassName}`}
          initial={{ opacity: 0, y: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: delay + i * stagger, duration: 0.7, ease: EASE }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

export function Intro({ phase, userName, userTitle, headline, bootLines, onDone }: Props) {
  const [stage, setStage] = useState(0);
  const hello = `${greetingOf()}, `;
  const name = `${userName} ${userTitle}`;
  const greeting = hello + name;
  // Brifing başlığı zaten selamlamayla başlıyorsa tekrar etme
  const stripped = headline?.replace(/^(günaydın|iyi günler|iyi akşamlar|iyi geceler)[^,.!]*[,.!]\s*/i, '').trim();
  const sub = stripped ? stripped.charAt(0).toLocaleUpperCase('tr') + stripped.slice(1) : moodLine();
  const lines = useMemo(() => bootLines.slice(0, 5), [bootLines]);

  useEffect(() => {
    const times = [600, 2300, 2900 + lines.length * 380];
    const ts = times.map((t, i) => setTimeout(() => setStage(i + 1), t));
    const acc = times[times.length - 1];
    // Selamlama göründükten sonra sesli karşılama
    ts.push(setTimeout(() => speak(`${greeting}. ${sub}`), acc + 500));
    const finish = setTimeout(onDone, acc + 5200);
    const key = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && onDone();
    window.addEventListener('keydown', key);
    return () => {
      ts.forEach(clearTimeout);
      clearTimeout(finish);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ent = sunEntrance[phase];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.9, ease: 'easeInOut' } }}
    >
      {/* Karartma perdesi */}
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.55 }}
        transition={{ duration: 2.4, ease: 'easeOut' }}
      />

      {/* Ufuk çizgisi */}
      <motion.div
        className="absolute left-0 right-0 top-[47%] h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--glow) / 0.9), transparent)' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: [0, 1, 0.35] }}
        transition={{ duration: 2.2, ease: EASE }}
      />
      {/* Işık patlaması */}
      <motion.div
        className="absolute left-1/2 top-[42%] h-[70vmax] w-[70vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(var(--glow) / 0.33) 0%, transparent 60%)' }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, duration: 2.6, ease: EASE }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div initial={ent.initial} animate={ent.animate} transition={{ delay: 0.4, duration: 2, ease: EASE }}>
          <SunCore size={260} phase={phase} reveal layoutId="gunes-sun" />
        </motion.div>

        <div className="mt-6 h-10">
          {stage >= 1 && (
            <Letters text="G Ü N E Ş" delay={0} stagger={0.07} className="font-display text-2xl font-light tracking-[0.5em] text-ink/90 text-glow" />
          )}
        </div>

        {/* Açılış satırları */}
        <div className="mt-4 h-[124px] w-[340px] font-mono text-[12px] text-ink-dim">
          {stage >= 2 &&
            lines.map((l, i) => (
              <motion.div
                key={l}
                className="flex items-center gap-2 py-[3px]"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.36, duration: 0.45 }}
              >
                <motion.span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgb(var(--glow))' }}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.6, 1] }}
                  transition={{ delay: i * 0.36 + 0.2, duration: 0.4 }}
                />
                <span>{l}</span>
              </motion.div>
            ))}
        </div>

        <div className="mt-2 min-h-[110px] text-center">
          {stage >= 3 && (
            <>
              <h1 className="font-display text-4xl font-semibold md:text-5xl">
                <Letters text={hello} delay={0} stagger={0.032} charClassName="text-ink text-glow" />
                <Letters
                  text={name}
                  delay={hello.length * 0.032}
                  stagger={0.032}
                  charClassName="text-glow"
                  className="[&>span]:text-[color:var(--accent)]"
                />
              </h1>
              <motion.p
                className="mx-auto mt-4 max-w-xl text-lg text-ink-dim"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: greeting.length * 0.032 + 0.3, duration: 0.8 }}
              >
                {sub}
              </motion.p>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        <motion.button
          onClick={onDone}
          className="absolute bottom-10 z-10 rounded-full border border-line-strong px-5 py-2 text-sm text-ink-dim backdrop-blur hover:text-ink"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          {stage >= 3 ? 'Başlayalım →' : 'Geç'}
        </motion.button>
      </AnimatePresence>
    </motion.div>
  );
}
