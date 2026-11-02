import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarClock,
  Check,
  CheckCheck,
  CircleDot,
  Hourglass,
  Inbox,
  ListTodo,
  Mail,
  MessageSquare,
  Plus,
  Sparkles,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocalFlag } from '../lib/hooks';
import type { Card, CardStatus, Project } from '../lib/api';
import { dueState, fmtDay, relTime } from '../lib/time';

export const COLUMNS: { id: CardStatus; label: string; icon: typeof Inbox; hint: string }[] = [
  { id: 'inbox', label: 'Gelen', icon: Inbox, hint: 'Güneş\'in yeni bulduğu işler' },
  { id: 'todo', label: 'Yapılacak', icon: ListTodo, hint: 'Sıradaki işler' },
  { id: 'doing', label: 'Devam ediyor', icon: CircleDot, hint: 'Şu an üzerinde olduklarınız' },
  { id: 'waiting', label: 'Beklemede', icon: Hourglass, hint: 'Başkasından dönüş beklenenler' },
  { id: 'review', label: 'Kapatılabilir', icon: CheckCheck, hint: 'Güneş bitti sanıyor — onayınızı bekliyor' },
  { id: 'done', label: 'Bitti', icon: Check, hint: 'Son 7 günde kapananlar' },
];

const PRIO = {
  critical: { label: 'Kritik', color: '#ff5d5d', rank: 0 },
  high: { label: 'Yüksek', color: '#ff9f43', rank: 1 },
  medium: { label: 'Orta', color: 'var(--accent)', rank: 2 },
  low: { label: 'Düşük', color: 'rgb(255 255 255 / 0.35)', rank: 3 },
} as const;

const sortCards = (a: Card, b: Card) =>
  PRIO[a.priority].rank - PRIO[b.priority].rank ||
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  b.updated_at.localeCompare(a.updated_at);

interface Props {
  cards: Card[];
  projects: Project[];
  onMove: (card: Card, status: CardStatus) => void;
  onOpen: (card: Card) => void;
  onQuickAdd: (title: string, status: CardStatus) => void;
}

export function Board({ cards, projects, onMove, onOpen, onQuickAdd }: Props) {
  const [dragging, setDragging] = useState<Card | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const pname = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const byCol = useMemo(() => {
    const m = new Map<CardStatus, Card[]>(COLUMNS.map((c) => [c.id, []]));
    for (const c of cards) m.get(c.status)?.push(c);
    for (const list of m.values()) list.sort(sortCards);
    return m;
  }, [cards]);

  const start = (e: DragStartEvent) => setDragging(cards.find((c) => c.id === e.active.id) ?? null);
  const end = (e: DragEndEvent) => {
    const card = cards.find((c) => c.id === e.active.id);
    const to = e.over?.id as CardStatus | undefined;
    setDragging(null);
    if (card && to && to !== card.status) onMove(card, to);
  };

  return (
    <DndContext sensors={sensors} onDragStart={start} onDragEnd={end} onDragCancel={() => setDragging(null)}>
      <div className="scroll-thin flex h-full gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col, i) => (
          <Column
            key={col.id}
            col={col}
            index={i}
            cards={byCol.get(col.id) ?? []}
            render={(c) => (
              <DraggableCard key={c.id} card={c} project={c.project_id ? pname.get(c.project_id) : undefined} onOpen={onOpen} onMove={onMove} />
            )}
            onQuickAdd={(t) => onQuickAdd(t, col.id)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {dragging && (
          <motion.div initial={{ rotate: 0, scale: 1 }} animate={{ rotate: 2.5, scale: 1.04 }} className="cursor-grabbing">
            <CardView card={dragging} project={dragging.project_id ? pname.get(dragging.project_id) : undefined} lifted />
          </motion.div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  col,
  index,
  cards,
  render,
  onQuickAdd,
}: {
  col: (typeof COLUMNS)[number];
  index: number;
  cards: Card[];
  render: (c: Card) => ReactNode;
  onQuickAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const isReview = col.id === 'review';
  const [collapsed, setCollapsed] = useLocalFlag('gunes.doneCollapsed', true);

  if (col.id === 'done' && collapsed)
    return (
      <motion.button
        ref={setNodeRef}
        onClick={() => setCollapsed(false)}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 + index * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        title="Bitenleri göster"
        className={`glass flex w-[52px] min-w-[52px] flex-col items-center gap-3 rounded-2xl py-4 text-ink-dim hover:text-ink ${
          isOver ? '!border-[color:var(--ok)] shadow-[0_0_30px_-6px_var(--ok)]' : ''
        }`}
      >
        <col.icon size={15} className="text-ok" />
        <span className="rounded-full bg-white/[0.08] px-1.5 text-[10.5px] tabular-nums">{cards.length}</span>
        <span className="font-display text-[12px] font-semibold tracking-wide [writing-mode:vertical-rl]">{col.label}</span>
      </motion.button>
    );

  return (
    <motion.section
      ref={setNodeRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`glass relative flex min-w-[228px] max-w-[400px] flex-1 basis-0 flex-col rounded-2xl transition-[box-shadow,border-color] duration-300 ${
        isOver ? '!border-[color:var(--accent)] shadow-[0_0_0_1px_var(--accent),0_0_40px_-8px_rgb(var(--glow)/0.6)]' : ''
      } ${isReview && cards.length ? 'border-[color:var(--ok)]/30' : ''}`}
    >
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3" title={col.hint}>
        <col.icon size={14} className={isReview ? 'text-ok' : 'text-accent'} />
        <h3 className="font-display text-[12.5px] font-semibold tracking-wide">{col.label}</h3>
        <motion.span
          key={cards.length}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-full bg-white/[0.08] px-1.5 text-[10.5px] tabular-nums text-ink-dim"
        >
          {cards.length}
        </motion.span>
        {col.id === 'done' && (
          <button onClick={() => setCollapsed(true)} className="ml-auto rounded-md px-1.5 py-0.5 text-[10.5px] text-ink-faint hover:bg-white/10 hover:text-ink">
            Gizle
          </button>
        )}
        {col.id !== 'done' && col.id !== 'review' && (
          <button onClick={() => setAdding(true)} className="ml-auto rounded-md p-1 text-ink-faint hover:bg-white/10 hover:text-ink" title="Kart ekle">
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2.5 pb-3">
        <AnimatePresence>
          {adding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) onQuickAdd(text.trim());
                setText('');
                setAdding(false);
              }}
            >
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => !text && setAdding(false)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
                placeholder="Ne yapılması gerekiyor?"
                className="w-full rounded-xl border border-[color:var(--accent)]/50 bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
              />
            </motion.form>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>{cards.map(render)}</AnimatePresence>
        {!cards.length && !adding && (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-line text-[11px] text-ink-faint">
            {isOver ? 'Bırakın' : col.id === 'review' ? 'Onay bekleyen yok' : 'Boş'}
          </div>
        )}
      </div>
    </motion.section>
  );
}

function DraggableCard({
  card,
  project,
  onOpen,
  onMove,
}: {
  card: Card;
  project?: string;
  onOpen: (c: Card) => void;
  onMove: (c: Card, s: CardStatus) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: card.id });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: isDragging ? 0.25 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
    >
      <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(card)} className="cursor-grab active:cursor-grabbing">
        <CardView card={card} project={project} onMove={onMove} />
      </div>
    </motion.div>
  );
}

export function CardView({
  card,
  project,
  lifted,
  onMove,
}: {
  card: Card;
  project?: string;
  lifted?: boolean;
  onMove?: (c: Card, s: CardStatus) => void;
}) {
  const p = PRIO[card.priority];
  const due = dueState(card.due_date);
  const done = card.status === 'done';
  const src = card.sources?.[0]?.type;
  const fresh = Date.now() - new Date(card.created_at).getTime() < 6 * 3600_000 && card.created_by === 'gunes';

  return (
    <motion.div
      whileHover={lifted ? undefined : { y: -2 }}
      className={`group relative overflow-hidden rounded-xl border bg-[rgb(10_8_24/0.45)] p-3 pl-3.5 backdrop-blur-md transition-colors ${
        lifted ? 'border-[color:var(--accent)]/60 shadow-[0_24px_60px_-10px_rgb(0_0_0/0.7),0_0_30px_-6px_rgb(var(--glow)/0.5)]' : 'border-line hover:border-line-strong'
      } ${done ? 'opacity-55' : ''}`}
    >
      {/* Öncelik ışık şeridi */}
      <motion.div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: p.color, boxShadow: card.priority === 'critical' ? `0 0 14px ${p.color}` : 'none' }}
        animate={card.priority === 'critical' && !done ? { opacity: [1, 0.45, 1] } : undefined}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
      {fresh && (
        <span className="absolute right-2 top-2 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
      )}

      <div className={`pr-3 text-[13px] font-medium leading-snug text-ink ${done ? 'line-through decoration-white/30' : ''}`}>{card.title}</div>

      {card.requested_by && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
          <UserRound size={10} /> {card.requested_by}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {project && (
          <span className="rounded-md bg-[color:var(--accent)]/12 px-1.5 py-0.5 text-[10.5px] text-accent">{project}</span>
        )}
        {due && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] ${
              due === 'overdue'
                ? 'bg-[color:var(--danger)]/18 text-danger'
                : due === 'today'
                  ? 'bg-[color:var(--accent)]/18 text-accent'
                  : 'bg-white/[0.06] text-ink-dim'
            }`}
          >
            <CalendarClock size={10} />
            {due === 'overdue' ? 'Gecikti · ' : due === 'today' ? 'Bugün · ' : ''}
            {fmtDay(card.due_date)}
          </span>
        )}
        {card.waiting_on && card.status === 'waiting' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[color:var(--info)]/15 px-1.5 py-0.5 text-[10.5px] text-info">
            <UserRound size={10} />
            {card.waiting_on === 'them' ? 'Karşı taraf' : card.waiting_on === 'me' ? 'Siz' : card.waiting_on}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-ink-faint">
        {src === 'outlook' && <Mail size={11} />}
        {src === 'teams' && <MessageSquare size={11} />}
        {card.created_by === 'gunes' && <Sparkles size={11} className="text-accent/70" />}
        <span>{relTime(card.updated_at)}</span>
        {card.people.length > 0 && (
          <div className="ml-auto flex -space-x-1.5">
            {card.people.slice(0, 3).map((n) => (
              <span
                key={n}
                title={n}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgb(10_8_24)] bg-gradient-to-br from-white/25 to-white/5 text-[9px] font-semibold text-ink"
              >
                {n
                  .split(/\s+/)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toLocaleUpperCase('tr')}
              </span>
            ))}
          </div>
        )}
      </div>

      {card.status === 'review' && onMove && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          {card.close_reason && <p className="mb-2 text-[11px] italic leading-snug text-ink-dim">“{card.close_reason}”</p>}
          <div className="flex gap-1.5">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMove(card, 'done');
              }}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[color:var(--ok)]/18 py-1 text-[11px] font-medium text-ok hover:bg-[color:var(--ok)]/28"
            >
              <Check size={12} /> Onayla
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMove(card, 'doing');
              }}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-ink-dim hover:text-ink"
            >
              <Undo2 size={12} /> Devam
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
