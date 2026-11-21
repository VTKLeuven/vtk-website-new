'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * "Laden..." voor een screenreader, in de taal van `<html lang>`.
 *
 * Een laadtoestand leest geen cookie (dan wacht de navigatie weer op de
 * server, en dat is wat ze moest vermijden), dus de taal komt uit het document.
 * Op de server is dat nog onbekend: daar Nederlands, en de client corrigeert het
 * zonder hydratatiewaarschuwing.
 */
export function LoadingLabel() {
  const english = useSyncExternalStore(
    subscribe,
    () => document.documentElement.lang.toLowerCase().startsWith('en'),
    () => false
  );
  return (
    <span role="status" className="sr-only">
      {english ? 'Loading...' : 'Laden...'}
    </span>
  );
}
