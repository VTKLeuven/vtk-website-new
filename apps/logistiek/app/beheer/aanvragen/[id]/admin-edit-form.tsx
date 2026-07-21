'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { adminEditReservationAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';
import type { RequesterOption } from '@/app/materiaal/event-fields';
import { ReservationForm, type ReservationFormInitial } from '@/app/materiaal/reservation-form';
import type { CatalogCategory } from '@/lib/uitleen-server';

/** Team-bewerking van een materiaalaanvraag; opent het gedeelde formulier met alle posten. */
export function AdminReservationEditor({
  reservationId,
  catalog,
  groups,
  initial,
  showRentPrices,
}: {
  reservationId: string;
  catalog: CatalogCategory[];
  groups: RequesterOption[];
  initial: ReservationFormInitial;
  showRentPrices: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Aanvraag bewerken
      </Button>
    );
  }

  return (
    <div className="mt-2">
      <ReservationForm
        catalog={catalog}
        groups={groups}
        locale="nl"
        initial={initial}
        mode="team"
        showRentPrices={showRentPrices}
        submitLabel="Wijzigingen opslaan"
        submittingLabel="Opslaan..."
        cancelLabel="Annuleren"
        onCancel={() => setOpen(false)}
        onSubmit={async (payload) => {
          const result = await adminEditReservationAction(reservationId, payload);
          if (result.ok) {
            showToast({ message: result.message ?? 'Bijgewerkt.', variant: 'success' });
            setOpen(false);
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
