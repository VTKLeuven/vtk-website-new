"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import type { TicketDeleteResult } from "@/app/actions/tickets";

/**
 * Een onomkeerbare actie in het ticketbeheer: bevestigen, uitvoeren, melden.
 *
 * Bestaat naast `DeleteIconButton` omdat het ticketbeheer zijn eigen knoptaal
 * heeft (`ticket-admin-button`) en hier geen rij-icoontje past: het gaat om één
 * actie per blok, met een naam ("Tickettype verwijderen"), niet om twintig
 * gelijke rijen. De flow eronder is dezelfde als in CLAUDE.md: een
 * bevestigingsdialoog die zegt wat er weg is en wat blijft, en achteraf een
 * toast. Laat `successMessage` weg wanneer de action redirect; die navigatie is
 * dan zelf de bevestiging.
 *
 * De action geeft een code terug in plaats van te gooien, zodat "er is intussen
 * al besteld" een rode toast wordt en geen error boundary.
 */
export function DangerActionButton({
  action,
  fields,
  label,
  icon,
  title,
  description,
  confirmLabel,
  cancelLabel,
  successMessage,
  errorMessages,
  fallbackErrorMessage,
}: {
  action: (formData: FormData) => Promise<TicketDeleteResult>;
  /** Wordt als FormData naar de action gestuurd. */
  fields: Record<string, string>;
  label: string;
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  successMessage?: string;
  /** Foutcode uit de action, vertaald naar een melding die zegt wat er misging. */
  errorMessages?: Record<string, string>;
  fallbackErrorMessage: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function onConfirm() {
    const form = new FormData();
    for (const [key, entry] of Object.entries(fields)) form.append(key, entry);
    startTransition(async () => {
      // Redirect de action, dan navigeert de client en komt er niets terug; die
      // navigatie is dan zelf de bevestiging.
      const result: TicketDeleteResult | undefined = await action(form);
      setConfirming(false);
      if (!result || result.ok) {
        if (successMessage) showToast({ message: successMessage, variant: "success" });
        return;
      }
      showToast({
        message: errorMessages?.[result.error] ?? fallbackErrorMessage,
        variant: "error",
        // Een foutmelding blijft staan tot de gebruiker ze wegklikt.
        duration: 0,
      });
    });
  }

  return (
    <>
      <button
        type="button"
        className="ticket-admin-button"
        data-variant="danger"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {icon}
        {label}
      </button>
      <ConfirmDialog
        open={confirming}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
