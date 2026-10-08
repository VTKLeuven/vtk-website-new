'use client';

import Link from 'next/link';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ElixirIcon } from '@/components/elixir-icon';
import { deleteFakPeriodAction } from '@/app/actions/fakscanner';

/**
 * Rij-acties van een periode: icoonknoppen (CLAUDE.md). Het label draagt de naam
 * van de periode mee, anders hoort een screenreader enkel "Verwijderen".
 */
export function FakPeriodActions({
  id,
  name,
  people,
  active,
}: {
  id: string;
  name: string;
  people: number;
  active: boolean;
}) {
  return (
    <>
      <Link
        href={`/admin/fakscanner/periodes/${id}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--paper-2)]"
        title={`Bewerken: ${name}`}
        aria-label={`Bewerken: ${name}`}
      >
        <ElixirIcon name="edit" className="h-4 w-4" />
      </Link>
      <ConfirmActionButton
        label={`Verwijderen: ${name}`}
        icon={<ElixirIcon name="trash" className="h-4 w-4" />}
        variant="ghost"
        destructive
        confirmLabel="Verwijderen"
        dialogTitle={`${name} verwijderen?`}
        dialogDescription={
          <>
            {people === 0
              ? 'Er heeft nog niemand gescand in deze periode.'
              : `De stand van de ${people} ${people === 1 ? 'persoon' : 'mensen'} die in deze periode scanden, verdwijnt mee.`}{' '}
            {active ? 'De periode loopt nu: vanaf het verwijderen telt de scanner meteen weer zoals altijd. ' : ''}
            De jaarstand en de andere periodes blijven zoals ze zijn. Dit kan niet ongedaan gemaakt worden.
          </>
        }
        action={() => deleteFakPeriodAction(id)}
        successMessage="De periode is verwijderd."
      />
    </>
  );
}
