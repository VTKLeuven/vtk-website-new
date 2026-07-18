'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
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
  const [state, formAction, pending] = useActionState(action, SAVE_IDLE);
  const showToast = useToast();
  // Per submit exact één toast, ook als de component om een andere reden
  // hertekent met dezelfde state.
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === 'idle' || handled.current === state.nonce) return;
    handled.current = state.nonce;

    if (state.status === 'success') {
      showToast({ message: savedMessage, variant: 'success' });
      onSuccess?.();
    } else {
      // Blijft staan tot ze weggeklikt wordt: een foutmelding die vanzelf
      // verdwijnt kan je net missen.
      showToast({
        message: errorMessages?.[state.code] ?? fallbackErrorMessage,
        variant: 'error',
        duration: 0,
      });
    }
  }, [state, showToast, savedMessage, errorMessages, fallbackErrorMessage, onSuccess]);

  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" variant={submitVariant} disabled={pending || submitDisabled}>
        {pending ? savingLabel : submitLabel}
      </Button>
    </form>
  );
}
