import { AnimatePresence, motion } from 'motion/react';
import { Filter, Maximize2, Minimize2, Minus, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CardStatus, Priority, Project } from '../lib/api';
import { Board } from './Board';

const ZOOM_KEY = 'gunes.boardZoom';
const MIN = 0.5;
const MAX = 1.5;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 20) / 20));

function loadZoom() {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v ? clamp(v) : 1;
  } catch {
    return 1;
  }
}

const PRIO: { id: Priority; label: string; color: string }[] = [
  { id: 'critical', label: 'Kritik', color: '#ff5d5d' },
  { id: 'high', label: 'Yüksek', color: '#ff9f43' },
  { id: 'medium', label: 'Orta', color: 'var(--accent)' },
  { id: 'low', label: 'Düşük', color: 'rgb(255 255 255 / 0.45)' },
];

interface Props {
  cards: Card[];
  projects: Project[];
  focus: boolean;
  onFocus: (v: boolean) => void;
  onMove: (card: Card, status: CardStatus) => void;
  onOpen: (card: Card) => void;
  onQuickAdd: (title: string, status: CardStatus) => void;
}

/** Kanban çalışma alanı: filtre çubuğu, odak modu ve Excel tarzı yakınlaştırma. */
export function BoardWorkspace({ cards, projects, focus, onFocus, onMove, onOpen, onQuickAdd }: Props) {
  const [zoom, setZoomState] = useState(loadZoom);
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [person, setPerson] = useState('');
  const [prios, setPrios] = useState<Priority[]>([]);
  const area = useRef<HTMLDivElement>(null);

  const setZoom = (z: number) => {
    const v = clamp(z);
    setZoomState(v);
    try {
      localStorage.setItem(ZOOM_KEY, String(v));
    } catch {
      /* yoksay */
    }
  };

  // Ctrl + tekerlek: yakınlaştır/uzaklaştır (pano üzerindeyken)
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(loadZoom() + (e.deltaY < 0 ? 0.05 : -0.05));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Klavye: Ctrl+0 / Ctrl+= / Ctrl+- ve F (odak modu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if (e.ctrlKey && (e.key === '0' || e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault();
        if (e.key === '0') setZoom(1);
        else setZoom(loadZoom() + (e.key === '-' ? -0.1 : 0.1));
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        onFocus(!focus);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) {
      if (c.requested_by) set.add(c.requested_by);
      c.people.forEach((p) => set.add(p));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [cards]);
  const usedProjects = useMemo(() => projects.filter((p) => cards.some((c) => c.project_id === p.id)), [projects, cards]);

  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    return cards.filter(
      (c) =>
        (!t || [c.title, c.description, c.requested_by, ...c.people, ...c.tags].some((f) => f?.toLocaleLowerCase('tr').includes(t))) &&
        (!project || c.project_id === project) &&
        (!person || c.requested_by === person || c.people.includes(person)) &&
        (!prios.length || prios.includes(c.priority)),
    );
  }, [cards, q, project, person, prios]);

  const active = Boolean(q || project || person || prios.length);
  const clear = () => {
    setQ('');
    setProject('');
    setPerson('');
    setPrios([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {/* Araç çubuğu */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5"
      >
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kartlarda ara…"
            className="h-7 w-48 rounded-lg border border-line bg-black/20 pl-7 pr-2 text-xs outline-none focus:border-[color:var(--accent)]/60 focus:w-64"
            style={{ transition: 'width .25s ease' }}
          />
        </div>
        <Select value={project} onChange={setProject} placeholder="Tüm projeler" options={usedProjects.map((p) => ({ value: p.id, label: p.name }))} />
        <Select value={person} onChange={setPerson} placeholder="Tüm kişiler" options={people.map((p) => ({ value: p, label: p }))} />
        <div className="flex items-center gap-1">
          {PRIO.map((p) => {
            const on = prios.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setPrios((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors ${on ? 'border-transparent bg-white/[0.12] text-ink' : 'border-line text-ink-faint hover:text-ink-dim'}`}
                title={`${p.label} öncelik`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color, boxShadow: on ? `0 0 8px ${p.color}` : 'none' }} />
                {p.label}
              </button>
            );
          })}
        </div>
        <AnimatePresence>
          {active && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={clear}
              className="flex h-7 items-center gap-1 rounded-lg bg-[color:var(--accent)]/15 px-2 text-[11px] text-accent"
            >
              <Filter size={11} /> {filtered.length}/{cards.length} kart · temizle <X size={11} />
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={() => onFocus(!focus)}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11px] text-ink-dim hover:bg-white/[0.06] hover:text-ink"
          title="Odak modu (F)"
        >
          {focus ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {focus ? 'Brifingi göster' : 'Odak modu'}
        </button>
      </motion.div>

      {/* Yakınlaştırılabilir pano */}
      <div ref={area} className="relative min-h-0 flex-1 overflow-hidden">
        <div style={{ zoom, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}>
          <Board cards={filtered} projects={projects} onMove={onMove} onOpen={onOpen} onQuickAdd={onQuickAdd} />
        </div>
        <ZoomBar value={zoom} onChange={setZoom} />
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  if (!options.length) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-7 max-w-[170px] rounded-lg border bg-black/25 px-2 text-xs outline-none ${value ? 'border-[color:var(--accent)]/50 text-ink' : 'border-line text-ink-dim'}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Excel tarzı yakınlaştırma çubuğu (sağ alt). */
function ZoomBar({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-xl border border-line-strong bg-[rgb(14_11_32/0.82)] px-2 py-1 shadow-xl backdrop-blur-md"
    >
      <button onClick={() => onChange(value - 0.1)} disabled={value <= MIN} className="rounded p-0.5 text-ink-dim hover:text-ink disabled:opacity-30" title="Uzaklaştır (Ctrl -)">
        <Minus size={13} />
      </button>
      <input
        type="range"
        min={MIN * 100}
        max={MAX * 100}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="zoom-range h-1 w-28 cursor-pointer"
        style={{ ['--p' as string]: `${((value - MIN) / (MAX - MIN)) * 100}%` }}
        aria-label="Yakınlaştırma"
      />
      <button onClick={() => onChange(value + 0.1)} disabled={value >= MAX} className="rounded p-0.5 text-ink-dim hover:text-ink disabled:opacity-30" title="Yakınlaştır (Ctrl +)">
        <Plus size={13} />
      </button>
      <button
        onClick={() => onChange(1)}
        className="w-11 rounded-md py-0.5 text-center font-display text-[11px] font-semibold tabular-nums text-ink hover:bg-white/10"
        title="%100'e döndür (Ctrl 0)"
      >
        %{pct}
      </button>
    </motion.div>
  );
}
