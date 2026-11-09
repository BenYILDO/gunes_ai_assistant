import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Brain, Eye, Feather, FolderKanban, GraduationCap, Heart, Lock, Pencil, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { api, type Briefing, type JournalEntry, type Memory } from '../lib/api';
import { fmtDay, relTime } from '../lib/time';
import { useToast } from './Toasts';
import { Button, Empty, Panel, PanelTitle } from './ui';
import { WeeklyCard } from './WeeklyCard';

const GROUPS: { kinds: Memory['kind'][]; title: string; icon: typeof Brain; hint: string }[] = [
  { kinds: ['soul_core'], title: 'Ruhum', icon: Heart, hint: 'Değişmeyen çekirdek kişiliğim' },
  { kinds: ['soul'], title: 'Zamanla öğrendiğim üslup', icon: Feather, hint: 'Konuşmalarımızdan öğrendiklerim' },
  { kinds: ['user'], title: 'Sizi tanıyorum', icon: UserRound, hint: 'Rolünüz, tercihleriniz, çalışma tarzınız' },
  { kinds: ['lesson'], title: 'Dersler', icon: GraduationCap, hint: 'Geri bildirimlerinizden öğrendiklerim' },
  { kinds: ['memory'], title: 'Uzun vadeli hafıza', icon: Brain, hint: 'Önemli bilgiler ve kararlar' },
  { kinds: ['person'], title: 'Kişiler', icon: Users, hint: 'Çalıştığınız insanlar' },
  { kinds: ['project'], title: 'Projeler', icon: FolderKanban, hint: 'Proje bağlamları' },
];

export function MemoryView({ memories, journal, reflection, onChange }: { memories: Memory[]; journal: JournalEntry[]; reflection?: Briefing | null; onChange: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'memory' as Memory['kind'], key: '', content: '', importance: 3 });

  const add = async () => {
    if (!form.content.trim()) return;
    await api.addMemory(form);
    setForm({ ...form, key: '', content: '' });
    setAdding(false);
    toast('Güneş bunu hatırlayacak');
    onChange();
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[1fr_380px]">
      <div className="scroll-thin space-y-4 overflow-y-auto pb-6 pr-1">
        {reflection && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <WeeklyCard title="Haftalık iç gözlem" icon={<Eye size={14} />} item={reflection} defaultOpen={Date.now() - new Date(reflection.created_at).getTime() < 3 * 864e5} />
          </motion.div>
        )}
        <Panel className="p-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent)]/15 text-accent">
              <Brain size={20} />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">Güneş'in hafızası</div>
              <div className="text-xs text-ink-faint">
                {memories.length} anı · Önemli anılar orijinal haliyle saklanır, hatırlandıkça güçlenir.
              </div>
            </div>
            <Button className="ml-auto" size="sm" onClick={() => setAdding((a) => !a)}>
              <Plus size={13} /> Bir şey öğret
            </Button>
          </div>
          <AnimatePresence>
            {adding && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-4 grid gap-2 sm:grid-cols-[150px_160px_1fr]">
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as Memory['kind'] })}
                    className="rounded-lg border border-line bg-black/30 px-2 py-2 text-sm outline-none"
                  >
                    <option value="memory">Genel bilgi</option>
                    <option value="lesson">Ders / tercih</option>
                    <option value="user">Benim hakkımda</option>
                    <option value="person">Kişi</option>
                    <option value="project">Proje</option>
                    <option value="soul">Üslup</option>
                  </select>
                  <input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder="Konu / kişi (opsiyonel)"
                    className="rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && void add()}
                    placeholder="Örn: Ahmet Bey'in mailleri her zaman öncelikli"
                    className="rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-ink-faint">Önem</span>
                  <Dots value={form.importance} onChange={(v) => setForm({ ...form, importance: v })} />
                  <Button className="ml-auto" variant="primary" size="sm" onClick={() => void add()}>
                    Kaydet
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((g, gi) => {
            const items = memories.filter((m) => g.kinds.includes(m.kind));
            if (!items.length && !['soul_core', 'user', 'lesson'].includes(g.kinds[0])) return null;
            return (
              <Panel
                key={g.title}
                className={`p-5 ${g.kinds[0] === 'soul_core' ? 'lg:col-span-2' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * gi }}
              >
                <PanelTitle icon={<g.icon size={14} />} right={<span className="text-[11px] text-ink-faint">{items.length}</span>}>
                  {g.title}
                </PanelTitle>
                {!items.length ? (
                  <div className="text-xs text-ink-faint">{g.hint} — henüz boş.</div>
                ) : (
                  <div className={g.kinds[0] === 'soul_core' ? 'grid gap-2 md:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
                    {items.map((m) => (
                      <MemoryItem key={m.id} m={m} onChange={onChange} />
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </div>

      <Panel className="flex min-h-0 flex-col p-5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
        <PanelTitle icon={<BookOpen size={14} />}>Günlüğüm</PanelTitle>
        {!journal.length ? (
          <Empty icon={<BookOpen size={26} />} title="Günlük henüz boş">
            Her çalışmamın sonunda ne gördüğümü ve ne yaptığımı buraya yazacağım.
          </Empty>
        ) : (
          <div className="scroll-thin relative -mr-2 flex-1 space-y-4 overflow-y-auto pl-4 pr-2">
            <div className="absolute bottom-0 left-[3px] top-1 w-px bg-gradient-to-b from-[color:var(--accent)] via-white/10 to-transparent" />
            {journal.map((j, i) => (
              <motion.div key={j.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }} className="relative">
                <span className="absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_8px_rgb(var(--glow))]" />
                <div className="text-[11px] text-ink-faint">
                  {fmtDay(j.created_at)} · {new Date(j.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-dim">{j.content}</p>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function MemoryItem({ m, onChange }: { m: Memory; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(m.content);
  const toast = useToast();
  const save = async () => {
    setEdit(false);
    if (text !== m.content) {
      await api.updateMemory(m.id, { content: text });
      onChange();
    }
  };
  return (
    <motion.div layout className="group relative rounded-xl border border-line bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-2">
        {m.key && <span className="text-[11px] font-semibold text-accent">{m.key}</span>}
        {m.locked ? (
          <Lock size={11} className="text-ink-faint" />
        ) : (
          <Dots
            value={m.importance}
            onChange={async (v) => {
              await api.updateMemory(m.id, { importance: v });
              onChange();
            }}
            small
          />
        )}
        <span className="ml-auto text-[10px] text-ink-faint">{relTime(m.updated_at)}</span>
        {!m.locked && (
          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button onClick={() => setEdit(true)} aria-label="Düzenle" title="Düzenle" className="text-ink-faint hover:text-ink">
              <Pencil size={11} />
            </button>
            <button
              onClick={async () => {
                await api.deleteMemory(m.id);
                toast('Unutuldu');
                onChange();
              }}
              aria-label="Unut"
              title="Unut"
              className="text-ink-faint hover:text-danger"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      {edit ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
          rows={3}
          className="w-full rounded-lg border border-[color:var(--accent)]/50 bg-black/30 p-2 text-[13px] outline-none"
        />
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-dim">{m.content}</p>
      )}
      {m.original_excerpt && <blockquote className="mt-1.5 border-l-2 border-[color:var(--accent)] pl-2 text-xs italic text-ink">“{m.original_excerpt}”</blockquote>}
      {!m.locked && (
        <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-white/[0.06]" title={`Canlılık: ${m.strength.toFixed(1)}`}>
          <motion.div
            className="h-full accent-gradient"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, m.strength * 25)}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}
    </motion.div>
  );
}

function Dots({ value, onChange, small }: { value: number; onChange: (v: number) => void; small?: boolean }) {
  return (
    <div className="flex gap-0.5" title={`Önem: ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} onClick={() => onChange(i)} aria-label={`Önem ${i} / 5`} aria-pressed={i <= value} className="grid place-items-center p-1">
          <span className={`${small ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5'} rounded-full transition-all ${i <= value ? 'bg-accent shadow-[0_0_6px_rgb(var(--glow))]' : 'bg-white/15'}`} />
        </button>
      ))}
    </div>
  );
}
