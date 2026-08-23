'use client';

import { useEffect } from 'react';
import { markReservationSeenAction, markVanBookingSeenAction } from '@/app/actions/uitleen';

/**
 * Onthoudt dat de aanvrager deze aanvraag of rit bekeken heeft (R5), zodat het
 * merkteken "Gewijzigd" in de lijst weer weggaat.
 *
 * Hier en niet in de server component: een paginabezoek mag niets wegschrijven,
 * en een GET die een kolom aanpast is precies wat een prefetch ongewild kan
 * doen. Rendert niets.
 */
export function MarkSeen({
  target,
  id,
}: {
  target: 'reservation' | 'transport';
  id: string;
}) {
  useEffect(() => {
    // Zonder await en zonder foutafhandeling: mislukt dit, dan blijft het
    // merkteken staan, en dat is de onschadelijke kant om op te falen.
    void (target === 'reservation' ? markReservationSeenAction(id) : markVanBookingSeenAction(id));
  }, [target, id]);

  return null;
}
