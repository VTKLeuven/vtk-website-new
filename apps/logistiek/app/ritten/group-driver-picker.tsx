'use client';

import { useTransition } from 'react';
import { setGroupTripDriverAction } from '@/app/actions/uitleen';
import { useToast } from '@/components/ui/toast';

/**
 * Wie rijdt deze rit? Ingevuld door de post zelf.
 *
 * Verschijnt enkel op een rit die Logistiek aan jouw post doorgaf. Een
 * keuzelijst en geen "meld je aan"-knop: de verantwoordelijke die de mail kreeg,
 * zet meestal iemand anders op de rit, en een knop die enkel jezelf kan
 * aanduiden dwingt hem eerst die persoon te laten inloggen.
 *
 * Bijrijders blijven waar ze al stonden (`TripHelpers`): dat scherm bestaat en
 * werkt, en een tweede manier om hetzelfde te doen is een tweede manier om het
 * verkeerd te doen.
 */
export function GroupDriverPicker({
  bookingId,
  driverId,
  members,
  groupName,
}: {
  bookingId: string;
  driverId: string | null;
  /** De leden van de post waaraan de rit doorgegeven is. */
  members: Array<{ id: string; name: string }>;
  groupName: string;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    startTransition(async () => {
      const result = await setGroupTripDriverAction(bookingId, next);
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <label className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-vtk-paper px-4 py-3 text-sm">
      <span className="font-medium text-vtk-ink">Chauffeur van {groupName}</span>
      <select
        value={driverId ?? ''}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
        className="h-9 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
      >
        <option value="">Nog niemand</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
        {/* Iemand van buiten de post die Logistiek er al op zette (of iemand uit
            de chauffeurslijst): zonder deze regel valt de lijst terug op "nog
            niemand" terwijl er wel degelijk iemand rijdt. */}
        {driverId && !members.some((member) => member.id === driverId) ? (
          <option value={driverId}>De aangeduide chauffeur</option>
        ) : null}
      </select>
    </label>
  );
}
