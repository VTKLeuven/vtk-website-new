'use client';

import { useActionState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { restoreFormValues } from '@/lib/form-values';
import { SAVE_IDLE, type SaveAction } from '@/lib/saveState';

/**
 * Vereenvoudigde kopie van apps/web/components/ui/SaveForm.tsx (zonder de
 * upload-bezig-administratie, die logistiek nog niet nodig heeft). Kandidaat om
 * naar @vtk/ui te hoisten; zie docs/design-decisions.md.
 *
 * Formulier dat de uitkomst van zijn opslaan-actie als toast meldt: groen bij
 * succes, rood bij een fout. Gebruik geen kaal `<form action={...}>` zonder
 * feedback (zie CLAUDE.md).
 */
export function SaveForm({
  action,
  submitLabel,
  savingLabel,
  savedMessage,
  errorMessages,
  fallbackErrorMessage = 'Opslaan is niet gelukt. Probeer opnieuw.',
  onSuccess,
  submitDisabled = false,
  submitVariant = 'primary',
  className,
  children,
}: {
  action: SaveAction;
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  /** Foutcode uit de action -> melding. Onbekende codes vallen terug. */
  errorMessages?: Record<string, string>;
  fallbackErrorMessage?: string;
  /** Loopt na een geslaagde opslag, bv. om een net aangemaakt item te sluiten. */
  onSuccess?: () => void;
  submitDisabled?: boolean;
  submitVariant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  children?: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // De FormData van de laatste submit, om terug te zetten na een fout (zie
  // hieronder). Een ref, niet state: dit hoeft geen hertekening te triggeren.
  const lastSubmitFormData = useRef<FormData | null>(null);

  // Wikkelt de action enkel om de FormData te onthouden; de identiteit blijft
  // stabiel zolang `action` dat is (in de praktijk altijd, want het is telkens
  // een rechtstreekse server-actiereferentie), anders gooit useActionState bij
  // elke hertekening zijn state weg.
  const wrappedAction = useCallback<SaveAction>(
    (prev, formData) => {
      lastSubmitFormData.current = formData;
      return action(prev, formData);
    },
    [action],
  );

  const [state, formAction, pending] = useActionState(wrappedAction, SAVE_IDLE);
  const showToast = useToast();
  // Per submit exact één toast, ook als de component om een andere reden
  // hertekent met dezelfde state.
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === 'idle' || handled.current === state.nonce) return;
    handled.current = state.nonce;

    if (state.status === 'success') {
      // De actie mag een eigen melding meegeven wanneer ze iets deed dat het
      // formulier niet kon voorzien; anders blijft het de vaste tekst.
      showToast({ message: state.message ?? savedMessage, variant: 'success' });
      onSuccess?.();
    } else {
      // React reset een `<form action={...}>` automatisch zodra de action
      // klaar is, ook bij een foutresultaat: de ingetikte waarden springen
      // terug naar hun defaultValue en het lijkt of de wijziging genegeerd
      // werd (bv. nieuwe uren bij een conflicterende rit). Die reset gebeurt
      // in de mutatiefase van de commit, vóór dit effect draait (een
      // useEffect is een passief effect en loopt daarna), dus hier herstellen
      // gebeurt gegarandeerd na de reset en niet ervoor.
      if (formRef.current && lastSubmitFormData.current) {
        restoreFormValues(formRef.current, lastSubmitFormData.current);
      }
      // Blijft staan tot ze weggeklikt wordt: een foutmelding die vanzelf
      // verdwijnt kan je net missen.
      showToast({
        message: errorMessages?.[state.code] ?? state.detail ?? fallbackErrorMessage,
        variant: 'error',
        duration: 0,
      });
    }
  }, [state, showToast, savedMessage, errorMessages, fallbackErrorMessage, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      <Button type="submit" variant={submitVariant} disabled={pending || submitDisabled}>
        {pending ? savingLabel : submitLabel}
      </Button>
    </form>
  );
}
