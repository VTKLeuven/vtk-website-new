'use client';

import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { seedDefaultItemsAction } from '@/app/actions/fakbar';

/**
 * De standaardkaart klaarzetten. Bewust een knop en geen bijwerking van een
 * pageview: dit stond eerder bovenaan de publieke /drankkaart, waardoor elke
 * bezoeker de databank kon laten schrijven.
 */
export function SeedMenuButton() {
  return (
    <ConfirmActionButton
      label="Standaardkaart toevoegen"
      variant="primary"
      confirm={false}
      action={seedDefaultItemsAction}
      successMessage="De standaardkaart staat klaar."
    />
  );
}
