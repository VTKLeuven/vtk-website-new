'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ElixirIcon } from '@/components/elixir-icon';
import { deleteWeekAction, setWeekStatusAction } from '@/app/actions/fakbar';

/**
 * Rij-acties: icoonknoppen, geen tekst (CLAUDE.md). `label` wordt de tooltip en
 * de aria-label en draagt daarom de week zelf mee; anders hoort een
 * screenreader dertig keer "Verwijderen" zonder te weten waarvan.
 */
export function WeekActions({
  weekId,
  label,
  status,
  eveningCount,
}: {
  weekId: string;
  label: string;
  status: 'OPEN' | 'CLOSED';
  eveningCount: number;
}) {
  const open = status === 'OPEN';

  return (
    <>
      <ConfirmActionButton
        label={open ? `Afsluiten: ${label}` : `Heropenen: ${label}`}
        icon={<ElixirIcon name={open ? 'lock' : 'edit'} className="h-4 w-4" />}
        action={() => setWeekStatusAction(weekId, open ? 'CLOSED' : 'OPEN')}
        successMessage={open ? 'De week is afgesloten.' : 'De week staat weer open.'}
        // Afsluiten is omkeerbaar (de knop ernaast heropent ze), dus geen
        // dialoog: enkel de toast achteraf.
        confirm={false}
      />
      <ConfirmActionButton
        label={`Verwijderen: ${label}`}
        icon={<ElixirIcon name="trash" className="h-4 w-4" />}
        variant="ghost"
        destructive
        confirmLabel="Verwijderen"
        dialogTitle={`${label} verwijderen?`}
        dialogDescription={
          <>
            De {eveningCount} avonden van deze week verdwijnen mee, met hun kassatellingen, tappersbladen en de
            stocktelling. De drankkaart en de andere weken blijven zoals ze zijn. Dit kan niet ongedaan gemaakt
            worden.
          </>
        }
        action={() => deleteWeekAction(weekId)}
        successMessage="De week is verwijderd."
      />
    </>
  );
}
