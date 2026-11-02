import { useCallback, useEffect, useRef, useState } from 'react';

/** Basit periyodik veri çekme kancası. */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!intervalMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, refresh, ...deps]);

  return { data, error, refresh, setData };
}

export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useLocalFlag(key: string, initial: boolean) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === '1';
    } catch {
      return initial;
    }
  });
  const set = (n: boolean) => {
    setV(n);
    try {
      localStorage.setItem(key, n ? '1' : '0');
    } catch {
      /* yoksay */
    }
  };
  return [v, set] as const;
}
