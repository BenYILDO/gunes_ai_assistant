import { AnimatePresence, motion } from 'motion/react';
import { Award, Check, PawPrint, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type Pet, type PetItemInfo, type PetSpecies } from '../lib/api';
import { SKINS } from './CatHead';
import { Cat } from './Cat';

const STAT_LABELS: { key: keyof Pet['stats']; label: string; emoji: string }[] = [
  { key: 'cardsClosed', label: 'Kapatılan kart', emoji: '✅' },
  { key: 'proposalsApplied', label: 'Uygulanan öneri', emoji: '🧠' },
  { key: 'meetings', label: 'İşlenen toplantı', emoji: '🎧' },
  { key: 'daysClosed', label: 'Kapatılan gün', emoji: '🌙' },
  { key: 'visitDays', label: 'Ziyaret günü', emoji: '☀️' },
  { key: 'pats', label: 'Sevgi', emoji: '💛' },
  { key: 'plays', label: 'Oyun', emoji: '🧶' },
];
const SPECIES_EMOJI: Record<PetSpecies, string> = { cat: '🐱', fox: '🦊' };

/** Evcil hayvanın mağazası ve profili: eşya al/yerleştir/tak, tür seç, seviye ve rozetleri gör. */
export function PetPanel({ open, onClose, pet, onPet }: { open: boolean; onClose: () => void; pet: Pet | null; onPet: (p: Pet) => void }) {
  const [tab, setTab] = useState<'shop' | 'profile'>('shop');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const run = async (key: string, fn: () => Promise<Pet>) => {
    setBusy(key);
    setErr(null);
    try {
      onPet(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const lv = pet?.level;
  const pct = lv && lv.next ? Math.min(100, Math.round(((pet!.lifetime - lv.from) / (lv.next - lv.from)) * 100)) : 100;

  return (
    <AnimatePresence>
      {open && pet && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="glass-solid fixed left-1/2 top-1/2 z-[71] flex max-h-[88vh] w-[min(760px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl"
            role="dialog"
            aria-label="Evcil hayvan mağazası ve profili"
          >
            {/* başlık */}
            <div className="flex items-center gap-4 border-b border-line px-6 py-4">
              <div className="relative h-14 w-16 overflow-hidden rounded-2xl bg-white/[0.05]">
                <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%, -50%) scale(0.4)' }}>
                  <Cat species={pet.species} worn={{ hat: pet.worn.includes('hat'), bow: pet.worn.includes('bow') }} calm size={128} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">{pet.name}</h2>
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim">
                    Seviye {lv?.level} · {lv?.name}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
                    <div className="accent-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-ink-faint">{lv?.next ? `sonraki seviyeye ${lv.next - pet.lifetime} puan` : 'en yüksek seviye'}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-semibold tabular-nums">🪙 {pet.coins}</div>
                <div className="text-[11px] text-ink-faint">bugün iş puanı hakkı: {pet.workLeft}/{pet.catalog.workCap}</div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-white/10 hover:text-ink" aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            {/* sekmeler */}
            <div className="flex gap-1 border-b border-line px-4 pt-2">
              {(
                [
                  ['shop', 'Mağaza', ShoppingBag],
                  ['profile', 'Profil ve rozetler', Award],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 rounded-t-xl px-4 py-2 text-sm ${tab === id ? 'bg-white/[0.08] text-ink' : 'text-ink-faint hover:text-ink-dim'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
              {err && <div className="mb-3 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2 text-xs">{err}</div>}

              {tab === 'shop' ? (
                <div className="space-y-6">
                  {/* tür */}
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">Dost</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pet.catalog.species.map((sp) => {
                        const own = pet.unlocked.includes(sp.id);
                        const cur = pet.species === sp.id;
                        return (
                          <div key={sp.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${cur ? 'border-[color:var(--accent)]/60 bg-[color:var(--accent)]/10' : 'border-line bg-white/[0.03]'}`}>
                            <div className="relative h-14 w-16 overflow-hidden rounded-xl bg-white/[0.05]">
                              <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%, -50%) scale(0.36)' }}>
                                <Cat species={sp.id} calm size={128} />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">
                                {SPECIES_EMOJI[sp.id]} {sp.name}
                              </div>
                              <div className="text-[11px] text-ink-faint">{own ? (cur ? 'Şu an seçili' : 'Sahipsiniz') : `${sp.price} puan`}</div>
                            </div>
                            {cur ? (
                              <Check size={16} className="text-ok" />
                            ) : own ? (
                              <button disabled={busy !== null} onClick={() => void run(`sp-${sp.id}`, () => api.choosePetSpecies(sp.id))} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-white/[0.08]">
                                Seç
                              </button>
                            ) : (
                              <button
                                disabled={busy !== null || pet.coins < sp.price}
                                onClick={() => void run(`sp-${sp.id}`, () => api.choosePetSpecies(sp.id, true))}
                                className="accent-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a0f05] disabled:opacity-40"
                              >
                                Satın al
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* eşyalar */}
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">Eşyalar</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pet.catalog.items.map((it) => (
                        <ItemCard key={it.id} it={it} pet={pet} busy={busy} run={run} />
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                      Yerleştirdiğiniz eşyaları ekranda sürükleyip istediğiniz yere bırakın. Puanı gerçek işlerden kazanırsınız: kartı kendiniz kapatmak, Güneş'in önerisini uygulamak,
                      toplantıyı işlemek, "Bugünlük yeter" demek, hayvanınızı beslemek ve her gün Güneş'i açmak.
                    </p>
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">Bugünün görevleri</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {pet.goals.map((g) => (
                        <div key={g.id} className={`rounded-xl border px-3 py-2.5 ${g.done ? 'border-[color:var(--ok)]/40 bg-[color:var(--ok)]/[0.07]' : 'border-line bg-white/[0.03]'}`}>
                          <div className="flex items-center gap-2 text-sm">
                            <span>{g.done ? '✅' : '🎯'}</span>
                            <span className="min-w-0 flex-1">{g.name}</span>
                            <span className="text-[11px] text-ink-faint">+{g.reward} 🪙</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="accent-gradient h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((g.have / g.need) * 100))}%` }} />
                          </div>
                          <div className="mt-1 text-[11px] text-ink-faint">
                            {Math.min(g.have, g.need)}/{g.need} · isteğe bağlı, kaçırırsanız ceza yok
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Tile label="Besleme serisi" value={`🔥 ${pet.streak}`} sub={`en iyi ${pet.bestStreak}`} />
                    <Tile label="Ziyaret serisi" value={`☀️ ${pet.visitStreak}`} sub={`en iyi ${pet.bestVisitStreak}`} />
                    <Tile label="Seri koruyucu" value={`🛡️ ${pet.freezes}/3`} sub="iş günü kaçırmayı korur" />
                    <Tile label="Rozet" value={`🏅 ${Object.keys(pet.achievements).length}/${pet.catalog.achievements.length}`} sub="kazanıldı" />
                  </section>
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">İstatistikler</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {STAT_LABELS.map((s) => (
                        <div key={s.key} className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
                          <div className="text-lg font-semibold tabular-nums">
                            {s.emoji} {pet.stats[s.key]}
                          </div>
                          <div className="text-[11px] text-ink-faint">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">Rozetler</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...pet.catalog.achievements]
                        .sort((a, b) => Number(Boolean(pet.achievements[b.id])) - Number(Boolean(pet.achievements[a.id])))
                        .map((a) => {
                          const got = pet.achievements[a.id];
                          return (
                            <div key={a.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${got ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/[0.07]' : 'border-line bg-white/[0.02] opacity-60'}`}>
                              <span className={`text-2xl ${got ? '' : 'grayscale'}`}>{a.emoji}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{a.name}</div>
                                <div className="text-[11px] text-ink-faint">{a.desc}</div>
                              </div>
                              <div className="text-right text-[11px] text-ink-faint">{got ? `✓ ${got.slice(5)}` : `+${a.reward} 🪙`}</div>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-ink-faint">{sub}</div>
    </div>
  );
}

function ItemCard({ it, pet, busy, run }: { it: PetItemInfo; pet: Pet; busy: string | null; run: (key: string, fn: () => Promise<Pet>) => Promise<void> }) {
  const isUse = it.kind === 'use';
  const owned = isUse ? false : pet.owned.includes(it.id);
  const placed = pet.placed.some((p) => p.itemId === it.id);
  const worn = pet.worn.includes(it.id);
  const dis = busy !== null;
  const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-white/[0.08] disabled:opacity-40';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] p-3">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-2xl">{it.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{it.name}</div>
        <div className="text-[11px] leading-snug text-ink-faint">{it.desc}</div>
      </div>
      {isUse && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-dim">{pet.freezes}/3</span>}
      {!owned ? (
        <button
          disabled={dis || pet.coins < it.price || (isUse && pet.freezes >= 3)}
          onClick={() => void run(`buy-${it.id}`, () => api.buyPetItem(it.id))}
          className="accent-gradient shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a0f05] disabled:opacity-40"
          title={isUse && pet.freezes >= 3 ? 'En fazla 3 adet' : pet.coins < it.price ? 'Yetersiz puan' : undefined}
        >
          🪙 {it.price}
        </button>
      ) : it.kind === 'wear' ? (
        <button disabled={dis} onClick={() => void run(`eq-${it.id}`, () => api.equipPetItem(it.id, !worn))} className={btn}>
          {worn ? 'Çıkar' : 'Tak'}
        </button>
      ) : it.id === 'bowl' ? (
        <span className="shrink-0 text-[11px] text-ink-faint">sürükleyerek taşıyın</span>
      ) : placed ? (
        <button disabled={dis} onClick={() => void run(`un-${it.id}`, () => api.unplacePetItem(it.id))} className={btn}>
          Kaldır
        </button>
      ) : (
        <button disabled={dis} onClick={() => void run(`pl-${it.id}`, () => api.placePetItem(it.id, 0.5, 0.11))} className="accent-gradient shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a0f05] disabled:opacity-40">
          Yerleştir
        </button>
      )}
    </div>
  );
}

export function PetButton({ pet, onClick }: { pet: Pet | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Evcil hayvan: mağaza, profil ve rozetler"
      aria-label="Evcil hayvan"
      className="relative inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-ink-dim transition-colors hover:bg-white/5 hover:text-ink"
    >
      <PawPrint size={16} />
      {pet && <span className="text-[11px] font-semibold tabular-nums text-accent">{pet.coins}</span>}
    </button>
  );
}

export { SKINS };
