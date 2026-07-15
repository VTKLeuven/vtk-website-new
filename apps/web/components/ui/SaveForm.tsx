"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";

/**
 * Formulier dat de uitkomst van zijn opslaan-actie als toast meldt: groen bij
 * succes, rood bij een fout. Dit is de standaardmanier om iets op te slaan (zie
 * CLAUDE.md); gebruik geen kaal `<form action={...}>` zonder feedback.
 *
 * De velden komen als children binnen en mogen server-gerenderd zijn; enkel deze
 * schil is client. De submitknop hoort erbij en toont de bezig-toestand.
 */
export function SaveForm({
  action,
  submitLabel,
  savingLabel,
  savedMessage,
  errorMessages,
  fallbackErrorMessage,
  onSuccess,
  submitDisabled = false,
  className,
  children,
}: {
  action: SaveAction;
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  /** Foutcode uit de action -> vertaalde melding. Onbekende codes vallen terug. */
  errorMessages?: Record<string, string>;
  fallbackErrorMessage: string;
  /** Loopt na een geslaagde opslag, bv. om een net aangemaakt item te sluiten. */
  onSuccess?: () => void;
  /** Extra voorwaarde bovenop "bezig met opslaan", bv. een verplichte upload. */
  submitDisabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, SAVE_IDLE);
  const showToast = useToast();
  // Per submit exact één toast, ook als de component om een andere reden
  // hertekent met dezelfde state.
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === "idle" || handled.current === state.nonce) return;
    handled.current = state.nonce;

    if (state.status === "success") {
      showToast({ message: savedMessage, variant: "success" });
      onSuccess?.();
    } else {
      // Blijft staan tot het lid ze wegklikt: een foutmelding die na vier
      // seconden verdwijnt kan je net missen.
      showToast({
        message: errorMessages?.[state.code] ?? fallbackErrorMessage,
        variant: "error",
        duration: 0,
      });
    }
  }, [state, showToast, savedMessage, errorMessages, fallbackErrorMessage, onSuccess]);

  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" disabled={pending || submitDisabled}>
        {pending ? savingLabel : submitLabel}
      </Button>
    </form>
  );
}
