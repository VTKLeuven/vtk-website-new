'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { deleteTransportAction } from '@/app/actions/beheer';

/**
 * Een rit die het team zelf intekende, echt weghalen (R1).
 *
 * Apart van `TransportUndoButtons` ernaast, en dat is geen indeling maar een
 * betekenisverschil: die knoppen zetten één stap terug, deze laat niets achter.
 * Vandaar een eigen rij met een eigen opschrift.
 *
 * De knop verschijnt enkel wanneer het mag (`canDeleteTransport`): een rit uit
 * een aanvraag wordt afgewezen of geannuleerd, want daar hangt een lid aan dat
 * een reden hoort te zien in plaats van een lege plek in zijn overzicht.
 */
export function TransportDeleteButton({
  bookingId,
  title,
  /** Hoeveel ritten er meegaan: heen en terug verdwijnen samen. */
  count,
}: {
  bookingId: string;
  title: string;
  count: number;
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
        dialogDescription={
          (count > 1 ? `Heen- en terugrit gaan samen weg (${count} ritten). ` : '') +
          'De rit en haar historiek verdwijnen helemaal; het voertuig komt op dat moment weer vrij. Dit kan niet ongedaan gemaakt worden.'
        }
        successMessage="Rit verwijderd."
        action={() => deleteTransportAction(bookingId)}
      />
    </div>
  );
}
