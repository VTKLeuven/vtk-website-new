'use client';

import { useState } from 'react';
import { Button } from '@vtk/ui';
import { FlesserkeForm, type FlesserkeInitial } from '@/app/flesserke/request-form';
import type { RequesterOption } from '@/app/materiaal/event-fields';
import type { FlesserkeCatalogCategory } from '@/lib/uitleen-server';

/**
 * Team-bewerking van een flesserke-aanvraag. Hetzelfde formulier als het lid
 * gebruikt, maar met de volledige postkeuze en de team-actie erachter; zonder dit
 * moest het team een foute aanvraag laten hermaken.
 */
export function AdminFlesserkeEditor({
  reservationId,
  catalog,
  groups,
  initial,
  lastMinuteDays,
}: {
  reservationId: string;
  catalog: FlesserkeCatalogCategory[];
  groups: RequesterOption[];
  initial: FlesserkeInitial;
  lastMinuteDays: number;
}) {
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
      <FlesserkeForm
        catalog={catalog}
        groups={groups}
        locale="nl"
        initial={initial}
        lastMinuteDays={lastMinuteDays}
        mode={{ kind: 'admin-edit', reservationId }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
