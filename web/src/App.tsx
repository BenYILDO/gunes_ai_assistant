import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Card, type CardStatus, type Suggestion } from './lib/api';
import { usePoll } from './lib/hooks';
import { phaseOf, relTime, type Phase } from './lib/time';
import { Board } from './components/Board';
import { BriefingPanel } from './components/Briefing';
import { CardModal } from './components/CardModal';
import { ChatPanel } from './components/ChatPanel';
import { Header, type View } from './components/Header';
import { HistoryView } from './components/HistoryView';
import { Intro } from './components/Intro';
import { MemoryView } from './components/MemoryView';
import { Sky } from './components/Sky';
import { SuggestionsPanel } from './components/Suggestions';
import { useToast } from './components/Toasts';

const params = new URLSearchParams(location.search);
const today = () => new Date().toLocaleDateString('sv-SE');
const INTRO_KEY = 'gunes.introDay';

function shouldPlayIntro() {
  if (params.get('intro') === '1') return true;
  if (params.get('intro') === '0') return false;
  try {
    return localStorage.getItem(INTRO_KEY) !== today();
  } catch {
    return true;
  }
}

function usePhase(): Phase {
  const forced = params.get('phase') as Phase | null;
  const [phase, setPhase] = useState<Phase>(forced ?? phaseOf());
  useEffect(() => {
    if (forced) return;
    const t = setInterval(() => setPhase(phaseOf()), 60_000);
    return () => clearInterval(t);
  }, [forced]);
  useEffect(() => {
    document.documentElement.dataset.phase = phase;
  }, [phase]);
  return phase;
}

export default function App() {
  const phase = usePhase();
  const toast = useToast();
  const [view, setView] = useState<View>('board');
  const [chatOpen, setChatOpen] = useState(false);
  const [intro, setIntro] = useState(shouldPlayIntro);
  const [introReady, setIntroReady] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const status = usePoll(api.status, 4000);
  const running = status.data?.run.running ?? null;
  const board = usePoll(() => api.board(), 15000);
  const briefing = usePoll(api.briefing, 30000);
  const suggestions = usePoll(api.suggestions, 30000);
  const memory = usePoll(api.memory, view === 'memory' ? 30000 : 0, [view]);
  const runs = usePoll(api.runs, view === 'history' ? 8000 : 0, [view]);

  const refreshAll = useCallback(() => {
    void board.refresh();
    void briefing.refresh();
    void suggestions.refresh();
    void status.refresh();
  }, [board, briefing, suggestions, status]);

  // Çalışma bittiğinde her şeyi yenile, sonucu bildir
  const prevRunning = useRef<string | null>(null);
  useEffect(() => {
    if (prevRunning.current && !running) {
      refreshAll();
      void runs.refresh();
      const r = status.data?.run.lastResult;
      if (r?.status === 'error') toast(`Çalışma hata verdi: ${r.message.slice(0, 120)}`, 'error');
      else if (r) toast(r.status === 'skipped' ? r.message : 'Güneş çalışmasını tamamladı');
    }
    if (running) void board.refresh();
    prevRunning.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, status.data?.run.step]);

  // Intro'yu veriler gelince (ya da en geç 1.5 sn sonra) başlat
  useEffect(() => {
    if (!intro) return;
    if (status.data && board.data) setIntroReady(true);
    const t = setTimeout(() => setIntroReady(true), 1500);
    return () => clearTimeout(t);
  }, [intro, status.data, board.data]);

  const finishIntro = useCallback(() => {
    try {
      localStorage.setItem(INTRO_KEY, today());
    } catch {
      /* yoksay */
    }
    setIntro(false);
  }, []);

  const cards = board.data?.cards ?? [];
  const projects = board.data?.projects ?? [];
  const openCard = cards.find((c) => c.id === openCardId) ?? null;
  const user = status.data?.user;

  const bootLines = useMemo(() => {
    const s = status.data;
    const open = cards.filter((c) => c.status !== 'done').length;
    const sugg = suggestions.data?.length ?? 0;
    return [
      'Ruh ve hafıza yüklendi',
      s?.schedule.lastCollect ? `Outlook ve Teams · son tarama ${relTime(s.schedule.lastCollect)}` : 'Outlook ve Teams bağlantısı hazır',
      `Pano hazır · ${open} açık kart`,
      sugg ? `${sugg} konu gözünüzden kaçmasın diye işaretlendi` : 'Gözden kaçan bir şey görünmüyor',
      s?.store === 'supabase' ? 'Veriler Supabase\'te güvende' : 'Yerel veri deposu kullanılıyor',
    ];
  }, [status.data, cards, suggestions.data]);

  // ---------- Eylemler
  const moveCard = async (card: Card, to: CardStatus) => {
    board.setData((d) => (d ? { ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, status: to, updated_at: new Date().toISOString() } : c)) } : d));
    try {
      await api.updateCard(card.id, { status: to });
      if (to === 'done') toast(`"${card.title.slice(0, 40)}" kapatıldı`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    void board.refresh();
  };

  const quickAdd = async (title: string, status: CardStatus) => {
    try {
      await api.createCard({ title, status });
      void board.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const actSuggestion = async (s: Suggestion, st: 'accepted' | 'dismissed', lesson?: string) => {
    suggestions.setData((d) => d?.filter((x) => x.id !== s.id) ?? d);
    await api.updateSuggestion(s.id, st, lesson).catch(() => undefined);
    if (lesson) toast('Anladım, bunu tekrar sormayacağım');
  };

  const run = async (k: 'morning' | 'tracker' | 'backfill') => {
    try {
      await api.run(k);
      toast(k === 'backfill' ? 'Geçmiş taraması başladı — biraz sürebilir' : 'Güneş taramaya başladı');
      setTimeout(() => void status.refresh(), 400);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const offline = status.error && !status.data;

  return (
    <LayoutGroup>
      <Sky phase={phase} busy={Boolean(running)} />

      <AnimatePresence>
        {intro && introReady && (
          <Intro
            key="intro"
            phase={phase}
            userName={user?.name ?? 'Yıldıray'}
            userTitle={user?.title ?? 'Bey'}
            headline={briefing.data?.morning && Date.now() - new Date(briefing.data.morning.created_at).getTime() < 14 * 3600_000 ? briefing.data.morning.headline : null}
            bootLines={bootLines}
            onDone={finishIntro}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="flex h-full flex-col"
        initial={false}
        animate={{ opacity: intro ? 0 : 1, scale: intro ? 0.985 : 1, filter: intro ? 'blur(6px)' : 'blur(0px)' }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <Header
          phase={phase}
          status={status.data}
          view={view}
          onView={setView}
          onRun={(k) => void run(k)}
          onChat={() => setChatOpen((o) => !o)}
          onReplayIntro={() => {
            setIntroReady(true);
            setIntro(true);
          }}
          showSun={!intro}
        />

        {offline && (
          <div className="mx-6 mb-3 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-2 text-sm">
            Güneş sunucusuna ulaşılamıyor. Bilgisayarda <code>npm start</code> çalışıyor mu?
          </div>
        )}

        <main className={`min-h-0 flex-1 px-6 pb-5 transition-[padding] duration-500 ${chatOpen ? 'lg:pr-[490px]' : ''}`}>
          <AnimatePresence mode="wait">
            {view === 'board' && (
              <motion.div
                key="board"
                className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <div className="scroll-thin min-h-0 space-y-4 overflow-y-auto pr-1 max-lg:max-h-[45vh]">
                  <BriefingPanel
                    briefing={briefing.data?.morning ?? null}
                    updates={briefing.data?.updates ?? []}
                    status={status.data}
                    onRun={(k) => void run(k)}
                  />
                  <SuggestionsPanel items={suggestions.data ?? []} onAct={(s, st, l) => void actSuggestion(s, st, l)} onOpenCard={setOpenCardId} />
                </div>
                <div className="min-h-0 min-w-0">
                  <Board cards={cards} projects={projects} onMove={(c, s) => void moveCard(c, s)} onOpen={(c) => setOpenCardId(c.id)} onQuickAdd={(t, s) => void quickAdd(t, s)} />
                </div>
              </motion.div>
            )}
            {view === 'memory' && (
              <motion.div key="memory" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <MemoryView memories={memory.data?.memories ?? []} journal={memory.data?.journal ?? []} onChange={() => void memory.refresh()} />
              </motion.div>
            )}
            {view === 'history' && (
              <motion.div key="history" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <HistoryView runs={runs.data ?? []} updates={briefing.data?.updates ?? []} status={status.data} onRun={(k) => void run(k)} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </motion.div>

      <ChatPanel
        open={chatOpen}
        phase={phase}
        userName={user ? `${user.name} ${user.title}` : ''}
        onClose={() => setChatOpen(false)}
        onActivity={refreshAll}
      />

      <AnimatePresence>
        {openCard && (
          <CardModal
            key={openCard.id}
            card={openCard}
            projects={projects}
            onClose={() => setOpenCardId(null)}
            onSave={async (patch) => {
              try {
                await api.updateCard(openCard.id, patch);
                await board.refresh();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
            onDelete={async (noise) => {
              await api.deleteCard(openCard.id, noise);
              setOpenCardId(null);
              toast(noise ? 'Silindi — Güneş bu tür kartları açmamayı öğrendi' : 'Kart silindi');
              void board.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
