import { motion } from 'motion/react';
import { ExternalLink, Mail, MessageSquare, Sparkles, Trash2, UserRound, X, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type Activity, type Card, type CardStatus, type Priority, type Project } from '../lib/api';
import { relTime } from '../lib/time';
import { COLUMNS } from './Board';
import { Button } from './ui';

const PRIOS: { id: Priority; label: string; color: string }[] = [
  { id: 'critical', label: 'Kritik', color: '#ff5d5d' },
  { id: 'high', label: 'Yüksek', color: '#ff9f43' },
  { id: 'medium', label: 'Orta', color: 'var(--accent)' },
  { id: 'low', label: 'Düşük', color: 'rgb(255 255 255 / 0.4)' },
];

interface Props {
  card: Card;
  projects: Project[];
  onClose: () => void;
  onSave: (patch: Partial<Card> & { project?: string }) => Promise<void>;
  onDelete: (noise: boolean) => Promise<void>;
}

export function CardModal({ card, projects, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description ?? '');
  const [project, setProject] = useState(projects.find((p) => p.id === card.project_id)?.name ?? '');
  const [due, setDue] = useState(card.due_date ?? '');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    api.activity(card.id).then(setActivity).catch(() => undefined);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [card.id, onClose]);

  const saveText = () => {
    const patch: Partial<Card> & { project?: string } = {};
    if (title.trim() && title !== card.title) patch.title = title.trim();
    if (desc !== (card.description ?? '')) patch.description = desc;
    if (due !== (card.due_date ?? '')) patch.due_date = due || null;
    const curProject = projects.find((p) => p.id === card.project_id)?.name ?? '';
    if (project.trim() !== curProject) {
      if (project.trim()) patch.project = project.trim();
      else patch.project_id = null;
    }
    if (Object.keys(patch).length) void onSave(patch);
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => (saveText(), onClose())} />
      <motion.div
        className="glass hud-corners relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        initial={{ opacity: 0, scale: 0.92, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="flex items-start gap-3 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-ink-faint">
              {card.created_by === 'gunes' ? (
                <>
                  <Sparkles size={12} className="text-accent" /> Güneş açtı · {relTime(card.created_at)}
                </>
              ) : (
                <>
                  <UserRound size={12} /> Siz açtınız · {relTime(card.created_at)}
                </>
              )}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveText}
              className="w-full bg-transparent font-display text-xl font-semibold outline-none"
            />
          </div>
          <button onClick={() => (saveText(), onClose())} className="rounded-lg p-1.5 text-ink-faint hover:bg-white/10 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">
          {/* Durum */}
          <div>
            <Label>Durum</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void onSave({ status: c.id as CardStatus })}
                  className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                    card.status === c.id ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                  }`}
                >
                  {card.status === c.id && (
                    <motion.span layoutId="status-pill" className="absolute inset-0 rounded-lg border border-[color:var(--accent)]/50 bg-[color:var(--accent)]/12" />
                  )}
                  <c.icon size={12} className="relative" />
                  <span className="relative">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>Öncelik</Label>
              <div className="flex gap-1">
                {PRIOS.map((p) => (
                  <button
                    key={p.id}
                    title={p.label}
                    onClick={() => void onSave({ priority: p.id })}
                    className={`flex-1 rounded-lg border py-1.5 text-[11px] transition-all ${
                      card.priority === p.id ? 'border-transparent text-[#140c02]' : 'border-line text-ink-faint hover:text-ink'
                    }`}
                    style={card.priority === p.id ? { background: p.color, boxShadow: `0 0 16px -2px ${p.color}` } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Proje</Label>
              <input
                list="gunes-projects"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={saveText}
                placeholder="Proje yok"
                className="w-full rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-sm outline-none focus:border-[color:var(--accent)]/60"
              />
              <datalist id="gunes-projects">
                {projects.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Son tarih</Label>
              <div className="relative">
                <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  onBlur={saveText}
                  className="w-full rounded-lg border border-line bg-black/20 py-1.5 pl-8 pr-2 text-sm outline-none [color-scheme:dark] focus:border-[color:var(--accent)]/60"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Açıklama</Label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={saveText}
              rows={5}
              placeholder="Ayrıntı ekleyin…"
              className="scroll-thin w-full resize-y rounded-xl border border-line bg-black/20 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)]/60"
            />
          </div>

          {card.close_reason && card.status === 'review' && (
            <div className="rounded-xl border border-[color:var(--ok)]/30 bg-[color:var(--ok)]/8 p-3 text-sm">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-ok">Güneş neden kapatılabilir diyor?</div>
              {card.close_reason}
            </div>
          )}

          {(card.sources?.length > 0 || card.people.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {card.sources?.length > 0 && (
                <div>
                  <Label>Kaynaklar</Label>
                  <div className="space-y-1.5">
                    {card.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.link || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-xs ${s.link ? 'hover:border-line-strong' : 'pointer-events-none'}`}
                      >
                        {s.type === 'teams' ? <MessageSquare size={12} className="text-info" /> : <Mail size={12} className="text-accent" />}
                        <span className="min-w-0 flex-1 truncate">{s.title || s.type}</span>
                        {s.link && <ExternalLink size={11} className="text-ink-faint" />}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {card.people.length > 0 && (
                <div>
                  <Label>Kişiler</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {card.people.map((p) => (
                      <span key={p} className="rounded-lg border border-line bg-white/[0.04] px-2 py-1 text-xs">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activity.length > 0 && (
            <div>
              <Label>Geçmiş</Label>
              <div className="relative space-y-2.5 pl-4">
                <div className="absolute bottom-1 left-[3px] top-1 w-px bg-line" />
                {activity.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative text-xs"
                  >
                    <span
                      className={`absolute -left-4 top-1 h-[7px] w-[7px] rounded-full ${a.actor === 'gunes' ? 'bg-accent shadow-[0_0_8px_rgb(var(--glow))]' : 'bg-white/50'}`}
                    />
                    <span className="text-ink-faint">{relTime(a.created_at)} · </span>
                    <span className="text-ink-dim">{a.actor === 'gunes' ? 'Güneş' : 'Siz'}: </span>
                    <span className="text-ink">{a.message}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          {!confirmDel ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)}>
              <Trash2 size={13} /> Sil
            </Button>
          ) : (
            <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5">
              <Button variant="danger" size="sm" onClick={() => void onDelete(false)}>
                Sil
              </Button>
              {card.created_by === 'gunes' && (
                <Button variant="subtle" size="sm" onClick={() => void onDelete(true)} title="Güneş bu tür kartları bir daha açmaz">
                  Gereksizdi — Güneş öğrensin
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>
                Vazgeç
              </Button>
            </motion.div>
          )}
          <div className="ml-auto text-[11px] text-ink-faint">Değişiklikler otomatik kaydedilir</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const Label = ({ children }: { children: string }) => (
  <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{children}</div>
);
