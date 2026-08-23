import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchBootstrap } from '../api/bootstrap';
import { NetworkError } from '../api/client';
import type { AppBootstrap, AppLocale, AppViewer } from '../api/contract';
import { pendingGate } from '../auth/session';
import { getPref, readCache, setPref, writeCache } from '../storage';

/**
 * De schil van de app: wie er ingelogd is, welke tabs het CMS heeft, en de
 * aankondiging van dit moment.
 *
 * Eén aanvraag bij de start, en daarna een `refresh()` die schermen zelf mogen
 * aanroepen (na inloggen, na uitloggen, na het sluiten van een poortscherm).
 * De vorige uitkomst staat in de cache, zodat de app niet als een leeg vak opent
 * op een trage verbinding; `stale` zegt of wat je ziet nog de laatste stand is.
 */

const CACHE_KEY = 'bootstrap';
const LOCALE_KEY = 'locale';

type AppState = {
  bootstrap: AppBootstrap | null;
  viewer: AppViewer | null;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  /** Bezig met de allereerste ophaling, zonder iets in de cache. */
  loading: boolean;
  /** Wat je ziet komt uit de cache; de verversing is niet gelukt. */
  stale: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  /** De poort die nog open staat, of `null`. Zie `auth/session.ts`. */
  gate: 'onboarding' | 'studie-bevestigen' | null;
};

const AppContext = createContext<AppState | null>(null);

export function readStoredLocale(): AppLocale {
  return getPref(LOCALE_KEY) === 'en' ? 'en' : 'nl';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const cached = useMemo(() => readCache<AppBootstrap>(CACHE_KEY), []);
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(cached?.value ?? null);
  const [locale, setLocaleState] = useState<AppLocale>(readStoredLocale);
  const [loading, setLoading] = useState(!cached);
  const [stale, setStale] = useState(Boolean(cached));
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(
    async (next: AppLocale) => {
      try {
        const payload = await fetchBootstrap(next);
        setBootstrap(payload);
        writeCache(CACHE_KEY, payload);
        setStale(false);
        setError(null);
      } catch (caught) {
        // Zonder netwerk blijft staan wat er stond; dat is beter dan een leeg
        // scherm, zolang de app er eerlijk over is.
        setStale(true);
        setError(caught instanceof Error ? caught : new NetworkError(caught));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(locale);
  }, [load, locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setPref(LOCALE_KEY, next);
    setLocaleState(next);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      bootstrap,
      viewer: bootstrap?.viewer ?? null,
      locale,
      setLocale,
      loading,
      stale,
      error,
      refresh: () => load(locale),
      gate: pendingGate(bootstrap?.viewer ?? null),
    }),
    [bootstrap, locale, setLocale, loading, stale, error, load],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp buiten AppProvider');
  return context;
}
