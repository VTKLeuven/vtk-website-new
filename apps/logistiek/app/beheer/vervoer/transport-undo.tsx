'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import {
  reopenTransportAction,
  undoCompleteTransportAction,
  undoTransportPaidOfflineAction,
} from '@/app/actions/beheer';

/**
 * Eén stap terug voor een rit. Staat apart van de gewone knoppen: terugdraaien
 * is de uitzondering en hoort niet in de rij te staan waar je normaal op klikt.
 *
 * Een geslaagde online betaling komt hier niet voor: die draai je terug bij de
 * betaalprovider. De acties weigeren dat ook server-side.
 */
export function TransportUndoButtons({
  bookingId,
  status,
  paidOffline,
  paidOnline,
}: {
  bookingId: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  paidOffline: boolean;
  paidOnline: boolean;
}) {
  const buttons = [];

  if (status === 'APPROVED' || status === 'REJECTED') {
    buttons.push(
      <ConfirmActionButton
        key="reopen"
        label={status === 'APPROVED' ? 'Goedkeuring terugdraaien' : 'Afwijzing terugdraaien'}
        successMessage='De rit staat terug op "aangevraagd".'
        action={reopenTransportAction.bind(null, bookingId)}
        dialogTitle="Beslissing terugdraaien?"
        dialogDescription={
          status === 'APPROVED'
            ? 'De rit gaat terug naar "aangevraagd". Het voertuig komt weer vrij op dat tijdstip en de betaalwijze vervalt; de toegewezen chauffeur blijft staan, maar ziet de rit niet meer bij "Mijn ritten" tot ze opnieuw goedgekeurd is.'
            : 'De rit gaat terug naar "aangevraagd" en komt weer in de wachtrij. De reden die je meegaf, blijft als nota bewaard.'
        }
      />
    );
  }

  if (status === 'COMPLETED' && !paidOnline) {
    buttons.push(
      <ConfirmActionButton
        key="undo-complete"
        label="Afronding terugdraaien"
        successMessage="De afronding is teruggedraaid."
        action={undoCompleteTransportAction.bind(null, bookingId)}
        dialogTitle="Afronding terugdraaien?"
        dialogDescription="De rit staat weer op goedgekeurd. Bij een voertuig dat per kilometer rekent, worden de ingevulde kilometers gewist en moet je ze opnieuw invullen bij het afronden."
      />
    );
  }

  if (paidOffline && !paidOnline) {
    buttons.push(
      <ConfirmActionButton
        key="undo-paid"
        label="Betaling terugdraaien"
        successMessage="De rit staat weer als niet betaald."
        action={undoTransportPaidOfflineAction.bind(null, bookingId)}
        dialogTitle="Betaling terugdraaien?"
        dialogDescription="De rit staat weer als niet betaald. Dit wist enkel de markering aan de balie; er wordt niets terugbetaald."
      />
    );
  }

  if (buttons.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-vtk-navy/20 pt-3">
      <span className="text-xs font-semibold text-vtk-muted">Rechtzetten</span>
      {buttons}
    </div>
  );
}
