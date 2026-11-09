import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, FileText, FolderKanban, Link2, MessagesSquare, Search, SquareKanban, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type CardStatus, type WikiPageFull, type WikiPageMeta } from '../lib/api';
import { relTime } from '../lib/time';
import { Markdown } from './Markdown';
import { Button, Empty, Panel, PanelTitle } from './ui';

const KINDS: { id: string; label: string; icon: typeof FileText }[] = [
  { id: 'overview', label: 'Genel bakış', icon: BookOpen },
  { id: 'project', label: 'Projeler', icon: FolderKanban },
  { id: 'person', label: 'Kişiler', icon: Users },
  { id: 'topic', label: 'Konular', icon: FileText },
  { id: 'thread', label: 'Yazışmalar', icon: MessagesSquare },
];
const STATUS_TR: Record<CardStatus, string> = { inbox: 'Gelen', todo: 'Yapılacak', doing: 'Devam', waiting: 'Beklemede', review: 'Kapatılabilir', done: 'Bitti' };

interface Detail {
  page: WikiPageFull;
  backlinks: { slug: string; title: string; kind: string }[];
  cards: { id: string; title: string; status: CardStatus }[];
}

export function WikiView({
  pages,
  onOpenCard,
  onBuild,
  building,
  onSelect,
  jumpTo,
}: {
  pages: WikiPageMeta[];
  onOpenCard: (id: string) => void;
  onBuild: () => void;
  building: boolean;
  onSelect?: (page: { slug: string; title: string }) => void;
  /** Aramadan gelen sayfaya git (n her seferinde artar) */
  jumpTo?: { slug: string; n: number } | null;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (jumpTo) setSlug(jumpTo.slug);
  }, [jumpTo?.n]);

  useEffect(() => {
    if (!slug && pages.length) setSlug(pages.find((p) => p.kind === 'overview')?.slug ?? pages[0].slug);
  }, [pages, slug]);

  useEffect(() => {
    if (!slug) return;
    setMissing(null);
    api
      .wikiPage(slug)
      .then((d) => {
        setDetail(d);
        onSelect?.({ slug: d.page.slug, title: d.page.title });
      })
      .catch(() => {
        setDetail(null);
        setMissing(slug);
      });
  }, [slug, pages]);

  const go = (s: string) => {
    if (slug) setHistory((h) => [...h.slice(-20), slug]);
    setSlug(s);
  };

  const titles = useMemo(() => Object.fromEntries(pages.map((p) => [p.slug, p.title])), [pages]);
  const filtered = useMemo(() => {
    const t = q.toLocaleLowerCase('tr');
    return t ? pages.filter((p) => `${p.title} ${p.summary}`.toLocaleLowerCase('tr').includes(t)) : pages;
  }, [pages, q]);

  if (!pages.length)
    return (
      <Panel className="flex h-full items-center justify-center p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Empty icon={<BookOpen size={34} />} title="Wiki henüz boş">
          Güneş, daha önce taradığı mail ve Teams kayıtlarından projeler ve kişiler için sayfalar oluşturup birbirine bağlayabilir. Outlook'u yeniden taramaz.
          Sayfalar bilgisayarınızda <code>data\wiki</code> klasörüne de yazılır; Obsidian ile açabilirsiniz.
          <div className="mt-4">
            <Button variant="primary" size="sm" onClick={onBuild} disabled={building}>
              {building ? 'Kuruluyor…' : "Kayıtlardan wiki'yi kur"}
            </Button>
          </div>
        </Empty>
      </Panel>
    );

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[300px_1fr]">
      <Panel className="flex min-h-0 flex-col p-4" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}>
        <div className="relative mb-3">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Wiki'de ara…"
            className="w-full rounded-lg border border-line bg-black/20 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[color:var(--accent)]/60"
          />
        </div>
        <div className="scroll-thin -mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          {KINDS.map((k) => {
            const list = filtered.filter((p) => p.kind === k.id);
            if (!list.length) return null;
            return (
              <div key={k.id}>
                <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                  <k.icon size={11} /> {k.label} <span className="ml-auto">{list.length}</span>
                </div>
                {list.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => go(p.slug)}
                    className={`relative block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors ${slug === p.slug ? 'text-ink' : 'text-ink-dim hover:bg-white/[0.05]'}`}
                  >
                    {slug === p.slug && <motion.span layoutId="wiki-sel" className="absolute inset-0 rounded-lg border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10" />}
                    <span className="relative block truncate text-[13px]">{p.title}</span>
                    <span className="relative block truncate text-[10.5px] text-ink-faint">{p.summary}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <AnimatePresence mode="wait">
          {missing ? (
            <motion.div key="missing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Empty icon={<FileText size={28} />} title={`"${missing}" sayfası henüz yok`}>
                Bu bağlantı henüz yazılmamış bir sayfaya gidiyor. Güneş'ten bu sayfayı oluşturmasını isteyebilirsiniz.
              </Empty>
            </motion.div>
          ) : detail ? (
            <motion.div
              key={detail.page.slug}
              className="flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            >
              <div className="mb-4 flex items-start gap-3 border-b border-line pb-4">
                {history.length > 0 && (
                  <button
                    onClick={() => {
                      const prev = history[history.length - 1];
                      setHistory((h) => h.slice(0, -1));
                      setSlug(prev);
                    }}
                    className="mt-1 rounded-lg p-1 text-ink-faint hover:bg-white/10 hover:text-ink"
                    title="Geri"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-accent">
                    {KINDS.find((k) => k.id === detail.page.kind)?.label ?? detail.page.kind} · {relTime(detail.page.updated_at)} güncellendi
                  </div>
                  <h2 className="font-display text-2xl font-semibold">{detail.page.title}</h2>
                  <p className="mt-1 text-sm text-ink-dim">{detail.page.summary}</p>
                </div>
              </div>

              <div className="scroll-thin grid min-h-0 flex-1 gap-6 overflow-y-auto pr-1 xl:grid-cols-[1fr_240px]">
                <Markdown onWikiLink={go} titles={titles} className="!text-[14px]">
                  {detail.page.content || '_Bu sayfa henüz boş._'}
                </Markdown>
                <aside className="space-y-5 text-sm">
                  {detail.cards.length > 0 && (
                    <div>
                      <PanelTitle icon={<SquareKanban size={13} />}>İlgili kartlar</PanelTitle>
                      <div className="space-y-1.5">
                        {detail.cards.map((c) => (
                          <button key={c.id} onClick={() => onOpenCard(c.id)} className="block w-full rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-left hover:border-line-strong">
                            <span className="block truncate text-[12.5px]">{c.title}</span>
                            <span className="text-[10.5px] text-ink-faint">{STATUS_TR[c.status]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.backlinks.length > 0 && (
                    <div>
                      <PanelTitle icon={<Link2 size={13} />}>Bu sayfaya bağlananlar</PanelTitle>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.backlinks.map((b) => (
                          <button key={b.slug} onClick={() => go(b.slug)} className="rounded-lg bg-[color:var(--accent)]/10 px-2 py-1 text-[12px] text-accent hover:bg-[color:var(--accent)]/20">
                            {b.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.page.sources.length > 0 && (
                    <div>
                      <PanelTitle icon={<MessagesSquare size={13} />}>Kaynaklar ({detail.page.sources.length})</PanelTitle>
                      <div className="space-y-1">
                        {detail.page.sources
                          .slice(-8)
                          .reverse()
                          .map((s, i) => (
                            <a
                              key={i}
                              href={s.link || undefined}
                              target="_blank"
                              rel="noreferrer"
                              className={`block truncate text-[12px] ${s.link ? 'text-ink-dim hover:text-ink' : 'pointer-events-none text-ink-faint'}`}
                            >
                              {s.type === 'teams' ? '💬' : '✉️'} {s.title || s.type}
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Panel>
    </div>
  );
}
