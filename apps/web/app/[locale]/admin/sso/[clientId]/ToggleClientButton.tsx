'use client';

import { useTransition } from 'react';
import { Button } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { toggleClientAction } from '../actions';

/**
 * Aan/uit zetten van een client. Omkeerbaar en gooit niets weg, dus geen
 * bevestigingsdialoog; wel een toast, want anders is het enige teken dat er iets
 * gebeurde dat het opschrift van de knop verspringt.
 */
export function ToggleClientButton({ clientId, disabled, nl }: { clientId: string; disabled: boolean; nl: boolean }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const form = new FormData();
          form.append('clientId', clientId);
          form.append('disabled', disabled ? '0' : '1');
          await toggleClientAction(form);
          showToast({
            message: disabled
              ? nl
                ? 'Applicatie ingeschakeld'
                : 'Application enabled'
              : nl
                ? 'Applicatie uitgeschakeld'
                : 'Application disabled',
            variant: 'success',
          });
        })
      }
    >
      {disabled ? (nl ? 'Inschakelen' : 'Enable') : nl ? 'Uitschakelen' : 'Disable'}
    </Button>
  );
}
