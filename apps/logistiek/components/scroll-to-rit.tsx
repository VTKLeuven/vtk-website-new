'use client';

import { useEffect } from 'react';

/**
 * Scrollt na het laden naar de rit uit `?rit=<id>` (S3).
 *
 * Twee redenen waarom dit een component is en geen `#hash` in de link:
 *
 * 1. `/beheer/vervoer` rendert elke rit **twee keer**: als kaart op mobiel en
 *    als tabelrij op desktop. Twee elementen met hetzelfde `id` is ongeldige
 *    HTML, en de browser springt dan naar de eerste, die op deze schermbreedte
 *    net verborgen kan zijn. Daarom `data-rit` plus de zichtbaarheidscheck
 *    hieronder.
 * 2. Next navigeert client-side; de browser is met de hash al klaar voordat de
 *    lijst bestaat.
 */
export function ScrollToRit({ id }: { id?: string }) {
  useEffect(() => {
    if (!id) return;
    const targets = document.querySelectorAll<HTMLElement>(`[data-rit="${CSS.escape(id)}"]`);
    for (const target of targets) {
      // `display: none` (de verborgen helft van het responsieve paar) heeft geen
      // offsetParent; daar scrollen zou nergens heen scrollen.
      if (target.offsetParent === null) continue;
      target.scrollIntoView({ block: 'center' });
      return;
    }
  }, [id]);

  return null;
}
