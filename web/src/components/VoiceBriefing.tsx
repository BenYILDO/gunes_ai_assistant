import { AnimatePresence, motion } from 'motion/react';
import { Check, Mic, MicOff, Pause, Play, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { listener, type ListenState } from '../lib/listener';
import { cancelSpeech, currentSpeech, speakAsync } from '../lib/speech';
import { isEcho, parseIntent, stripWake, type Intent } from '../lib/voiceCommands';
import type { Segment, SegmentAction } from '../lib/voiceScript';
import type { Phase } from '../lib/time';
import { SunCore } from './SunCore';

type Mode = 'speaking' | 'listening' | 'paused' | 'working';
const ANSWER_MS = 9000;

interface Props {
  segments: Segment[];
  phase: Phase;
  onAction: (a: SegmentAction) => Promise<void>;
  /** Brifing bitti ya da kullanıcı uygulamaya geçti */
  onExit: (r: { unanswered: string[]; skipped: boolean; completed: boolean }) => void;
}

export function VoiceBriefing({ segments, phase, onAction, onExit }: Props) {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('speaking');
  const [heard, setHeard] = useState('');
  const [mic, setMic] = useState<ListenState>(listener.state);
  const [deadline, setDeadline] = useState<number | null>(null);
  const resolver = useRef<{ accept: (i: Intent) => boolean; resolve: (i: Intent | 'timeout') => void } | null>(null);
  const stopped = useRef(false);
  const unanswered = useRef<string[]>([]);

  /** Mikrofon ya da buton olayı */
  const emit = (i: Intent) => {
    const r = resolver.current;
    if (r && i && r.accept(i)) {
      resolver.current = null;
      r.resolve(i);
    }
  };

  const waitEvent = (accept: (i: Intent) => boolean, ms?: number) =>
    new Promise<Intent | 'timeout'>((resolve) => {
      resolver.current = { accept, resolve };
      if (ms)
        setTimeout(() => {
          if (resolver.current?.resolve === resolve) {
            resolver.current = null;
            resolve('timeout');
          }
        }, ms);
    });

  /** Okur; bu sırada "dur/geç/uygulamaya geç/evet/hayır" gelirse susar */
  const say = async (text: string) => {
    setMode('speaking');
    const barge = waitEvent((i) => ['stop', 'skip', 'to_app', 'yes', 'no', 'open_board'].includes(String(i)));
    const r = await Promise.race([speakAsync(text, { force: true }).then(() => 'done' as const), barge]);
    if (r !== 'done') cancelSpeech();
    else resolver.current = null;
    return r;
  };

  useEffect(() => listener.onState(setMic), []);

  useEffect(() => {
    const off = listener.subscribe((text, final) => {
      setHeard(text);
      if (!final || isEcho(text, currentSpeech())) return;
      emit(parseIntent(stripWake(text) ?? text));
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    const exit = (skipped: boolean, from: number, completed = false) => {
      stopped.current = true;
      cancelSpeech();
      if (skipped) for (const s of segments.slice(from)) if (s.ask && !unanswered.current.includes(s.label)) unanswered.current.push(s.label);
      onExit({ unanswered: unanswered.current, skipped, completed });
    };

    const run = async () => {
      for (let i = 0; i < segments.length; i++) {
        if (stopped.current) return;
        setIdx(i);
        setHeard('');
        const s = segments[i];
        let r = await say(s.ask ? `${s.text} ${s.ask.question}` : s.text);
        if (stopped.current) return;
        if (r === 'to_app' || r === 'open_board') return exit(true, i);
        if (r === 'stop') {
          setMode('paused');
          const p = await waitEvent((x) => ['resume', 'skip', 'to_app', 'open_board', 'yes'].includes(String(x)));
          if (p === 'to_app' || p === 'open_board') return exit(true, i);
          if (p === 'skip') continue;
          i--; // aynı bölümü tekrar oku
          continue;
        }
        if (r === 'skip') continue;
        if (!s.ask) continue;

        // Soru: cevap bekle (söz kesilerek evet/hayır denmiş olabilir)
        let answer: Intent | 'timeout' = r === 'yes' || r === 'no' ? r : null;
        while (!answer || answer === 'detail' || answer === 'repeat') {
          if (answer === 'detail') await say(s.detail ?? 'Elimde daha fazla ayrıntı yok.');
          if (answer === 'repeat') await say(`${s.text} ${s.ask.question}`);
          setMode('listening');
          setDeadline(Date.now() + ANSWER_MS);
          answer = await waitEvent((x) => ['yes', 'no', 'skip', 'detail', 'repeat', 'to_app', 'open_board', 'stop'].includes(String(x)), ANSWER_MS);
          setDeadline(null);
          if (stopped.current) return;
        }
        if (answer === 'to_app' || answer === 'open_board') return exit(true, i);
        if (answer === 'yes') {
          setMode('working');
          await onAction(s.ask.yes).catch(() => undefined);
          r = await say(s.ask.yesAck);
        } else if (answer === 'no') {
          r = await say(s.ask.noAck);
        } else if (answer === 'timeout') {
          unanswered.current.push(s.label);
        }
      }
      exit(false, segments.length, true);
    };
    void run();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('to_app');
    window.addEventListener('keydown', onKey);
    return () => {
      stopped.current = true;
      cancelSpeech();
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seg = segments[idx];
  const listening = mode === 'listening';

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.97, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className="glass hud-corners fixed bottom-6 left-1/2 z-[58] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-3xl !bg-[rgb(12_10_30/0.96)] p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]"
    >
      {/* Ilerleme */}
      <div className="absolute inset-x-0 top-0 flex gap-1 px-5 pt-2.5">
        {segments.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full accent-gradient"
              initial={false}
              animate={{ width: i < idx ? '100%' : i === idx ? '55%' : '0%' }}
              transition={{ duration: 0.6 }}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-start gap-4">
        <div className="relative shrink-0">
          <SunCore size={64} phase={phase} busy={mode === 'speaking' || mode === 'working'} minimal />
          {listening && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-[color:var(--ok)]"
              animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0.2, 0.8] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 whitespace-nowrap text-[10.5px] uppercase tracking-[0.18em]">
            <span className="shrink-0 text-accent">Sesli brifing</span>
            <span className="min-w-0 truncate text-ink-faint">· {seg?.label}</span>
            <span className="ml-auto shrink-0 normal-case tracking-normal text-ink-faint">
              {mode === 'speaking' && 'konuşuyor…'}
              {listening && <span className="text-ok">{mic === 'listening' ? 'sizi dinliyorum' : 'cevabınızı bekliyorum'}</span>}
              {mode === 'paused' && 'duraklatıldı'}
              {mode === 'working' && 'yapıyorum…'}
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={seg?.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-1.5 line-clamp-4 text-[15px] leading-relaxed text-ink"
            >
              {seg?.text}
              {seg?.ask && <span className="mt-1 block font-medium text-accent">{seg.ask.question}</span>}
            </motion.p>
          </AnimatePresence>

          {/* Cevap süresi + duyulan */}
          <div className="mt-2 h-5 text-xs">
            {listening && deadline && (
              <motion.div className="h-[3px] rounded-full bg-[color:var(--ok)]/70" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: ANSWER_MS / 1000, ease: 'linear' }} />
            )}
            {heard && mic === 'listening' && <div className="mt-1 truncate italic text-ink-faint">🎙️ "{heard}"</div>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {seg?.ask && (
              <>
                <VBtn onClick={() => emit('yes')} primary icon={<Check size={13} />}>
                  Evet
                </VBtn>
                <VBtn onClick={() => emit('no')}>Sonra</VBtn>
                {seg.detail && <VBtn onClick={() => emit('detail')}>Detay</VBtn>}
              </>
            )}
            <VBtn onClick={() => emit('skip')} icon={<SkipForward size={13} />}>
              Geç
            </VBtn>
            {mode === 'paused' ? (
              <VBtn onClick={() => emit('resume')} icon={<Play size={13} />}>
                Devam
              </VBtn>
            ) : (
              <VBtn onClick={() => emit('stop')} icon={<Pause size={13} />}>
                Durdur
              </VBtn>
            )}
            <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-ink-faint md:flex">
              {mic === 'listening' ? <Mic size={11} className="text-ok" /> : <MicOff size={11} />}
              {mic === 'listening' ? '"evet", "sonra", "geç", "dur" diyebilirsiniz' : 'mikrofon kapalı — butonları kullanın'}
            </span>
          </div>
        </div>
        <button onClick={() => emit('to_app')} className="-mr-1 -mt-1 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] text-ink-dim hover:bg-white/10 hover:text-ink" title="Uygulamaya geç (Esc)">
          Uygulamaya geç <X size={13} />
        </button>
      </div>
    </motion.div>
  );
}

function VBtn({ children, onClick, primary, icon }: { children: string; onClick: () => void; primary?: boolean; icon?: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${primary ? 'accent-gradient font-semibold text-[#1a0f05]' : 'border border-line text-ink-dim hover:text-ink'}`}
    >
      {icon}
      {children}
    </motion.button>
  );
}
