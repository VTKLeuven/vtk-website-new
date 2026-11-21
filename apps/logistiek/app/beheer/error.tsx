'use client';

import { ErrorView } from '@/components/error-view';

/**
 * Een fout in het beheer vervangt enkel de inhoudskolom: de zijbalk uit
 * `beheer/layout.tsx` blijft staan, zodat je meteen naar een ander tabblad kan.
 */
export default function BeheerError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} variant="admin" />;
}
