import { AnimatePresence, motion } from 'motion/react';
import { Bell, Cpu, Users, Info, LocateFixed, MapPin, Mic, MonitorPlay, PawPrint, RefreshCw, Search, Settings2, Volume2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type Pet, type Status, type Usage, type Weather } from '../lib/api';
import { useNow } from '../lib/hooks';
import { effective, WindowRow } from './UsageMeter';
import { relTime } from '../lib/time';
import { listener, speechSupported, type ListenState } from '../lib/listener';
import { setSetting, useSettings } from '../lib/settings';
import { DEFAULT_GREETING, greetingText } from '../lib/inperson';
import { getTtsVoice, setTtsVoice, setVoiceEnabled, speakAsync, voiceEnabled } from '../lib/speech';
import { fmtTime } from '../lib/time';

interface Props {
  open: boolean;
  onClose: () => void;
  status: Status | null;
  onVoiceTest: () => void;
  onVoiceDiag: () => void;
  weather: Weather | null;
  /** Konum değişince hava/gündem yenilensin */
  onLocationChanged: () => void;
  pet: Pet | null;
  onRenamePet: (name: string) => void;
  /** Evcil hayvan özelliğini açar/kapatır (sunucuda saklanır; varsayılan kapalı) */
  onTogglePet: (on: boolean) => void;
}

export function SettingsPanel({ open, onClose, status, onVoiceTest, onVoiceDiag, weather, onLocationChanged, pet, onRenamePet, onTogglePet }: Props) {
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

              {/* ---------------- Yapay zekâ kullanımı */}
              <Section icon={<Cpu size={14} />} title="Yapay zekâ kullanımı">
                <UsageSection usage={status?.usage ?? null} pauseAt={status?.usagePauseAt ?? 0.85} models={status?.models} />
              </Section>

              {/* ---------------- Konum ve hava */}
              <Section icon={<MapPin size={14} />} title="Konum ve hava">
                <LocationSection weather={weather} onChanged={onLocationChanged} />
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

              {/* ---------------- Evcil hayvan */}
              <Section icon={<PawPrint size={14} />} title="Evcil hayvan">
                <Row label="Evcil hayvan" hint="Kapalıyken ekranda görünmez; puan, mağaza ve ödüller de çalışmaz (verileriniz silinmez)">
                  <Toggle on={Boolean(pet?.enabled)} disabled={!pet} onChange={onTogglePet} />
                </Row>
                {pet?.enabled && (
                <Row label="Boyut" hint={`%${Math.round(s.petScale * 100)} — en büyüğü %100, en küçüğü %50`}>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={Math.round(s.petScale * 100)}
                    onChange={(e) => setSetting('petScale', Math.min(1, Math.max(0.5, Number(e.target.value) / 100)))}
                    className="w-28 accent-[color:var(--accent)]"
                    aria-label="Evcil hayvan boyutu"
                  />
                </Row>
                )}
                {pet?.enabled && (
                  <>
                    <Row label="Adı" hint={`${pet.streak > 0 ? `🔥 ${pet.streak} günlük seri · ` : ''}en iyi seri ${pet.bestStreak} gün · ${pet.totalFeeds} kez beslendi`}>
                      <input
                        defaultValue={pet.name}
                        maxLength={20}
                        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== pet.name && onRenamePet(e.target.value)}
                        className="w-28 rounded-lg border border-line bg-white/[0.05] px-2 py-1 text-sm text-ink"
                      />
                    </Row>
                  </>
                )}
              </Section>

              {/* ---------------- Yüz yüze toplantı */}
              <Section icon={<Users size={14} />} title="Yüz yüze toplantı">
                <Row label="Başlamadan önce sesli duyuru" hint="Kapalı: dinleme duyurusuz başlar. Açıkken Güneş önce odadakileri bilgilendirir, duyuru bitince dinlemeye başlar">
                  <Toggle on={s.inPersonAnnounce} onChange={(v) => setSetting('inPersonAnnounce', v)} />
                </Row>
                {s.inPersonAnnounce && (
                  <div className="space-y-1.5">
                    <textarea
                      aria-label="Duyuru metni"
                      value={s.inPersonText || DEFAULT_GREETING}
                      onChange={(e) => setSetting('inPersonText', e.target.value)}
                      rows={4}
                      maxLength={600}
                      className="w-full resize-y rounded-lg border border-line bg-white/[0.05] px-2.5 py-1.5 text-xs leading-relaxed text-ink outline-none focus:border-[color:var(--accent)]/60"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
                      <span>{'{ad}'} yerine adınız okunur.</span>
                      <button className="underline-offset-2 hover:underline" onClick={() => void speakAsync(greetingText(s.inPersonText, status?.user.name ?? ''), { force: true, rate: 0.95 })}>
                        Önce dinle
                      </button>
                      <button className="underline-offset-2 hover:underline" onClick={() => setSetting('inPersonText', '')}>
                        Varsayılana dön
                      </button>
                    </div>
                  </div>
                )}
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
                <Row label="Aramadayken sessiz" hint="Bir aramadayken önemli olmayan bildirimler açılır pencere olmaz, gelen kutusunda bekler">
                  <Toggle on={s.callQuiet} onChange={(v) => setSetting('callQuiet', v)} />
                </Row>
                <Row label="Sessiz saatler" hint="Bu aralıkta yalnızca acil/gecikme bildirimleri açılır pencere olur; diğerleri gelen kutusunda (🔔) bekler">
                  <Toggle on={s.quietOn} onChange={(v) => setSetting('quietOn', v)} />
                </Row>
                {s.quietOn && (
                  <div className="flex items-center gap-2 text-xs text-ink-dim">
                    <input type="time" value={s.quietFrom} onChange={(e) => setSetting('quietFrom', e.target.value || '12:00')} className="rounded-lg border border-line bg-white/[0.05] px-2 py-1 text-ink" />
                    <span>–</span>
                    <input type="time" value={s.quietTo} onChange={(e) => setSetting('quietTo', e.target.value || '13:00')} className="rounded-lg border border-line bg-white/[0.05] px-2 py-1 text-ink" />
                  </div>
                )}
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
                </dl>
                <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">Mesai saatleri .env dosyasından değiştirilir.</p>
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

function UsageSection({ usage, pauseAt, models }: { usage: Usage | null; pauseAt: number; models?: { chat: string; think: string; scan: string } }) {
  const now = useNow(30_000);
  const [local, setLocal] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const u = local && (!usage || local.updatedAt > usage.updatedAt) ? local : usage;
  return (
    <div className="space-y-3">
      {!u ? (
        <p className="text-xs text-ink-faint">Henüz bilgi yok; Güneş'in ilk çalışmasında ya da "Güncelle" ile öğrenilir.</p>
      ) : (
        <>
          <WindowRow title="5 saatlik pencere" w={effective(u.fiveHour, now)} now={now} />
          <WindowRow title="Haftalık pencere" w={effective(u.sevenDay, now)} now={now} />
          {Object.entries(u.extra ?? {}).map(([k, w]) => (
            <WindowRow key={k} title={k.replace(/_/g, ' ')} w={effective(w, now)} now={now} />
          ))}
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] text-ink-faint">{u ? `Güncelleme: ${relTime(u.updatedAt)}` : ''}</span>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setLocal(await api.refreshUsage());
            } finally {
              setBusy(false);
            }
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Güncelle
        </button>
      </div>
      <div className="rounded-xl border border-line bg-white/[0.03] p-3 text-[11.5px] leading-relaxed text-ink-dim">
        5 saatlik kullanım <b className="text-ink">%{Math.round(pauseAt * 100)}</b>'i geçince arka plan taramaları ertelenir; sohbete yer kalır. Sohbet ve Claude Code kullanımınız da bu limitlere dahildir.
        {models && (
          <div className="mt-1.5 text-ink-faint">
            Modeller — sohbet: {models.chat} · planlama: {models.think} · tarama: {models.scan}
          </div>
        )}
      </div>
    </div>
  );
}

interface GeoResult { name: string; admin1?: string; country?: string; latitude: number; longitude: number }

function LocationSection({ weather, onChanged }: { weather: Weather | null; onChanged: () => void }) {
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Şehir arama (Open-Meteo, anahtarsız)
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return setResults([]);
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=6&language=tr&format=json`);
        const j = (await r.json()) as { results?: GeoResult[] };
        setResults(j.results ?? []);
      } catch {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  const choose = async (g: GeoResult) => {
    setBusy(true);
    const place = [g.name, g.admin1 && g.admin1 !== g.name ? g.admin1 : null].filter(Boolean).join(', ');
    try {
      await api.setLocation(g.latitude, g.longitude, place);
      setSetting('autoLocation', false);
      setQ('');
      setResults([]);
      setMsg(`Konum: ${place}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const useMine = () => {
    if (!('geolocation' in navigator)) return setMsg('Bu tarayıcı konum vermiyor.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await api.setLocation(pos.coords.latitude, pos.coords.longitude).catch(() => undefined);
        setSetting('autoLocation', true);
        setMsg('Bulunduğunuz konum kullanılıyor.');
        setBusy(false);
        onChanged();
      },
      () => {
        setMsg('Konum izni verilmedi — şehir arayarak seçebilirsiniz.');
        setBusy(false);
      },
      { timeout: 15_000 },
    );
  };

  const src: Record<string, string> = { browser: 'Otomatik (tarayıcı konumu)', manual: 'Elle seçildi', env: '.env dosyasından', default: 'Varsayılan' };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-white/[0.03] p-3">
        <div className="flex items-center gap-2 text-sm">
          <MapPin size={14} className="text-accent" />
          <span className="text-ink">{weather?.place ?? 'Bilinmiyor'}</span>
          {weather && <span className="ml-auto text-xs text-ink-dim">{weather.temp}° · {weather.label}</span>}
        </div>
        <div className="mt-1 text-[10.5px] text-ink-faint">
          {src[weather?.locationSource ?? ''] ?? '—'}
          {weather?.lat !== undefined && ` · ${weather.lat.toFixed(3)}, ${weather.lon?.toFixed(3)}`}
        </div>
      </div>

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Şehir ya da ilçe ara (ör. Kilimli, Kadıköy)"
          className="h-9 w-full rounded-lg border border-line bg-black/30 pl-8 pr-2 text-sm outline-none focus:border-[color:var(--accent)]/60"
        />
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-lg border border-line-strong bg-[rgb(14_11_32/0.98)] shadow-xl">
            {results.map((g, i) => (
              <button key={i} disabled={busy} onClick={() => void choose(g)} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/[0.07]">
                {g.name}
                <span className="text-xs text-ink-faint">
                  {g.admin1 ? ` · ${g.admin1}` : ''}
                  {g.country && !/türkiye/i.test(g.country) ? ` · ${g.country}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SmallBtn onClick={useMine}>
          <span className="inline-flex items-center gap-1">
            <LocateFixed size={12} /> Bulunduğum konumu kullan
          </span>
        </SmallBtn>
        {msg && <span className="text-[11px] text-ink-faint">{msg}</span>}
      </div>
      <Row label="Konumu otomatik algıla" hint="Açılışta tarayıcı konumu kullanılır; elle şehir seçince kapanır">
        <Toggle on={settings.autoLocation} onChange={(v) => setSetting('autoLocation', v)} />
      </Row>
    </div>
  );
}
