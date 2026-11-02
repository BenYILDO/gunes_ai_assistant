import { AnimatePresence, motion, useAnimationFrame, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WeatherKind } from '../lib/api';
import type { Phase } from '../lib/time';

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  tw: number;
}

type Mode = 'stars' | 'embers' | 'rain' | 'drizzle' | 'snow' | 'none';

function modeFor(phase: Phase, weather: WeatherKind | null): Mode {
  if (weather === 'rain' || weather === 'storm') return 'rain';
  if (weather === 'drizzle') return 'drizzle';
  if (weather === 'snow') return 'snow';
  if (weather === 'overcast' || weather === 'fog') return 'none';
  return phase === 'night' ? 'stars' : 'embers';
}

/** Bulut yoğunluğu (0-1) */
const CLOUDS: Record<WeatherKind, number> = {
  clear: 0,
  partly: 0.35,
  clouds: 0.6,
  overcast: 0.9,
  fog: 0.5,
  drizzle: 0.75,
  rain: 0.9,
  snow: 0.8,
  storm: 1,
};

function spawn(mode: Mode, w: number, h: number, fresh = true): Particle {
  const y = fresh ? Math.random() * h : -20;
  switch (mode) {
    case 'rain':
      return { x: Math.random() * (w + 200) - 100, y, r: 14 + Math.random() * 10, vx: -1.6, vy: 11 + Math.random() * 5, a: 0.18 + Math.random() * 0.25, tw: 0 };
    case 'drizzle':
      return { x: Math.random() * (w + 100) - 50, y, r: 7 + Math.random() * 5, vx: -0.6, vy: 6 + Math.random() * 3, a: 0.12 + Math.random() * 0.18, tw: 0 };
    case 'snow':
      return { x: Math.random() * w, y, r: 0.8 + Math.random() * 2, vx: 0, vy: 0.5 + Math.random() * 0.9, a: 0.3 + Math.random() * 0.45, tw: Math.random() * Math.PI * 2 };
    case 'stars':
      return { x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.2, vx: 0, vy: 0, a: Math.random() * 0.6 + 0.2, tw: Math.random() * Math.PI * 2 };
    default:
      return { x: Math.random() * w, y: fresh ? Math.random() * h : h + 10, r: Math.random() * 1.8 + 0.4, vx: (Math.random() - 0.5) * 0.08, vy: -(Math.random() * 0.18 + 0.04), a: Math.random() * 0.6 + 0.2, tw: Math.random() * Math.PI * 2 };
  }
}

/** Arka plan: saate ve havaya göre değişen gökyüzü + kare kare çizilen parçacıklar. */
export function Sky({ phase, busy, weather }: { phase: Phase; busy?: boolean; weather?: WeatherKind | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const glow = useRef('255,179,71');
  const reduce = useReducedMotion();
  const kind = weather ?? null;
  const mode = modeFor(phase, kind);
  const cloud = kind ? CLOUDS[kind] : 0;

  useEffect(() => {
    document.documentElement.dataset.weather = kind ?? 'clear';
  }, [kind]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      glow.current = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim().replace(/\s+/g, ',');
    }, 50);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const count = { stars: 140, embers: 55, rain: 220, drizzle: 110, snow: 160, none: 0 }[mode];
    parts.current = Array.from({ length: count }, () => spawn(mode, w, h));
    return () => clearTimeout(t);
  }, [mode, phase]);

  useAnimationFrame((time, delta) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || reduce) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const k = Math.min(delta, 50) / 16.7;
    const boost = busy && (mode === 'embers' || mode === 'stars') ? 2.4 : 1;
    ctx.clearRect(0, 0, w, h);
    ctx.shadowBlur = 0;

    if (mode === 'rain' || mode === 'drizzle') {
      ctx.lineCap = 'round';
      for (const p of parts.current) {
        p.x += p.vx * k;
        p.y += p.vy * k;
        if (p.y > h + 20) Object.assign(p, spawn(mode, w, h, false));
        ctx.strokeStyle = `rgba(200,220,255,${p.a})`;
        ctx.lineWidth = mode === 'rain' ? 1.1 : 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * (p.r / p.vy) * 1.6, p.y + p.r);
        ctx.stroke();
      }
      return;
    }

    for (const p of parts.current) {
      if (mode === 'snow') {
        p.y += p.vy * k;
        p.x += Math.sin(time / 1200 + p.tw) * 0.35 * k;
        if (p.y > h + 10) Object.assign(p, spawn(mode, w, h, false));
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      p.x += p.vx * k * boost;
      p.y += p.vy * k * boost;
      if (p.y < -10) Object.assign(p, spawn(mode, w, h, false));
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      const night = mode === 'stars';
      const tw = night ? 0.5 + 0.5 * Math.sin(time / 900 + p.tw) : 0.75 + 0.25 * Math.sin(time / 1400 + p.tw);
      const alpha = p.a * tw * (night ? 1 - cloud * 0.8 : Math.min(1, (h - p.y) / h + 0.25));
      ctx.beginPath();
      ctx.fillStyle = night ? `rgba(230,236,255,${alpha})` : `rgba(${glow.current},${alpha})`;
      if (!night) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${glow.current},${alpha})`;
      }
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return (
    <div className="sky grain pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Bulutlu/yağışlı havalarda gökyüzü kararır ve solar */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: cloud * (phase === 'night' ? 0.35 : 0.55) }}
        transition={{ duration: 2.5 }}
        style={{ background: 'linear-gradient(180deg, rgb(52 58 78 / 0.9), rgb(30 34 48 / 0.6))', mixBlendMode: 'multiply' }}
      />
      <Clouds density={cloud} phase={phase} />
      {kind === 'fog' && <Fog />}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {kind === 'storm' && <Lightning />}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-[38vh]"
        animate={{ opacity: 1 - cloud * 0.6 }}
        transition={{ duration: 2.5 }}
        style={{ background: 'radial-gradient(60% 100% at 50% 100%, rgb(var(--glow) / 0.16), transparent 70%)' }}
      />
    </div>
  );
}

/** Yavaşça kayan, bulanık bulut kümeleri */
function Clouds({ density, phase }: { density: number; phase: Phase }) {
  const reduce = useReducedMotion();
  const clouds = useMemo(
    () =>
      Array.from({ length: Math.round(density * 9) }, (_, i) => ({
        id: i,
        top: 2 + Math.random() * 45,
        w: 380 + Math.random() * 520,
        h: 120 + Math.random() * 110,
        dur: 90 + Math.random() * 120,
        delay: -Math.random() * 200,
        o: 0.25 + Math.random() * 0.35,
      })),
    [density],
  );
  const tint = phase === 'night' ? '120 130 160' : phase === 'dusk' ? '210 170 190' : '225 230 240';
  return (
    <AnimatePresence>
      {clouds.map((c) => (
        <motion.div
          key={`${density}-${c.id}`}
          className="absolute rounded-full"
          style={{
            top: `${c.top}%`,
            width: c.w,
            height: c.h,
            filter: 'blur(38px)',
            background: `radial-gradient(closest-side, rgb(${tint} / ${c.o * density}), transparent)`,
          }}
          initial={{ x: '-40vw', opacity: 0 }}
          animate={reduce ? { x: '20vw', opacity: 1 } : { x: ['-40vw', '120vw'], opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ x: { duration: c.dur, repeat: Infinity, ease: 'linear', delay: c.delay }, opacity: { duration: 3 } }}
        />
      ))}
    </AnimatePresence>
  );
}

function Fog() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-x-[-30%] h-[30vh]"
          style={{ top: `${25 + i * 22}%`, filter: 'blur(30px)', background: 'linear-gradient(90deg, transparent, rgb(220 225 235 / 0.16), transparent)' }}
          animate={{ x: ['-10%', '10%', '-10%'] }}
          transition={{ duration: 40 + i * 15, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </>
  );
}

/** Fırtınada rastgele aralıklarla şimşek çakması */
function Lightning() {
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setFlash((f) => f + 1);
        loop();
      }, 6000 + Math.random() * 9000);
    };
    loop();
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div
      key={flash}
      className="absolute inset-0 bg-white"
      initial={{ opacity: 0 }}
      animate={flash ? { opacity: [0, 0.55, 0.05, 0.35, 0] } : { opacity: 0 }}
      transition={{ duration: 0.9, times: [0, 0.08, 0.2, 0.3, 1] }}
    />
  );
}
