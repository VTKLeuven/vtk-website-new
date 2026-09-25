"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type { SaveState } from "@/lib/saveState";

type Common = {
  /**
   * Server action-referentie; serialiseerbaar, dus bruikbaar vanuit server
   * components. Geeft ze een `SaveState` terug, dan wordt een `status: "error"`
   * een rode toast in plaats van een stille mislukking; `void` blijft werken voor
   * acties die enkel kunnen slagen of redirecten.
   */
  action: (formData: FormData) => Promise<void | SaveState>;
  /** Wordt als FormData naar de action gestuurd. */
  fields: Record<string, string>;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /**
   * Laat weg wanneer de action redirect: die navigatie is zelf de bevestiging, en
   * deze component is dan al ge-unmount voor de toast kan verschijnen.
   */
  successMessage?: string;
  /**
   * Foutcode uit de action naar een vertaalde melding, net als bij `SaveForm`.
   * `errorFallback` vangt de codes die hier niet in staan.
   */
  errorMessages?: Record<string, string>;
  errorFallback?: string;
};

/** Bevestigen, uitvoeren en melden; gedeeld door beide varianten. */
function useDeleteFlow({
  action,
  fields,
  successMessage,
  errorMessages,
  errorFallback,
}: Pick<Common, "action" | "fields" | "successMessage" | "errorMessages" | "errorFallback">) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function onConfirm() {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    startTransition(async () => {
      const result = await action(form);
      setConfirming(false);
      if (result && result.status === "error") {
        // Fout-toasts blijven staan tot de gebruiker ze wegklikt.
        showToast({
          message:
            errorMessages?.[result.code] ??
            result.detail ??
            errorFallback ??
            "Er ging iets mis. Probeer het opnieuw.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      if (successMessage) showToast({ message: successMessage, variant: "success" });
    });
  }

  return { confirming, setConfirming, pending, onConfirm };
}

/**
 * Verwijder-rij-actie: icoon met tooltip, bevestigingsdialoog en toast achteraf.
 * Bundelt de conventies uit CLAUDE.md zodat elke lijst dit niet apart bouwt.
 */
export function DeleteIconButton({
  label,
  srLabel,
  ...common
}: Common & { label: string; srLabel?: string }) {
  const { confirming, setConfirming, pending, onConfirm } = useDeleteFlow(common);
  return (
    <>
      <IconButton label={label} srLabel={srLabel} tone="danger" onClick={() => setConfirming(true)}>
        <TrashIcon />
      </IconButton>
      <Dialog {...common} open={confirming} pending={pending} onConfirm={onConfirm} onCancel={() => setConfirming(false)} />
    </>
  );
}

/**
 * Zelfde flow, maar als tekstknop. Voor destructieve acties op formulierniveau
 * ("POC verwijderen") die geen compacte rij-actie zijn.
 */
export function DeleteButton({ children, ...common }: Common & { children: ReactNode }) {
  const { confirming, setConfirming, pending, onConfirm } = useDeleteFlow(common);
  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(true)}>
        {children}
      </Button>
      <Dialog {...common} open={confirming} pending={pending} onConfirm={onConfirm} onCancel={() => setConfirming(false)} />
    </>
  );
}

function Dialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  open,
  pending,
  onConfirm,
  onCancel,
}: Omit<Common, "action" | "fields" | "successMessage" | "errorMessages" | "errorFallback"> & {
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
