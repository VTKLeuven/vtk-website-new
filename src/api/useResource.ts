import { useCallback, useEffect, useRef, useState } from 'react';

import { NetworkError } from './client';
import { readCache, writeCache } from '../storage';

/**
 * Eén scherm dat gegevens ophaalt.
 *
 * Het patroon is overal hetzelfde: toon wat er in de cache staat, haal daarna op,
 * en zeg het wanneer die verversing niet lukte. Dat laatste is de reden dat dit
 * een eigen hook is en geen losse `useEffect` per scherm: **een scherm dat oude
 * inhoud toont zonder het te zeggen, is erger dan een leeg scherm**, want iemand
 * plant er zijn avond mee.
 *
 * Bewust geen react-query of swr. Wat hier gebeurt is vijftig regels, en een
 * cachebibliotheek erbij zou een dependency zijn die de SDK niet dekt (zie
 * AGENTS.md).
 */
export type Resource<T> = {
  data: T | null;
  /** Eerste ophaling, zonder iets in de cache. */
  loading: boolean;
  /** Ophalen terwijl er al iets op het scherm staat (pull-to-refresh). */
  refreshing: boolean;
  /** Wat je ziet komt uit de cache; de verversing is niet gelukt. */
  stale: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useResource<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  /**
   * Verandert dit, dan is het een ander verzoek en begint het scherm opnieuw.
   * Hou het een string; een array of object verandert bij elke render.
   */
  deps: string = '',
): Resource<T> {
  const cached = useRef<{ key: string; value: T } | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // De fetcher wordt bij elke render opnieuw aangemaakt door de beller; hem in
  // een ref houden voorkomt dat het effect daarop opnieuw draait.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const key = `${cacheKey}:${deps}`;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const value = await fetcherRef.current();
        setData(value);
        writeCache(key, value);
        setStale(false);
        setError(null);
      } catch (caught) {
        const failure = caught instanceof Error ? caught : new NetworkError(caught);
        setError(failure);
        // Staat er iets uit de cache, dan blijft dat staan en zeggen we erbij dat
        // het oud is. Staat er niets, dan is dit gewoon een fout.
        setStale(cached.current?.key === key);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key],
  );

  useEffect(() => {
    const fromCache = readCache<T>(key);
    cached.current = fromCache ? { key, value: fromCache.value } : null;
    setData(fromCache?.value ?? null);
    setLoading(!fromCache);
    setStale(false);
    setError(null);
    void load('initial');
  }, [key, load]);

  return {
    data,
    loading,
    refreshing,
    stale,
    error,
    refresh: () => load('refresh'),
  };
}

/** De zin die bij een mislukte ophaling hoort. Netwerk en server zijn niet hetzelfde. */
export function messageFor(error: Error | null): string {
  if (!error) return 'Er ging iets mis.';
  if (error instanceof NetworkError || error.name === 'NetworkError') {
    return 'Geen verbinding. Kijk je netwerk na en probeer opnieuw.';
  }
  return error.message;
}
