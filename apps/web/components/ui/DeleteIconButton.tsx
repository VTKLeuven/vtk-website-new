"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { IconButton, type IconTone } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useUnsentGuard } from "@/components/ui/unsentGuard";
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
  /**
   * Eén keuze in de dialoog zelf, als vinkje onder de beschrijving. Aangevinkt
   * gaat `name=on` mee naar de action, net als een checkbox in een formulier.
   * Voor een verwijdering die iets mee kan nemen waar de gebruiker over moet
   * kunnen beslissen (een verkoopdag en haar shiften).
   */
  option?: ConfirmOption;
};

export type ConfirmOption = {
  name: string;
  label: string;
  /** Een regel uitleg onder het vinkje, bv. wat er gebeurt als je het uitvinkt. */
  hint?: string;
  /** Standaard uit. */
  defaultChecked?: boolean;
};

/** Bevestigen, uitvoeren en melden; gedeeld door alle varianten. */
function useConfirmFlow({
  action,
  fields,
  successMessage,
  errorMessages,
  errorFallback,
  option,
}: Pick<Common, "action" | "fields" | "successMessage" | "errorMessages" | "errorFallback" | "option">) {
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(option?.defaultChecked ?? false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();

  function onConfirm() {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (option && checked) form.append(option.name, "on");
    startTransition(async () => {
      // Een verwijdering die de server nooit bereikte, is niet gebeurd: zeg
      // dat, in plaats van het scherm in de error boundary te laten vallen.
      let result: void | SaveState;
      try {
        result = await action(form);
      } catch (error) {
        setConfirming(false);
        if (unsent.report(error)) return;
        throw error;
      }
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

  // Elke keer dat de dialoog opengaat, staat het vinkje terug op zijn standaard:
  // een keuze van een vorige, geannuleerde poging hoort niet stil mee te gaan.
  function open() {
    setChecked(option?.defaultChecked ?? false);
    setConfirming(true);
  }

  const dialog = {
    open: confirming,
    pending,
    onConfirm,
    onCancel: () => setConfirming(false),
    checked,
    onCheckedChange: setChecked,
  };

  return { open, dialog };
}

/**
 * Verwijder-rij-actie: icoon met tooltip, bevestigingsdialoog en toast achteraf.
 * Bundelt de conventies uit CLAUDE.md zodat elke lijst dit niet apart bouwt.
 */
export function DeleteIconButton(props: Common & { label: string; srLabel?: string }) {
  return <ConfirmIconButton {...props} icon={<TrashIcon />} tone="danger" />;
}

/**
 * Dezelfde flow voor een rij-actie die niets verwijdert maar wel eerst moet
 * zeggen wat ze doet: iets afvinken dat je niet ongedaan maakt. Eigen icoon,
 * standaard in de neutrale toon.
 */
export function ConfirmIconButton({
  label,
  srLabel,
  icon,
  tone = "neutral",
  ...common
}: Common & { label: string; srLabel?: string; icon: ReactNode; tone?: IconTone }) {
  const { open, dialog } = useConfirmFlow(common);
  return (
    <>
      <IconButton label={label} srLabel={srLabel} tone={tone} onClick={open}>
        {icon}
      </IconButton>
      <Dialog {...common} {...dialog} />
    </>
  );
}

/**
 * Zelfde flow, maar als tekstknop. Voor destructieve acties op formulierniveau
 * ("POC verwijderen") die geen compacte rij-actie zijn.
 */
export function DeleteButton({ children, ...common }: Common & { children: ReactNode }) {
  const { open, dialog } = useConfirmFlow(common);
  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={open}>
        {children}
      </Button>
      <Dialog {...common} {...dialog} />
    </>
  );
}

/**
 * Zelfde flow, als een kale knop met de klasse van de beller: voor een actie
 * die naast een andere tekstknop in eigen opmaak staat ("Post wijzigen" en
 * "Niet meetellen" op /admin/bestuursorgaan).
 */
export function ConfirmTextButton({
  className,
  ariaLabel,
  children,
  ...common
}: Common & { className: string; ariaLabel?: string; children: ReactNode }) {
  const { open, dialog } = useConfirmFlow(common);
  return (
    <>
      <button type="button" className={className} aria-label={ariaLabel} onClick={open}>
        {children}
      </button>
      <Dialog {...common} {...dialog} />
    </>
  );
}

function Dialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  option,
  open,
  pending,
  onConfirm,
  onCancel,
  checked,
  onCheckedChange,
}: Omit<Common, "action" | "fields" | "successMessage" | "errorMessages" | "errorFallback"> & {
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={
        option ? (
          <>
            <p>{description}</p>
            <label className="mt-3 flex items-start gap-2 text-vtk-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                disabled={pending}
                onChange={(event) => onCheckedChange(event.target.checked)}
              />
              <span>
                {option.label}
                {option.hint ? <span className="mt-0.5 block text-xs text-vtk-muted">{option.hint}</span> : null}
              </span>
            </label>
          </>
        ) : (
          description
        )
      }
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
