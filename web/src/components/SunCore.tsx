import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import type { Phase } from '../lib/time';

interface Props {
  size: number;
  phase: Phase;
  /** Ajan çalışırken halkalar hızlanır, çekirdek nabız gibi atar */
  busy?: boolean;
  /** Intro'da halkaların sırayla belirmesi */
  reveal?: boolean;
  /** HUD halkalarını gizle (küçük avatar kullanımları) */
  minimal?: boolean;
  layoutId?: string;
  className?: string;
}

const TICKS = Array.from({ length: 72 }, (_, i) => i);
const RAYS = Array.from({ length: 12 }, (_, i) => i);

export function SunCore({ size, phase, busy, reveal, minimal, layoutId, className }: Props) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const night = phase === 'night';
  const speed = busy ? 0.25 : 1;

  const spin = (seconds: number, dir = 1) =>
    reduce ? {} : { animate: { rotate: 360 * dir }, transition: { duration: seconds * speed, repeat: Infinity, ease: 'linear' as const } };

  const ringIn = (i: number) =>
    reveal
      ? {
          initial: { opacity: 0, scale: 0.6 },
          animate: { opacity: 1, scale: 1 },
          transition: { delay: 0.9 + i * 0.18, duration: 0.9, ease: [0.16, 1, 0.3, 1] as const },
        }
      : {};

  return (
    <motion.div
      layoutId={layoutId}
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      transition={{ type: 'spring', stiffness: 70, damping: 18 }}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id={`core-${id}`} cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#fffbea" />
            <stop offset="35%" stopColor="#ffe29a" />
            <stop offset="70%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </radialGradient>
          <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(var(--glow))" stopOpacity="0.55" />
            <stop offset="45%" stopColor="rgb(var(--glow))" stopOpacity="0.16" />
            <stop offset="100%" stopColor="rgb(var(--glow))" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`moon-${id}`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#1a1f3d" />
            <stop offset="100%" stopColor="#04050d" />
          </radialGradient>
          <filter id={`blur-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={`soft-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* Dış parıltı */}
        <motion.circle
          cx="100"
          cy="100"
          r="98"
          fill={`url(#glow-${id})`}
          animate={reduce ? undefined : { scale: busy ? [1, 1.12, 1] : [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: busy ? 1.4 : 4.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '100px 100px' }}
        />

        {!minimal && (
          <>
            {/* Halka 1: kesikli dış halka */}
            <motion.g {...ringIn(0)} style={{ transformOrigin: '100px 100px' }}>
              <motion.circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="rgb(var(--glow))"
                strokeOpacity="0.35"
                strokeWidth="0.6"
                strokeDasharray="2 5"
                style={{ transformOrigin: '100px 100px' }}
                {...spin(80)}
              />
            </motion.g>
            {/* Halka 2: ölçek çizgileri */}
            <motion.g {...ringIn(1)} style={{ transformOrigin: '100px 100px' }}>
              <motion.g style={{ transformOrigin: '100px 100px' }} {...spin(120, -1)}>
                {TICKS.map((i) => (
                  <line
                    key={i}
                    x1="100"
                    y1={i % 6 === 0 ? 14 : 18}
                    x2="100"
                    y2="22"
                    stroke="rgb(var(--glow))"
                    strokeOpacity={i % 6 === 0 ? 0.7 : 0.28}
                    strokeWidth={i % 6 === 0 ? 1 : 0.6}
                    transform={`rotate(${i * 5} 100 100)`}
                  />
                ))}
              </motion.g>
            </motion.g>
            {/* Halka 3: yaylar */}
            <motion.g {...ringIn(2)} style={{ transformOrigin: '100px 100px' }}>
              <motion.g style={{ transformOrigin: '100px 100px' }} {...spin(22)}>
                {[0, 120, 240].map((a) => (
                  <path
                    key={a}
                    d="M100 28 A72 72 0 0 1 162.4 64"
                    fill="none"
                    stroke="var(--accent-2)"
                    strokeOpacity="0.75"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    transform={`rotate(${a} 100 100)`}
                  />
                ))}
              </motion.g>
            </motion.g>
            {/* Halka 4: iç ince halka */}
            <motion.g {...ringIn(3)} style={{ transformOrigin: '100px 100px' }}>
              <motion.circle
                cx="100"
                cy="100"
                r="64"
                fill="none"
                stroke="rgb(var(--glow))"
                strokeOpacity="0.22"
                strokeWidth="0.8"
                strokeDasharray="40 8 4 8"
                style={{ transformOrigin: '100px 100px' }}
                {...spin(40, -1)}
              />
            </motion.g>
          </>
        )}

        {/* Işınlar */}
        {!night && (
          <motion.g
            style={{ transformOrigin: '100px 100px' }}
            animate={reduce ? undefined : { rotate: 360, scale: busy ? [1, 1.08, 1] : [1, 1.04, 1] }}
            transition={{
              rotate: { duration: 60 * speed, repeat: Infinity, ease: 'linear' },
              scale: { duration: busy ? 1.2 : 3.5, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            {RAYS.map((i) => (
              <path
                key={i}
                d="M100 44 L103 54 L100 58 L97 54 Z"
                fill="var(--accent)"
                opacity={i % 2 ? 0.55 : 0.9}
                transform={`rotate(${i * 30} 100 100)`}
                filter={`url(#soft-${id})`}
              />
            ))}
          </motion.g>
        )}

        {/* Çekirdek */}
        <circle cx="100" cy="100" r="40" fill={`url(#core-${id})`} filter={`url(#blur-${id})`} opacity="0.9" />
        <motion.circle
          cx="100"
          cy="100"
          r="38"
          fill={`url(#core-${id})`}
          animate={reduce ? undefined : { scale: busy ? [1, 1.04, 1] : [1, 1.015, 1] }}
          transition={{ duration: busy ? 0.9 : 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '100px 100px' }}
        />
        <ellipse cx="88" cy="84" rx="12" ry="7" fill="#fff" opacity="0.35" filter={`url(#soft-${id})`} />

        {/* Gece: tutulma */}
        {night && (
          <>
            <circle
              cx="100"
              cy="100"
              r="41"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              filter={`url(#blur-${id})`}
            />
            <motion.circle
              cx="100"
              cy="100"
              r="38.5"
              fill={`url(#moon-${id})`}
              initial={reveal ? { x: -90 } : false}
              animate={{ x: 0 }}
              transition={{ delay: reveal ? 1 : 0, duration: 2.2, ease: [0.65, 0, 0.35, 1] }}
            />
          </>
        )}
      </svg>
    </motion.div>
  );
}
