import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, ChevronDown, Loader2, MessageSquarePlus, Square, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, streamChat, type ChatMessage, type ChatSession } from '../lib/api';
import { relTime, type Phase } from '../lib/time';
import { Markdown } from './Markdown';
import { SunCore } from './SunCore';

interface Props {
  open: boolean;
  phase: Phase;
  userName: string;
  onClose: () => void;
  onActivity: () => void;
  /** Açılınca gösterilecek sohbet (ör. Güneş'in başlattığı) */
  focusSession?: string | null;
  /** Kullanıcı günü kapatmak istediğinde ("bugünlük bu kadar") */
  onEndDay?: () => void;
  /** Sesli komut ya da brifingden gelen mesaj (açılınca gönderilir) */
  externalMessage?: { id: number; text: string } | null;
}

interface LiveMsg extends Omit<ChatMessage, 'id' | 'created_at'> {
  id: string;
  live?: boolean;
}

const STARTERS = [
  'Bugün neye odaklanmalıyım?',
  'Cevap vermediğim mailler hangileri?',
  'Beklediğim dönüşleri listele',
  'Rakiplerimiz depo otomasyonunda neler yapıyor? Araştır',
];

export function ChatPanel({ open, phase, userName, onClose, onActivity, focusSession, onEndDay, externalMessage }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = () => api.chatSessions().then(setSessions).catch(() => undefined);
  useEffect(() => {
    if (open) {
      void loadSessions();
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const openSession = async (id: string) => {
    setShowHistory(false);
    setSessionId(id);
    setMessages(await api.chatMessages(id));
  };

  useEffect(() => {
    if (open && focusSession) void openSession(focusSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusSession]);

  const newChat = () => {
    abortRef.current?.abort();
    setSessionId(null);
    setMessages([]);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    // Açık veda ifadeleri: modeli beklemeden uğurlama ekranını aç
    if (onEndDay && /^(bugünlük (bu kadar|yeter)|(ben )?çıkıyorum|mesai (bitti|tamam)|günü kapat|iyi akşamlar|yarın görüşürüz)[\s.!,]*$/i.test(msg.toLocaleLowerCase('tr'))) {
      setInput('');
      onEndDay();
      return;
    }
    setInput('');
    setBusy(true);
    const liveId = `live-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, session_id: sessionId ?? '', role: 'user', content: msg, tools: [] },
      { id: liveId, session_id: sessionId ?? '', role: 'assistant', content: '', tools: [], live: true },
    ]);
    const patch = (fn: (m: LiveMsg) => LiveMsg) => setMessages((all) => all.map((m) => (m.id === liveId ? fn(m) : m)));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let usedTools = false;
    try {
      await streamChat(
        { sessionId, message: msg },
        (e) => {
          if (e.type === 'session') setSessionId(e.id);
          else if (e.type === 'text') patch((m) => ({ ...m, content: m.content + e.text }));
          else if (e.type === 'tool') {
            usedTools = true;
            if (e.label === 'Günü kapatıyor') setTimeout(() => onEndDay?.(), 1500);
            patch((m) => ({ ...m, tools: [...m.tools, e.label], content: m.content && !m.content.endsWith('\n\n') ? m.content + '\n\n' : m.content }));
          } else if (e.type === 'tool_done') {
            const secs = e.ms < 1000 ? '<1 sn' : `${Math.round(e.ms / 1000)} sn`;
            patch((m) => {
              const i = m.tools.findIndex((t) => t === e.label);
              if (i < 0) return m;
              const tools = [...m.tools];
              tools[i] = `${e.label} · ${secs}`;
              return { ...m, tools };
            });
          } else if (e.type === 'done') patch((m) => ({ ...m, content: e.text || m.content, live: false }));
        },
        ctrl.signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') patch((m) => ({ ...m, content: `⚠️ ${(err as Error).message}`, live: false }));
      else patch((m) => ({ ...m, live: false }));
    } finally {
      setBusy(false);
      void loadSessions();
      if (usedTools) onActivity();
    }
  };

  const lastExternal = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !externalMessage || lastExternal.current === externalMessage.id) return;
    lastExternal.current = externalMessage.id;
    const t = setTimeout(() => void send(externalMessage.text), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, externalMessage]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="glass fixed bottom-3 right-3 top-[86px] z-40 flex w-[min(470px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl !bg-[rgb(12_10_30/0.86)]"
            initial={{ x: '110%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '110%', opacity: 0.5 }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          >
            {/* Başlık */}
            <div className="relative flex items-center gap-3 border-b border-line px-4 py-3">
              <SunCore size={38} phase={phase} busy={busy} minimal />
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-semibold">Güneş</div>
                <div className="text-[11px] text-ink-faint">
                  {busy ? <span className="text-accent">düşünüyor…</span> : 'Outlook, Teams ve panonuza erişimim var'}
                </div>
              </div>
              <button
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-ink-dim hover:bg-white/10"
              >
                Geçmiş
                <motion.span animate={{ rotate: showHistory ? 180 : 0 }}>
                  <ChevronDown size={12} />
                </motion.span>
              </button>
              <button onClick={newChat} title="Yeni sohbet" className="rounded-lg p-1.5 text-ink-dim hover:bg-white/10 hover:text-ink">
                <MessageSquarePlus size={16} />
              </button>
              <button onClick={onClose} className="rounded-lg p-1.5 text-ink-dim hover:bg-white/10 hover:text-ink">
                <X size={16} />
              </button>

              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    className="scroll-thin absolute left-3 right-3 top-[calc(100%+6px)] z-10 max-h-80 overflow-y-auto rounded-xl border border-line-strong bg-[rgb(14_11_32/0.96)] p-1.5 shadow-2xl backdrop-blur-xl"
                  >
                    {!sessions.length && <div className="p-3 text-center text-xs text-ink-faint">Henüz sohbet yok</div>}
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-white/[0.07] ${s.id === sessionId ? 'bg-white/[0.06]' : ''}`}
                      >
                        <button className="min-w-0 flex-1 truncate text-left" onClick={() => void openSession(s.id)}>
                          {s.title}
                        </button>
                        <span className="text-[10px] text-ink-faint">{relTime(s.updated_at)}</span>
                        <button
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={async () => {
                            await api.deleteChat(s.id);
                            if (s.id === sessionId) newChat();
                            void loadSessions();
                          }}
                        >
                          <Trash2 size={12} className="text-ink-faint hover:text-danger" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mesajlar */}
            <div ref={scroller} className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!messages.length && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex h-full flex-col items-center justify-center text-center">
                  <SunCore size={110} phase={phase} />
                  <div className="mt-3 font-display text-lg">Size nasıl yardımcı olayım, {userName}?</div>
                  <p className="mt-1 max-w-xs text-xs text-ink-faint">
                    Mail ve Teams geçmişinizi tarayabilir, kart açıp güncelleyebilir, cevap taslağı hazırlayabilir ya da bir konuyu araştırabilirim.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {STARTERS.map((s, i) => (
                      <motion.button
                        key={s}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.07 }}
                        whileHover={{ y: -2 }}
                        onClick={() => void send(s)}
                        className="rounded-xl border border-line bg-white/[0.04] px-3 py-2 text-xs text-ink-dim hover:border-[color:var(--accent)]/50 hover:text-ink"
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex gap-2.5'}
                >
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/12 px-3.5 py-2 text-sm">
                      {m.content}
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 shrink-0">
                        <SunCore size={24} phase={phase} minimal busy={m.live} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {m.tools.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {m.tools.map((t, i) => {
                              const active = m.live && !t.includes(' · ');
                              return (
                                <motion.span
                                  key={i}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`relative inline-flex items-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-[10.5px] ${
                                    active ? 'border-[color:var(--accent)]/50 text-accent' : 'border-line text-ink-faint'
                                  }`}
                                >
                                  {active && <span className="shimmer absolute inset-0" />}
                                  {active ? <Loader2 size={10} className="relative animate-spin" /> : <span className="relative">✓</span>}
                                  <span className="relative">{t}</span>
                                </motion.span>
                              );
                            })}
                          </div>
                        )}
                        {m.content ? (
                          <div className={m.live ? 'caret' : ''}>
                            <Markdown>{m.content}</Markdown>
                          </div>
                        ) : (
                          m.live && (
                            <div className="flex gap-1 py-2">
                              {[0, 1, 2].map((i) => (
                                <motion.span
                                  key={i}
                                  className="h-1.5 w-1.5 rounded-full bg-accent"
                                  animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                                />
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Giriş */}
            <form
              className="border-t border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-black/25 p-1.5 pl-3.5 transition-colors focus-within:border-[color:var(--accent)]/55">
                <textarea
                  ref={inputRef}
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="Güneş'e yazın…  (Shift+Enter yeni satır)"
                  className="scroll-thin max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-ink-faint"
                />
                {busy ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => abortRef.current?.abort()}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-ink"
                    title="Durdur"
                  >
                    <Square size={12} fill="currentColor" />
                  </motion.button>
                ) : (
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.9 }}
                    disabled={!input.trim()}
                    className="accent-gradient flex h-8 w-8 items-center justify-center rounded-xl text-[#1a0f05] disabled:opacity-30"
                  >
                    <ArrowUp size={16} strokeWidth={2.5} />
                  </motion.button>
                )}
              </div>
              <div className="mt-1.5 px-1 text-[10px] text-ink-faint">
                Güneş mail göndermez; sadece okur ve taslak hazırlar. Claude üyeliğiniz üzerinden çalışır.
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
