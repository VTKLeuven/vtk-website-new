'use client';

import { ErrorView } from '@/components/error-view';

/**
 * De foutpagina voor alles onder de root layout. Zonder dit bestand toonde Next
 * zijn eigen kale scherm, zonder kop en zonder weg terug (R1). Zie
 * `components/error-view.tsx`.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} variant="page" />;
}
