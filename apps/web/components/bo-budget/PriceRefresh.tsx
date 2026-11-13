'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { refreshPricesAction } from '@/app/actions/boBudgets';

/**
 * Kijkt de prijzen van een budget vanzelf na voor wie enkel meekijkt (de
 * deellink om te bekijken): de editor doet dit zelf. De server houdt de klok
 * bij, dus dit is meestal een aanroep die niets doet; kwam er een nieuw
 * antwoord van een winkel, dan laadt de pagina het budget opnieuw.
 */
export function PriceRefresh({ id, token }: { id: string; token: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void refreshPricesAction({ id, token })
      .then((result) => {
        if (result.ok && Object.keys(result.checks).length > 0) router.refresh();
      })
      .catch(() => undefined);
  }, [id, token, router]);
  return null;
}
