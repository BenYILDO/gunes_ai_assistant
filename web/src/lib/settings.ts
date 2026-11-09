/** Kullanıcı tercihleri (bu bilgisayarda, tarayıcıda saklanır). */
import { useEffect, useState } from 'react';

export interface Settings {
  /** Okuma hızı çarpanı (1 = normal) */
  speechRate: number;
  /** Günün ilk açılışında sesli brifing otomatik başlasın */
  autoVoice: boolean;
  /** Karşılama ekranı: her açılışta / günde bir / kapalı */
  introMode: 'always' | 'daily' | 'off';
  /** Açılışta tarayıcı konumunu otomatik kullan (elle şehir seçilince kapanır) */
  autoLocation: boolean;
  /** Sessiz saatler: bu aralıkta yalnızca önemli (acil/gecikme) bildirimler açılır pencere olur; diğerleri gelen kutusunda bekler */
  quietOn: boolean;
  quietFrom: string;
  quietTo: string;
  /** Bir aramadayken (mikrofon açık) önemli olmayan bildirimler açılır pencere olmaz */
  callQuiet: boolean;
}

const KEY = 'gunes.settings';
const DEFAULTS: Settings = { speechRate: 1.12, autoVoice: true, introMode: 'always', autoLocation: true, quietOn: false, quietFrom: '12:00', quietTo: '13:00', callQuiet: true };

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const next = { ...getSettings(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* yoksay */
  }
  window.dispatchEvent(new CustomEvent('gunes-settings', { detail: next }));
}

export function useSettings(): Settings {
  const [s, setS] = useState(getSettings);
  useEffect(() => {
    const on = () => setS(getSettings());
    window.addEventListener('gunes-settings', on);
    return () => window.removeEventListener('gunes-settings', on);
  }, []);
  return s;
}
