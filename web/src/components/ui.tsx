import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

export function Panel({ className = '', children, ...rest }: HTMLMotionProps<'div'> & { children?: ReactNode }) {
  return (
    <motion.div className={`glass hud-corners rounded-2xl ${className}`} {...rest}>
      {children}
    </motion.div>
  );
}

export function PanelTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <span className="text-accent">{icon}</span>}
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">{children}</h3>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

type BtnProps = HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost' | 'subtle' | 'danger'; size?: 'sm' | 'md' };
export function Button({ variant = 'subtle', size = 'md', className = '', children, ...rest }: BtnProps) {
  const v = {
    primary: 'accent-gradient text-[#1a0f05] font-semibold shadow-[0_8px_30px_-8px_rgb(var(--glow)/0.7)]',
    ghost: 'text-ink-dim hover:text-ink hover:bg-white/5',
    subtle: 'bg-white/[0.06] border border-line text-ink hover:bg-white/[0.1]',
    danger: 'bg-[color:var(--danger)]/15 border border-[color:var(--danger)]/30 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/25',
  }[variant];
  const s = size === 'sm' ? 'h-7 px-2.5 text-xs gap-1.5' : 'h-9 px-3.5 text-sm gap-2';
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      className={`inline-flex items-center justify-center rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-40 ${v} ${s} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function Chip({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md border border-line bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-ink-dim ${className}`}>
      {children}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <motion.div
        className="text-accent/80"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {icon}
      </motion.div>
      <div className="font-display text-sm text-ink">{title}</div>
      {children && <div className="max-w-xs text-xs leading-relaxed text-ink-faint">{children}</div>}
    </div>
  );
}
