import { useAnimationFrame, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
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

/** Arka plan: saate göre değişen gökyüzü + kare kare (requestAnimationFrame) çizilen parçacıklar. */
export function Sky({ phase, busy }: { phase: Phase; busy?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const glow = useRef('255,179,71');
  const reduce = useReducedMotion();

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
    // Tema değişkenleri geçiş yaptıktan sonra rengi oku
    const t = setTimeout(() => {
      glow.current = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim().replace(/\s+/g, ',');
    }, 50);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const night = phase === 'night';
    const count = night ? 140 : 55;
    parts.current = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: night ? Math.random() * 1.2 + 0.2 : Math.random() * 1.8 + 0.4,
      vx: night ? 0 : (Math.random() - 0.5) * 0.08,
      vy: night ? 0 : -(Math.random() * 0.18 + 0.04),
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * Math.PI * 2,
    }));
    return () => clearTimeout(t);
  }, [phase]);

  useAnimationFrame((time, delta) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || reduce) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const night = phase === 'night';
    const k = Math.min(delta, 50) / 16.7;
    const boost = busy ? 2.4 : 1;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts.current) {
      p.x += p.vx * k * boost;
      p.y += p.vy * k * boost;
      if (p.y < -10) {
        p.y = h + 10;
        p.x = Math.random() * w;
      }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      const tw = night ? 0.5 + 0.5 * Math.sin(time / 900 + p.tw) : 0.75 + 0.25 * Math.sin(time / 1400 + p.tw);
      const alpha = p.a * tw * (night ? 1 : Math.min(1, (h - p.y) / h + 0.25));
      ctx.beginPath();
      ctx.fillStyle = night ? `rgba(230,236,255,${alpha})` : `rgba(${glow.current},${alpha})`;
      if (!night) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${glow.current},${alpha})`;
      } else ctx.shadowBlur = 0;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return (
    <div className="sky grain pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {/* Ufuk çizgisi parıltısı */}
      <div
        className="absolute inset-x-0 bottom-0 h-[38vh]"
        style={{ background: 'radial-gradient(60% 100% at 50% 100%, rgb(var(--glow) / 0.16), transparent 70%)' }}
      />
    </div>
  );
}
