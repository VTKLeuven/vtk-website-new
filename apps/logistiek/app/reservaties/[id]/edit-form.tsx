'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { editReservationAction } from '@/app/actions/uitleen';
import type { RequesterOption } from '@/app/materiaal/event-fields';
import { ReservationForm, type ReservationFormInitial } from '@/app/materiaal/reservation-form';
import type { CatalogCategory } from '@/lib/uitleen-server';

/**
 * Lid-bewerking van een nog niet besliste materiaalaanvraag. Toont een knop die
 * het gedeelde aanvraagformulier opent, voorgevuld met de huidige waarden.
 */
export function ReservationEditor({
  reservationId,
  catalog,
  groups,
  locale,
  initial,
}: {
  reservationId: string;
  catalog: CatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  initial: ReservationFormInitial;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {en ? 'Edit request' : 'Aanvraag bewerken'}
      </Button>
    );
  }

  return (
    <div className="mt-2">
      <ReservationForm
        catalog={catalog}
        groups={groups}
        locale={locale}
        initial={initial}
        mode="member"
        submitLabel={en ? 'Save changes' : 'Wijzigingen opslaan'}
        submittingLabel={en ? 'Saving...' : 'Opslaan...'}
        cancelLabel={en ? 'Cancel' : 'Annuleren'}
        onCancel={() => setOpen(false)}
        onSubmit={async (payload) => {
          const result = await editReservationAction(reservationId, payload);
          if (result.ok) {
            setOpen(false);
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
