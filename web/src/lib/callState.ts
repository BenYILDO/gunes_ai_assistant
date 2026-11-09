import { useCallback, useEffect, useState } from 'react';
import { api, type CallSnapshot } from './api';

/** Arama durumunu 3 sn'de bir sorgular (pencere görünür olmasa da); enabled=false iken durur. */
export function useCall(enabled = true) {
  const [call, setCall] = useState<CallSnapshot | null>(null);
  const refresh = useCallback(async () => {
    try {
      setCall(await api.callState());
    } catch {
      /* sunucuya ulaşılamadı: sonraki turda */
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [enabled, refresh]);
  return { call, setCall, refresh };
}

/** "Arayan: Ahmet Yılmaz" ya da okunuyorsa/okunamadıysa kısa açıklama; hiçbiri yoksa null */
export function callerLine(c: CallSnapshot | null): string | null {
  const id = c?.identity;
  if (!id) return null;
  if (id.status === 'running') return 'Arayan okunuyor…';
  if (id.status === 'ok' && id.callers.length) return `Arayan: ${id.callers.join(', ')}`;
  return null;
}
