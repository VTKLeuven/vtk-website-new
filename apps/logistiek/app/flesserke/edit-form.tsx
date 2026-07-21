'use client';

import { useState } from 'react';
import { Button } from '@vtk/ui';
import type { RequesterOption } from '@/app/materiaal/event-fields';
import type { FlesserkeCatalogCategory } from '@/lib/uitleen-server';
import { FlesserkeForm, type FlesserkeInitial } from './request-form';

/** Lid-bewerking van een nog niet besliste flesserke-aanvraag. */
export function FlesserkeEditor({
  reservationId,
  catalog,
  groups,
  locale,
  initial,
}: {
  reservationId: string;
  catalog: FlesserkeCatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  initial: FlesserkeInitial;
}) {
  const en = locale === 'en';
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
      <FlesserkeForm
        catalog={catalog}
        groups={groups}
        locale={locale}
        initial={initial}
        mode={{ kind: 'edit', reservationId }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
