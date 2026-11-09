import { motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PetItemId, PetPlaced } from '../lib/api';

const BOTTOM = 56;
/** Yerdeki eşyaların alt kenarı: kedinin ayak hizası */
const groundBottom = () => window.innerHeight - BOTTOM + 2;
const SNAP = 90;

/** Eşya boyutları (taban, ölçeklenmeden) */
export const ITEM_SIZE: Record<'bowl' | 'ball' | 'cushion' | 'house', [number, number]> = {
  bowl: [56, 36],
  ball: [30, 30],
  cushion: [124, 38],
  house: [220, 150],
};
export const itemScale = (scale: number) => 0.5 + 0.5 * scale;

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

// ---------- çizimler
function BowlSvg({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 56 36" width="100%" height="100%" style={{ overflow: 'visible', pointerEvents: 'none' }}><g pointerEvents="visiblePainted">
      <ellipse cx="28" cy="33" rx="22" ry="2.6" fill="#000" opacity="0.18" />
      {full && (
        <>
          <ellipse cx="28" cy="13" rx="18" ry="6" fill="#ffd9a0" />
          <circle cx="18" cy="9.5" r="3" fill="#b8651e" />
          <circle cx="28" cy="8" r="3" fill="#c97426" />
          <circle cx="38" cy="9.5" r="3" fill="#b8651e" />
        </>
      )}
      <path d="M7 14 H49 L44 29 Q43 32 40 32 H16 Q13 32 12 29 Z" fill="#e0516b" stroke="#a02a44" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 19 H45" stroke="#fff" strokeWidth="1.8" opacity="0.5" strokeLinecap="round" />
      <ellipse cx="28" cy="14" rx="21" ry="3.6" fill="none" stroke="#a02a44" strokeWidth="1.4" />
    </g></svg>
  );
}
function BallSvg() {
  return (
    <svg viewBox="0 0 30 30" width="100%" height="100%" style={{ pointerEvents: 'none' }}><g pointerEvents="visiblePainted">
      <circle cx="15" cy="15" r="14" fill="#9b7bf0" stroke="#5b43b8" strokeWidth="1.4" />
      <path d="M4 12 Q15 4 26 12 M3 18 Q15 10 27 18 M6 24 Q15 17 24 24 M9 5 Q18 15 10 26 M20 4 Q12 15 21 26" fill="none" stroke="#d6c8ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
    </g></svg>
  );
}
function CushionSvg() {
  return (
    <svg viewBox="0 0 124 38" width="100%" height="100%" style={{ overflow: 'visible', pointerEvents: 'none' }}><g pointerEvents="visiblePainted">
      <ellipse cx="62" cy="36" rx="54" ry="2.8" fill="#000" opacity="0.18" />
      <path d="M8 28 Q4 14 18 10 Q62 2 106 10 Q120 14 116 28 Q112 36 100 36 H24 Q12 36 8 28 Z" fill="#7aa7f0" stroke="#3f68b8" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M22 14 Q62 7 102 14" fill="none" stroke="#b8d2ff" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
      <path d="M62 8 V3 M62 36 V32" stroke="#3f68b8" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="62" cy="3" r="2.6" fill="#ffd45a" stroke="#c9a01c" />
    </g></svg>
  );
}
function HouseSvg() {
  return (
    <svg viewBox="0 0 220 150" width="100%" height="100%" style={{ overflow: 'visible', pointerEvents: 'none' }}><g pointerEvents="visiblePainted">
      <ellipse cx="110" cy="148" rx="100" ry="3.6" fill="#000" opacity="0.2" />
      {/* duvarlar ve çatı: kapı deliği evenodd ile açıktır (içeriden kedi görünür) */}
      <path
        fillRule="evenodd"
        d="M14 72 L110 6 L206 72 L206 146 L14 146 Z M62 146 L62 100 Q62 66 110 66 Q158 66 158 100 L158 146 Z"
        fill="#d99a63"
        stroke="#8a5632"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 76 L110 2 L212 76 L196 80 L110 20 L24 80 Z" fill="#b5502f" stroke="#7a2f18" strokeWidth="2" strokeLinejoin="round" />
      <path d="M34 120 H52 M168 120 H186 M34 102 H48 M172 102 H186" stroke="#a8703f" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      <path d="M62 146 L62 100 Q62 66 110 66 Q158 66 158 100 L158 146" fill="none" stroke="#8a5632" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="110" cy="40" r="7" fill="#ffe7a8" stroke="#7a2f18" strokeWidth="1.6" />
    </g></svg>
  );
}

// ---------- sürüklenebilir eşya (mama kabı, minder, ev)
const ITEM_LABEL: Record<string, string> = {
  bowl: 'Mama kabı',
  cushion: 'Minder',
  house: 'Ev',
};

function Item({
  id,
  w,
  h,
  x,
  b,
  onMoved,
  onTap,
  children,
}: {
  id: PetItemId;
  w: number;
  h: number;
  x: number;
  b: number;
  onMoved: (id: PetItemId, x: number, b: number) => void;
  onTap?: () => void;
  children: ReactNode;
}) {
  const vp = useViewport();
  const root = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const [pos, setPos] = useState({ x, b });
  useEffect(() => setPos({ x, b }), [x, b]);
  const onGround = Math.abs(pos.b * vp.h - (BOTTOM - 2)) < 14;
  const bottomY = onGround ? groundBottom() : vp.h - pos.b * vp.h;
  const left = Math.min(Math.max(0, pos.x * vp.w - w / 2), Math.max(0, vp.w - w));
  const top = Math.max(0, bottomY - h);
  return (
    <motion.div
      ref={root}
      data-pet-item={id}
      role={onTap ? 'button' : 'img'}
      aria-label={`${ITEM_LABEL[id] ?? id}${id === 'bowl' ? ' — hayvanı beslemek için tıklayın' : ''} (taşımak için sürükleyin)`}
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{ left: -left, right: vp.w - left - w, top: -top, bottom: vp.h - top - h }}
      style={{ x: mx, y: my, position: 'fixed', left, top, width: w, height: h, pointerEvents: 'none' }}
      whileDrag={{ scale: 1.06, zIndex: 50 }}
      onTap={onTap}
      onDragEnd={() => {
        const r = root.current?.getBoundingClientRect();
        if (!r) return;
        const nearGround = Math.abs(window.innerHeight - r.bottom - (BOTTOM - 2)) < SNAP;
        const nb = nearGround ? (BOTTOM - 2) / window.innerHeight : (window.innerHeight - r.bottom) / window.innerHeight;
        const nx = (r.left + w / 2) / window.innerWidth;
        setPos({ x: nx, b: nb });
        mx.set(0);
        my.set(0);
        onMoved(id, nx, nb);
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>{children}</div>
    </motion.div>
  );
}

// ---------- yün yumağı: fırlatılır, zıplar, yuvarlanır; kedi peşinden koşar
function BallItem({ x, b, size, onMoved }: { x: number; b: number; size: number; onMoved: (id: PetItemId, x: number, b: number) => void }) {
  const vp = useViewport();
  const el = useRef<HTMLDivElement>(null);
  const R = size / 2;
  const s = useRef({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, active: false, drag: false, raf: 0, last: 0, samples: [] as { t: number; x: number; y: number }[], t0: 0, moved: 0 });
  const floor = () => groundBottom() - R;

  const apply = () => {
    if (el.current) el.current.style.transform = `translate(${s.current.x - R}px, ${s.current.y - R}px) rotate(${s.current.rot}rad)`;
  };

  const settle = () => {
    const c = s.current;
    const nb = (window.innerHeight - (c.y + R)) / window.innerHeight;
    onMoved('ball', c.x / window.innerWidth, Math.abs(c.y - floor()) < 4 ? (BOTTOM - 2) / window.innerHeight : nb);
  };

  const step = (now: number) => {
    const c = s.current;
    const dt = Math.min(0.033, (now - c.last) / 1000);
    c.last = now;
    c.vy += 2200 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += (c.vx * dt) / R;
    const f = floor();
    if (c.y > f) {
      c.y = f;
      c.vy = c.vy > 180 ? -c.vy * 0.55 : 0;
      c.vx *= Math.pow(0.3, dt);
    }
    if (c.x < R) ((c.x = R), (c.vx = Math.abs(c.vx) * 0.6));
    if (c.x > window.innerWidth - R) ((c.x = window.innerWidth - R), (c.vx = -Math.abs(c.vx) * 0.6));
    if (c.y < R) ((c.y = R), (c.vy = Math.abs(c.vy) * 0.5));
    apply();
    if (Math.abs(c.vx) < 8 && Math.abs(c.vy) < 25 && c.y >= f - 0.5) {
      c.vx = 0;
      c.vy = 0;
      c.active = false;
      settle();
      return;
    }
    c.raf = requestAnimationFrame(step);
  };
  const start = () => {
    const c = s.current;
    if (c.active) return;
    c.active = true;
    c.last = performance.now();
    c.raf = requestAnimationFrame(step);
  };

  // konumu sunucudan (ya da yeniden boyutlandırmadan) al
  useEffect(() => {
    const c = s.current;
    if (c.active || c.drag) return;
    c.x = Math.min(Math.max(R, x * vp.w), vp.w - R);
    const ground = Math.abs(b * vp.h - (BOTTOM - 2)) < 14;
    c.y = ground ? floor() : vp.h - b * vp.h - R;
    apply();
    // havada bırakılmışsa düşsün
    if (!ground && c.y < floor() - 2) {
      c.vx = 0;
      c.vy = 0;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, b, vp.w, vp.h]);

  // kedinin vuruşu
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ dir: number; power: number }>).detail;
      if (s.current.drag) return;
      s.current.vx += (d?.dir ?? 1) * (d?.power ?? 420);
      s.current.vy -= 380;
      start();
    };
    window.addEventListener('pet-bat', on);
    return () => {
      window.removeEventListener('pet-bat', on);
      cancelAnimationFrame(s.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={el}
      data-pet-item="ball"
      role="img"
      aria-label="Yün yumağı (fırlatmak için sürükleyip bırakın)"
      style={{ position: 'fixed', left: 0, top: 0, width: size, height: size, pointerEvents: 'auto', touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => {
        const c = s.current;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        cancelAnimationFrame(c.raf);
        c.active = false;
        c.drag = true;
        c.samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
        c.t0 = performance.now();
        c.moved = 0;
      }}
      onPointerMove={(e) => {
        const c = s.current;
        if (!c.drag) return;
        const nx = Math.min(Math.max(R, e.clientX), window.innerWidth - R);
        const ny = Math.min(Math.max(R, e.clientY), floor());
        c.moved += Math.hypot(nx - c.x, ny - c.y);
        c.x = nx;
        c.y = ny;
        c.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        if (c.samples.length > 8) c.samples.shift();
        apply();
      }}
      onPointerUp={() => {
        const c = s.current;
        if (!c.drag) return;
        c.drag = false;
        const now = performance.now();
        const recent = c.samples.filter((p) => now - p.t < 120);
        const a = recent[0];
        const z = recent[recent.length - 1];
        if (c.moved < 6 && now - c.t0 < 300) {
          // dokunma: küçük bir zıplama
          c.vx = (Math.random() < 0.5 ? -1 : 1) * 220;
          c.vy = -560;
        } else if (a && z && z.t > a.t) {
          const k = 1000 / (z.t - a.t);
          c.vx = Math.max(-2600, Math.min(2600, (z.x - a.x) * k));
          c.vy = Math.max(-2600, Math.min(2600, (z.y - a.y) * k));
        }
        start();
        window.dispatchEvent(new CustomEvent('pet-ball-thrown'));
      }}
    >
      <BallSvg />
    </div>
  );
}

/** Ekrandaki eşyalar: mama kabı, minder, ev (sürüklenir) ve yün yumağı (fırlatılır). Hayvan bunlarla etkileşir. */
export function PetWorld({
  placed,
  fedToday,
  scale,
  onMoved,
  onBowl,
}: {
  placed: PetPlaced[];
  fedToday: boolean;
  scale: number;
  onMoved: (id: PetItemId, x: number, b: number) => void;
  onBowl: () => void;
}) {
  const k = itemScale(scale);
  return (
    <div className="pointer-events-none fixed inset-0 z-[44]" aria-hidden={false}>
      {placed.map((p) => {
        if (p.itemId === 'ball') return <BallItem key="ball" x={p.x} b={p.b} size={ITEM_SIZE.ball[0] * k} onMoved={onMoved} />;
        if (p.itemId !== 'bowl' && p.itemId !== 'cushion' && p.itemId !== 'house') return null;
        const [bw, bh] = ITEM_SIZE[p.itemId];
        return (
          <Item key={p.itemId} id={p.itemId} w={bw * k} h={bh * k} x={p.x} b={p.b} onMoved={onMoved} onTap={p.itemId === 'bowl' ? onBowl : p.itemId === 'house' ? () => window.dispatchEvent(new CustomEvent('pet-knock')) : undefined}>
            {p.itemId === 'bowl' ? <BowlSvg full={!fedToday} /> : p.itemId === 'cushion' ? <CushionSvg /> : <HouseSvg />}
          </Item>
        );
      })}
    </div>
  );
}
