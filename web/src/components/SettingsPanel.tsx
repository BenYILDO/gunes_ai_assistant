import { AnimatePresence, motion } from 'motion/react';
import { Bell, Info, Mic, MonitorPlay, Settings2, Volume2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Status } from '../lib/api';
import { listener, speechSupported, type ListenState } from '../lib/listener';
import { setSetting, useSettings } from '../lib/settings';
import { getTtsVoice, setTtsVoice, setVoiceEnabled, speakAsync, voiceEnabled } from '../lib/speech';
import { fmtTime } from '../lib/time';

interface Props {
  open: boolean;
  onClose: () => void;
  status: Status | null;
  onVoiceTest: () => void;
  onVoiceDiag: () => void;
}

export function SettingsPanel({ open, onClose, status, onVoiceTest, onVoiceDiag }: Props) {
  const s = useSettings();
  const [voiceOn, setVoiceOn] = useState(voiceEnabled());
  const [mic, setMic] = useState<ListenState>(listener.state);
  const [ttsVoice, setTtsVoiceState] = useState(getTtsVoice());
  const [notif, setNotif] = useState<string>('Notification' in window ? Notification.permission : 'unsupported');
  const tts = status?.tts;

  useEffect(() => listener.onState(setMic), []);
  useEffect(() => {
    if (!open) return;
    setTtsVoiceState(getTtsVoice() || tts?.voice || '');
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose, tts?.voice]);

  const sample = (text = 'Merhaba Yıldıray Bey, ben Güneş. Bu hızda okumam nasıl?') => void speakAsync(text, { force: true });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ x: '105%' }}
            animate={{ x: 0 }}
            exit={{ x: '105%' }}
            transition={{ type: 'spring', stiffness: 240, damping: 30 }}
            className="glass fixed bottom-3 right-3 top-3 z-[71] flex w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl !bg-[rgb(12_10_30/0.95)]"
          >
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Settings2 size={17} className="text-accent" />
              <h2 className="font-display text-base font-semibold">Ayarlar</h2>
              <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-ink-faint hover:bg-white/10 hover:text-ink">
                <X size={17} />
              </button>
            </div>

            <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* ---------------- Ses */}
              <Section icon={<Volume2 size={14} />} title="Ses">
                <Row label="Sesli konuşma" hint="Karşılama, brifing ve bildirimlerde Güneş sesli konuşsun">
                  <Toggle
                    on={voiceOn}
                    onChange={(v) => {
                      setVoiceEnabled(v);
                      setVoiceOn(v);
                    }}
                  />
                </Row>
                <Row label="Sabah sesli brifing" hint="Günün ilk açılışında karşılamadan sonra otomatik başlasın">
                  <Toggle on={s.autoVoice} onChange={(v) => setSetting('autoVoice', v)} />
                </Row>

                <div className="rounded-xl border border-line bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink">Ses motoru</span>
                    <span className={tts?.provider === 'azure' ? 'text-ok' : 'text-ink-faint'}>
                      {tts?.provider === 'azure' ? 'Azure doğal ses' : 'Tarayıcı sesi'}
                    </span>
                  </div>
                  {tts?.provider === 'azure' && tts.usage && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full accent-gradient" style={{ width: `${Math.min(100, (tts.usage.chars / tts.usage.limit) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[10.5px] text-ink-faint">
                        Bu ay {tts.usage.chars.toLocaleString('tr-TR')} / {tts.usage.limit.toLocaleString('tr-TR')} karakter (ücretsiz kota)
                      </div>
                    </div>
                  )}
                  {tts?.provider !== 'azure' && (
                    <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
                      Doğal kadın sesi için Azure Speech ücretsiz anahtarını <code>.env</code> dosyasına ekleyin (README → "Doğal kadın sesi").
                    </p>
                  )}
                </div>

                {tts?.provider === 'azure' && tts.voices && (
                  <Row label="Ses" hint="Seçince örnek okur">
                    <select
                      value={ttsVoice}
                      onChange={(e) => {
                        setTtsVoiceState(e.target.value);
                        setTtsVoice(e.target.value);
                        const v = tts.voices!.find((x) => x.id === e.target.value);
                        sample(`Merhaba, ben Güneş. Bu ${v?.label ?? ''} sesi. Nasıl, beğendiniz mi?`);
                      }}
                      className="h-8 max-w-[210px] rounded-lg border border-line bg-black/30 px-2 text-xs outline-none"
                    >
                      {tts.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} — {v.note}
                        </option>
                      ))}
                    </select>
                  </Row>
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-ink">Okuma hızı</span>
                    <span className="font-display tabular-nums text-accent">{s.speechRate.toFixed(2)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.5}
                    step={0.04}
                    value={s.speechRate}
                    onChange={(e) => setSetting('speechRate', Number(e.target.value))}
                    onMouseUp={() => sample()}
                    onKeyUp={() => sample()}
                    className="zoom-range h-1 w-full cursor-pointer"
                    style={{ ['--p' as string]: `${((s.speechRate - 0.8) / 0.7) * 100}%` }}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
                    <span>Yavaş</span>
                    <span>Normal</span>
                    <span>Hızlı</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <SmallBtn onClick={onVoiceTest}>Ses testi</SmallBtn>
                  <SmallBtn onClick={onVoiceDiag}>Ses tanılama</SmallBtn>
                </div>
              </Section>

              {/* ---------------- Mikrofon */}
              <Section icon={<Mic size={14} />} title="Mikrofon">
                <Row
                  label="Dinleme"
                  hint={
                    !speechSupported
                      ? 'Bu tarayıcı konuşma tanımayı desteklemiyor'
                      : mic === 'denied'
                        ? 'Mikrofon izni verilmedi'
                        : mic === 'listening'
                          ? 'Açık — "Güneş, …" diye seslenebilirsiniz'
                          : 'Kapalı'
                  }
                >
                  <Toggle on={mic === 'listening'} disabled={!speechSupported} onChange={(v) => (v ? listener.start() : listener.stop())} />
                </Row>
                <div className="rounded-xl border border-line bg-white/[0.03] p-3 text-[11.5px] leading-relaxed text-ink-dim">
                  <div className="mb-1 text-[10.5px] uppercase tracking-wider text-ink-faint">Örnek komutlar</div>
                  "Güneş, panoyu aç" · "Güneş, brifingi aç" · "Güneş, şimdi tara" · "Güneş, sesli brifing" · "Güneş, bugünlük yeter" · "Güneş, HGS işinde son durum ne?"
                </div>
              </Section>

              {/* ---------------- Karşılama */}
              <Section icon={<MonitorPlay size={14} />} title="Karşılama ekranı">
                <Segmented
                  value={s.introMode}
                  onChange={(v) => setSetting('introMode', v as 'always' | 'daily' | 'off')}
                  options={[
                    { value: 'always', label: 'Her açılışta' },
                    { value: 'daily', label: 'Günde bir' },
                    { value: 'off', label: 'Kapalı' },
                  ]}
                />
              </Section>

              {/* ---------------- Bildirimler */}
              <Section icon={<Bell size={14} />} title="Bildirimler">
                <Row
                  label="Masaüstü bildirimleri"
                  hint={notif === 'granted' ? 'Açık — pencere arka plandayken Güneş seslenebilir' : notif === 'denied' ? 'Engellendi — tarayıcı ayarlarından izin verin' : 'İzin verilmedi'}
                >
                  {notif === 'default' ? (
                    <SmallBtn onClick={() => void Notification.requestPermission().then(setNotif)}>İzin ver</SmallBtn>
                  ) : (
                    <span className={`text-xs ${notif === 'granted' ? 'text-ok' : 'text-ink-faint'}`}>{notif === 'granted' ? 'Açık' : 'Kapalı'}</span>
                  )}
                </Row>
              </Section>

              {/* ---------------- Bilgi */}
              <Section icon={<Info size={14} />} title="Bilgi">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-ink-faint">Veri deposu</dt>
                  <dd>{status?.store === 'supabase' ? 'Supabase' : 'Yerel dosya'}</dd>
                  <dt className="text-ink-faint">Mesai</dt>
                  <dd>
                    {status?.schedule.schedule.morningTime} – {status?.schedule.schedule.workEnd}, {status?.schedule.schedule.trackerEveryHours} saatte bir takip
                  </dd>
                  <dt className="text-ink-faint">Son tarama</dt>
                  <dd>{status?.schedule.lastCollect ? fmtTime(status.schedule.lastCollect) : '—'}</dd>
                  {status?.models && (
                    <>
                      <dt className="text-ink-faint">Modeller</dt>
                      <dd>
                        Sohbet: {status.models.chat} · Planlama: {status.models.think} · Tarama: {status.models.scan}
                      </dd>
                    </>
                  )}
                </dl>
                <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">Mesai saatleri ve modeller .env dosyasından değiştirilir.</p>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-ink-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-[color:var(--accent)]' : 'bg-white/15'}`}
    >
      <motion.span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        animate={{ left: on ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex rounded-xl border border-line bg-white/[0.03] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative flex-1 rounded-lg py-1.5 text-xs transition-colors ${value === o.value ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'}`}
        >
          {value === o.value && <motion.span layoutId="seg-pill" className="absolute inset-0 rounded-lg bg-white/[0.1]" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function SmallBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-line-strong hover:text-ink">
      {children}
    </motion.button>
  );
}
