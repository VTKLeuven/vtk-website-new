'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { deleteTransportAction } from '@/app/actions/beheer';

/**
 * Een rit echt weghalen (R1).
 *
 * Apart van `TransportUndoButtons` ernaast, en dat is geen indeling maar een
 * betekenisverschil: die knoppen zetten één stap terug, deze laat niets achter.
 * Vandaar een eigen rij met een eigen opschrift.
 *
 * De knop staat bij elke rit zonder betaling (`canDeleteTransport`). Wat er bij
 * deze rit op het spel staat, zoals een aanvrager die geen bericht krijgt,
 * rekent de pagina uit met `transportDeleteDescription`.
 */
export function TransportDeleteButton({
  bookingId,
  title,
  count,
  description,
}: {
  bookingId: string;
  title: string;
  /** Hoeveel ritten er meegaan: heen en terug verdwijnen samen. */
  count: number;
  /** Wat er precies weggaat en wie het merkt; zie `transportDeleteDescription`. */
  description: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-red-300 pt-3">
      <span className="text-xs font-semibold text-vtk-muted">Verwijderen</span>
      <ConfirmActionButton
        label={`Verwijderen: ${title}`}
        srLabel={`Rit verwijderen: ${title}`}
        confirmLabel="Verwijderen"
        variant="danger"
        destructive
        icon={<LogisticsIcon name="trash" className="h-4 w-4" />}
        dialogTitle={count > 1 ? 'Deze ritten verwijderen?' : 'Deze rit verwijderen?'}
        dialogDescription={description}
        successMessage="Rit verwijderd."
        action={() => deleteTransportAction(bookingId)}
      />
    </div>
  );
}
