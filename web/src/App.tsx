import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Card, type CardStatus, type Nudge, type PendingAction, type Suggestion, type WeatherKind } from './lib/api';
import { buildAgenda } from './lib/agenda';
import { voiceEnabled as voiceEnabledNow } from './lib/speech';
import { Approvals } from './components/Approvals';
import { useLocalFlag, usePoll } from './lib/hooks';
import { phaseOf, relTime, type Phase } from './lib/time';
import { BoardWorkspace } from './components/BoardWorkspace';
import { BriefingPanel } from './components/Briefing';
import { CardModal } from './components/CardModal';
import { ChatPanel } from './components/ChatPanel';
import { Header, type View } from './components/Header';
import { HistoryView } from './components/HistoryView';
import { Intro } from './components/Intro';
import { MemoryView } from './components/MemoryView';
import { WikiView } from './components/WikiView';
import { BriefingView } from './components/BriefingView';
import { Farewell } from './components/Farewell';
import { EndOfDayPrompt } from './components/EndOfDayPrompt';
import { VoiceBriefing } from './components/VoiceBriefing';
import { buildScript, type Segment, type SegmentAction } from './lib/voiceScript';
import { listener, micPreference } from './lib/listener';
import { currentSpeech, voiceTest } from './lib/speech';
import { runVoiceDiag } from './lib/voiceDiag';
import { isEcho, parseIntent, stripWake } from './lib/voiceCommands';
import { NudgePopup } from './components/NudgePopup';
import { Sky } from './components/Sky';
import { SuggestionsPanel } from './components/Suggestions';
import { useToast } from './components/Toasts';

const params = new URLSearchParams(location.search);
const todayKey = () => new Date().toLocaleDateString('sv-SE');
const INTRO_KEY = 'gunes.introDay';

/** Karşılama her açılışta (yükleme ekranı gibi) oynar; ?intro=0 ile kapatılabilir. */
function shouldPlayIntro() {
  return params.get('intro') !== '0';
}

/** Sesli karşılama sadece günün ilk açılışında yapılır (sonrakiler sessiz). */
function firstOpenToday() {
  try {
    return localStorage.getItem(INTRO_KEY) !== todayKey();
  } catch {
    return true;
  }
}
const SPEAK_TODAY = params.get('intro') === '1' || firstOpenToday();
/** Günün ilk açılışında karşılamadan sonra sesli brifing otomatik başlar (?voice=1 ile zorlanır) */
const AUTO_VOICE = params.get('voice') === '1' || (SPEAK_TODAY && params.get('voice') !== '0');

function usePhase(sun?: { sunrise: string | null; sunset: string | null }): Phase {
  const forced = params.get('phase') as Phase | null;
  const [phase, setPhase] = useState<Phase>(forced ?? phaseOf(new Date(), sun));
  useEffect(() => {
    if (forced) return;
    setPhase(phaseOf(new Date(), sun));
    const t = setInterval(() => setPhase(phaseOf(new Date(), sun)), 60_000);
    return () => clearInterval(t);
  }, [forced, sun?.sunrise, sun?.sunset]);
  useEffect(() => {
    document.documentElement.dataset.phase = phase;
  }, [phase]);
  return phase;
}

/** Konum izni istenir (Windows/Edge konumu); izin yoksa sunucu .env'deki ya da varsayılan konumu kullanır. */
function useLocationShare(onDone: () => void) {
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => void api.setLocation(pos.coords.latitude, pos.coords.longitude).then(onDone).catch(() => undefined),
      () => undefined,
      { maximumAge: 30 * 60_000, timeout: 15_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function App() {
  const weather = usePoll(api.weather, 15 * 60_000);
  const today = usePoll(api.today, 60_000);
  useLocationShare(() => {
    void weather.refresh();
    void today.refresh();
    void nudges.refresh();
  });
  const forcedWeather = params.get('weather') as WeatherKind | null;
  const weatherKind = forcedWeather ?? weather.data?.kind ?? null;
  const phase = usePhase(weather.data ?? undefined);
  const toast = useToast();
  // Günün ilk açılışında Brifing ekranı, sonra son kullanılan ekran
  const [view, setViewState] = useState<View>(() => {
    if (SPEAK_TODAY) return 'briefing';
    try {
      return (localStorage.getItem('gunes.view') as View) || 'briefing';
    } catch {
      return 'briefing';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem('gunes.view', v);
    } catch {
      /* yoksay */
    }
  };
  const [farewell, setFarewell] = useState(false);
  const [voiceSegs, setVoiceSegs] = useState<Segment[] | null>(null);
  const [chatExternal, setChatExternal] = useState<{ id: number; text: string } | null>(null);
  const autoVoiceDone = useRef(false);
  const [eodPrompt, setEodPrompt] = useState(false);
  const [chatOpen, setChatOpen] = useState(Boolean(params.get('chat')));
  const [focusSession, setFocusSession] = useState<string | null>(params.get('chat'));
  const [intro, setIntro] = useState(shouldPlayIntro);
  const [introReady, setIntroReady] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useLocalFlag('gunes.boardFocus', false);

  const status = usePoll(api.status, 4000);
  const running = status.data?.run.running ?? null;
  const board = usePoll(() => api.board(), 15000);
  const briefing = usePoll(api.briefing, 30000);
  const suggestions = usePoll(api.suggestions, 30000);
  const actions = usePoll(api.actions, 20000);
  const nudges = usePoll(api.nudges, 30000);

  // Sunucuya "arayüz açık ve görünür" sinyali: kapalıyken Güneş Windows bildirimi gönderir
  useEffect(() => {
    const beat = () => void api.presence(document.visibilityState === 'visible').catch(() => undefined);
    beat();
    const t = setInterval(beat, 30_000);
    document.addEventListener('visibilitychange', beat);
    // Bildirim izni (ilk tıklamada istenir)
    const ask = () => {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      window.removeEventListener('click', ask);
    };
    window.addEventListener('click', ask);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
      window.removeEventListener('click', ask);
    };
  }, []);

  // ---------- Ses: sesli brifing ve "Güneş, …" komutları
  const sendToChat = (text: string) => {
    setFocusSession(null);
    setChatOpen(true);
    setChatExternal({ id: Date.now(), text });
  };

  const startVoice = () => {
    setView('briefing');
    setVoiceSegs(
      buildScript({
        name: user ? `${user.name} ${user.title}` : '',
        today: today.data,
        briefing: briefing.data?.morning ?? null,
        suggestions: suggestions.data ?? [],
        weather: weather.data,
        pendingApprovals: actions.data?.length ?? 0,
      }),
    );
  };

  const voiceAction = async (a: SegmentAction) => {
    if (a.kind === 'card_doing') {
      await api.updateCard(a.cardId, { status: 'doing' });
      void board.refresh();
      void today.refresh();
    } else if (a.kind === 'draft') sendToChat(a.prompt);
    else if (a.kind === 'suggestion_ok') await api.updateSuggestion(a.id, 'accepted');
  };

  const voiceExit = (r: { unanswered: string[]; skipped: boolean; completed: boolean }) => {
    setVoiceSegs(null);
    if (r.skipped || r.unanswered.length) {
      // Cevapsız kaldıysa Güneş birkaç saniye sonra günlük scrum mesajı bırakır
      setTimeout(() => {
        void api
          .briefingFollowup(r.unanswered, r.skipped)
          .then(() => nudges.refresh())
          .catch(() => undefined);
      }, r.skipped ? 4000 : 1500);
    }
  };

  // Mikrofon: tercih açıksa uygulama açılınca dinlemeye başla
  useEffect(() => {
    if (micPreference()) listener.start();
  }, []);

  // Karşılama bitince günün ilk açılışında sesli brifing
  useEffect(() => {
    if (intro || autoVoiceDone.current || !AUTO_VOICE || !voiceEnabledNow()) return;
    // Gündem ve brifing ikisi de gelince başla (veriler farklı anlarda gelebilir)
    if (!today.data || !briefing.data) return;
    const t = setTimeout(() => {
      if (autoVoiceDone.current) return;
      autoVoiceDone.current = true;
      startVoice();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, today.data, briefing.data]);

  // Brifing dışında: "Güneş, …" ile başlayan cümleler komut ya da sohbet olur
  useEffect(() => {
    if (voiceSegs || farewell) return;
    return listener.subscribe((text, final) => {
      if (!final || isEcho(text, currentSpeech())) return;
      const rest = stripWake(text);
      if (rest === null) return;
      const intent = parseIntent(rest);
      if (intent === 'open_board') setView('board');
      else if (intent === 'open_briefing') setView('briefing');
      else if (intent === 'open_wiki') setView('wiki');
      else if (intent === 'end_day') setFarewell(true);
      else if (intent === 'scan') void run('tracker');
      else if (intent === 'briefing') startVoice();
      else if (rest.length > 2) {
        toast(`🎙️ "${rest}"`);
        sendToChat(rest);
      } else toast('🎙️ Buradayım, dinliyorum.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSegs, farewell, today.data, briefing.data, suggestions.data, weather.data, actions.data]);

  // Mesai bitince (günde bir kez) "Günü kapatalım mı?" diye sor
  useEffect(() => {
    const check = async () => {
      const end = status.data?.schedule.schedule.workEnd;
      if (!end || document.visibilityState !== 'visible') return;
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      const key = now.toLocaleDateString('sv-SE');
      if (hhmm < end) return;
      try {
        if (localStorage.getItem('gunes.eodAsked') === key) return;
        const st = await api.dayState();
        if (st.dayEnded && new Date(st.dayEnded).toLocaleDateString('sv-SE') === key) return;
        localStorage.setItem('gunes.eodAsked', key);
      } catch {
        return;
      }
      setEodPrompt(true);
    };
    void check();
    const t = setInterval(() => void check(), 60_000);
    return () => clearInterval(t);
  }, [status.data?.schedule.schedule.workEnd]);

  const talkNudge = useCallback((n: Nudge) => {
    nudges.setData((list) => list?.filter((x) => x.id !== n.id) ?? list);
    void api.seenNudge(n.id).catch(() => undefined);
    setFocusSession(n.id);
    setChatOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const laterNudge = useCallback((n: Nudge) => {
    nudges.setData((list) => list?.filter((x) => x.id !== n.id) ?? list);
    void api.seenNudge(n.id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const memory = usePoll(api.memory, view === 'memory' ? 30000 : 0, [view]);
  const runs = usePoll(api.runs, view === 'history' ? 8000 : 0, [view]);
  const wiki = usePoll(api.wiki, view === 'wiki' ? 30000 : 0, [view]);

  const refreshAll = useCallback(() => {
    void board.refresh();
    void briefing.refresh();
    void suggestions.refresh();
    void actions.refresh();
    void today.refresh();
    void memory.refresh();
    void status.refresh();
  }, [board, briefing, suggestions, actions, memory, status, today, nudges]);

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
      localStorage.setItem(INTRO_KEY, todayKey());
    } catch {
      /* yoksay */
    }
    setIntro(false);
  }, []);

  const cards = board.data?.cards ?? [];
  const projects = board.data?.projects ?? [];
  const openCard = cards.find((c) => c.id === openCardId) ?? null;
  const user = status.data?.user;

  const agenda = useMemo(() => buildAgenda(today.data), [today.data]);

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

  const resolveAction = async (a: PendingAction, d: 'approve' | 'reject') => {
    actions.setData((list) => list?.filter((x) => x.id !== a.id) ?? list);
    try {
      await api.resolveAction(a.id, d);
      toast(d === 'approve' ? 'Silindi' : 'Kalıyor — Güneş bunu not etti');
      void board.refresh();
      void memory.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
      void actions.refresh();
    }
  };

  const run = async (k: 'morning' | 'tracker' | 'backfill' | 'wiki') => {
    try {
      await api.run(k);
      toast(k === 'backfill' ? 'Geçmiş taraması başladı — biraz sürebilir' : k === 'wiki' ? 'Güneş wiki’yi kayıtlardan kuruyor' : 'Güneş taramaya başladı');
      setTimeout(() => void status.refresh(), 400);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const offline = status.error && !status.data;

  return (
    <LayoutGroup>
      <Sky phase={phase} busy={Boolean(running)} weather={weatherKind} />

      <AnimatePresence>
        {intro && introReady && (
          <Intro
            key="intro"
            phase={phase}
            userName={user?.name ?? 'Yıldıray'}
            userTitle={user?.title ?? 'Bey'}
            headline={briefing.data?.morning && Date.now() - new Date(briefing.data.morning.created_at).getTime() < 14 * 3600_000 ? briefing.data.morning.headline : null}
            bootLines={bootLines}
            agenda={agenda.items}
            agendaSpeech={agenda.speech}
            weather={weather.data}
            voice={SPEAK_TODAY && !(AUTO_VOICE && voiceEnabledNow())}
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
          onChat={() => {
            setFocusSession(null);
            setChatOpen((o) => !o);
          }}
          onReplayIntro={() => {
            setIntroReady(true);
            setIntro(true);
          }}
          showSun={!intro}
          weather={weather.data}
          onEndDay={() => setFarewell(true)}
        />

        {offline && (
          <div className="mx-6 mb-3 rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-2 text-sm">
            Güneş sunucusuna ulaşılamıyor. Bilgisayarda <code>npm start</code> çalışıyor mu?
          </div>
        )}

        <main className={`min-h-0 flex-1 px-6 pb-5 transition-[padding] duration-500 ${chatOpen ? 'lg:pr-[490px]' : ''}`}>
          <AnimatePresence mode="wait">
            {view === 'briefing' && (
              <motion.div key="briefing" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <BriefingView
                  phase={phase}
                  status={status.data}
                  userName={user ? `${user.name} ${user.title}` : ''}
                  briefing={briefing.data?.morning ?? null}
                  updates={briefing.data?.updates ?? []}
                  today={today.data}
                  agenda={agenda.items}
                  weather={weather.data}
                  suggestions={suggestions.data ?? []}
                  actions={actions.data ?? []}
                  onAct={(s, st, l) => void actSuggestion(s, st, l)}
                  onResolve={(a, d) => void resolveAction(a, d)}
                  onOpenCard={setOpenCardId}
                  onRun={(k) => void run(k)}
                  onGoBoard={() => setView('board')}
                  onVoice={() => startVoice()}
                  onVoiceDiag={async () => {
                    toast('Ses tanılama çalışıyor… (birkaç kısa "test" sesi ve bir bip duyabilirsiniz)');
                    const r = await runVoiceDiag();
                    await api.diagVoice(r).catch(() => undefined);
                    const ok = r.tries.filter((t) => t.started).map((t) => t.voice);
                    const bad = r.tries.filter((t) => !t.started).map((t) => `${t.voice}: ${t.error}`);
                    toast(
                      `Bip: ${r.beep.ok ? 'çalıştı' : 'çalışmadı (' + r.beep.state + ')'} · Çalışan sesler: ${ok.join(', ') || 'yok'}${bad.length ? ` · Sorunlu: ${bad.join('; ')}` : ''} — rapor: data\\diag-voice.json`,
                      ok.length ? 'ok' : 'error',
                    );
                  }}
                  onVoiceTest={async () => {
                    const r = await voiceTest(user ? `${user.name} ${user.title}` : '');
                    if (!r.ok) toast('Bu tarayıcı sesli okumayı desteklemiyor', 'error');
                    else if (!r.turkish.length) toast('Türkçe ses bulunamadı — Windows Ayarlar › Zaman ve dil › Konuşma’dan Türkçe ses ekleyin', 'error');
                    else if (!r.started) toast(`Ses motoru başlamadı${r.error ? ` (${r.error})` : ''} — Güneş penceresini kapatıp masaüstü simgesinden yeniden açın`, 'error');
                    else toast(`🔊 ${r.voice}${/emel/i.test(r.voice ?? '') ? '' : ' (Emel bulunamadı)'} · konuşuyor; duymuyorsanız ses karıştırıcısına bakın`);
                  }}
                />
              </motion.div>
            )}
            {view === 'board' && (
              <motion.div
                key="board"
                className={`grid h-full grid-cols-1 gap-4 ${focusMode ? '' : 'lg:grid-cols-[360px_1fr]'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <AnimatePresence initial={false}>
                {!focusMode && (
                <motion.div
                  key="side"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
                  className="scroll-thin min-h-0 space-y-4 overflow-y-auto pr-1 max-lg:max-h-[45vh]"
                >
                  <Approvals items={actions.data ?? []} onResolve={(a, d) => void resolveAction(a, d)} />
                  <BriefingPanel
                    agenda={agenda.items}
                    briefing={briefing.data?.morning ?? null}
                    updates={briefing.data?.updates ?? []}
                    status={status.data}
                    onRun={(k) => void run(k)}
                  />
                  <SuggestionsPanel items={suggestions.data ?? []} onAct={(s, st, l) => void actSuggestion(s, st, l)} onOpenCard={setOpenCardId} />
                </motion.div>
                )}
                </AnimatePresence>
                <motion.div layout transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="min-h-0 min-w-0">
                  <BoardWorkspace
                    cards={cards}
                    projects={projects}
                    focus={focusMode}
                    onFocus={setFocusMode}
                    onMove={(c, s) => void moveCard(c, s)}
                    onOpen={(c) => setOpenCardId(c.id)}
                    onQuickAdd={(t, s) => void quickAdd(t, s)}
                  />
                </motion.div>
              </motion.div>
            )}
            {view === 'wiki' && (
              <motion.div key="wiki" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <WikiView pages={wiki.data ?? []} onOpenCard={setOpenCardId} onBuild={() => void run('wiki')} building={running === 'wiki'} />
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
        onClose={() => {
          setChatOpen(false);
          setFocusSession(null);
        }}
        focusSession={focusSession}
        onActivity={refreshAll}
        onEndDay={() => setFarewell(true)}
        externalMessage={chatExternal}
      />

      <AnimatePresence>
        {voiceSegs && <VoiceBriefing key="voice" segments={voiceSegs} phase={phase} onAction={voiceAction} onExit={voiceExit} />}
      </AnimatePresence>

      <EndOfDayPrompt
        open={eodPrompt && !farewell}
        phase={phase}
        onYes={() => {
          setEodPrompt(false);
          setFarewell(true);
        }}
        onNo={() => setEodPrompt(false)}
      />

      <AnimatePresence>
        {farewell && <Farewell key="farewell" userName={user ? `${user.name} ${user.title}` : ''} voice={voiceEnabledNow()} onCancel={() => setFarewell(false)} />}
      </AnimatePresence>

      <NudgePopup items={chatOpen ? (nudges.data ?? []).filter((n) => n.id !== focusSession) : (nudges.data ?? [])} phase={phase} onTalk={talkNudge} onLater={laterNudge} />

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
