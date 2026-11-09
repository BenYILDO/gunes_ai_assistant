import { AnimatePresence, motion } from 'motion/react';
import { Headphones, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useCall } from '../lib/callState';
import { liveCapture, liveSupported, useLive } from '../lib/liveCapture';
import type { Phase } from '../lib/time';
import { SunCore } from './SunCore';
import { useToast } from './Toasts';

/**
 * Güneş bir arama fark edince (Teams/Zoom mikrofonu açtı) sorar: "Bu aramaya katılmamı ister misiniz?".
 * "Katıl" derseniz canlı dinleme başlar (ses kaydı → yerel transkript → konuşmacı tanıma). Onaylamadan hiçbir şey kaydedilmez.
 * Not: arama durumunu pencere görünür olmasa da sorgularız (Teams öndeyken Güneş penceresi örtülür);
 * pencere arka plandaysa sistem bildirimi gösterilir, ona tıklayınca Güneş öne gelir.
 */
export function CallPrompt({ phase, onOpenMeetings }: { phase: Phase; onOpenMeetings: () => void }) {
  const toast = useToast();
  const live = useLive();
  const { call, setCall } = useCall();
  const [busy, setBusy] = useState(false);
  const notified = useRef<string | null>(null);

  // Windows popup'ı açıkken (Güneş penceresi arkada olsa da görünür) burada ikinci bir soru gösterme
  const show = Boolean(call?.prompt) && !live.active && !call?.nativePopup;
  const title = call?.event ? call.event.subject : 'Plansız arama';

  // Pencere arka plandaysa sistem bildirimi
  useEffect(() => {
    if (!show || !call?.since || notified.current === call.since) return;
    notified.current = call.since;
    if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('☀️ Bir arama algıladım', { body: 'Bu aramaya katılmamı ister misiniz?', tag: 'gunes-arama', requireInteraction: true });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  }, [show, call?.since]);

  const join = async () => {
    if (!call) return;
    setBusy(true);
    try {
      // Onay anında arama penceresinin görüntüsünden arayan okunur (arka planda); ardından ekran paylaşımı istenir
      // (tarayıcı kullanıcı hareketi ister: bu yüzden getDisplayMedia ilk eşzamanlı çağrı kalmalı)
      if (call.screenshot) void api.callIdentify().catch(() => {});
      const hhmm = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      await liveCapture.start(
        { title: call.event?.subject ?? `Plansız arama · ${call.app ?? 'arama'} · ${hhmm}`, event: call.event?.external_id, fromCall: true },
        (m) => {
          if (m) toast('Dinleme bitti, yazıya çevriliyor.');
        },
      );
      await api.callJoined().then(setCall).catch(() => {});
      onOpenMeetings();
    } catch (e) {
      const msg = (e as Error).message;
      toast(/Permission denied|NotAllowed/i.test(msg) ? 'Ekran paylaşımı izni verilmedi, dinleme başlamadı.' : msg, 'error');
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => setCall(await api.callDecline().catch(() => null));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="call"
          className="glass-solid hud-corners fixed bottom-20 right-5 z-[66] w-[min(380px,calc(100vw-40px))] overflow-hidden rounded-2xl p-4"
          initial={{ opacity: 0, x: 80, scale: 0.92, filter: 'blur(8px)' }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: 80, scale: 0.95, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              <SunCore size={40} phase={phase} minimal busy />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold">Bir arama fark ettim</span>
                <button onClick={() => void decline()} className="ml-auto -mr-1 rounded p-0.5 text-ink-faint hover:text-ink" title="Kapat">
                  <X size={13} />
                </button>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-dim">
                {call?.ringing ? 'Teams’te bir arama çalıyor. ' : call?.app ? `${call.app} mikrofonu açtı. ` : ''}
                {call?.planned ? (
                  <>
                    Takvimde bu saatte <b className="text-ink">{title}</b> var.
                  </>
                ) : (
                  <>Takvimde görünmüyor, plansız bir arama gibi.</>
                )}{' '}
                Bu aramaya katılmamı ister misiniz?
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                "Katıl" derseniz sesi (mikrofonunuz + karşı taraf) dinleyip yazıya çeviririm; ekran paylaşımı ya da izin gerekmez, arama bitince kendiliğinden biterim.{call?.screenshot ? " Arayanı görmek için arama penceresinin ekran görüntüsünü alıp Claude'a okuturum (görüntü saklanmaz, hemen silinir)." : ''} Arama dışındaki kişilerin bilgisi/onayı için kurum politikanıza uyun. Ses dosyası 30 gün sonra silinir.
              </p>
              {call?.error && <p className="mt-1 text-[11px] leading-relaxed text-danger">Dinleme başlatılamadı: {call.error}</p>}
              <div className="mt-3 flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ y: -1 }}
                  disabled={busy || !liveSupported()}
                  onClick={() => void join()}
                  className="accent-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1a0f05] disabled:opacity-50"
                >
                  <Headphones size={13} /> Katıl
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => void decline()} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink">
                  Şimdi değil
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
