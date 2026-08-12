"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { FormBusyProvider, useFormBusy } from "@/components/ui/formBusy";
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
  resetOnSuccess = true,
  submitDisabled = false,
  secondarySubmit,
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
  /** Uit voor bewerkformulieren die hun gecontroleerde waarden moeten behouden. */
  resetOnSuccess?: boolean;
  /** Extra voorwaarde bovenop "bezig met opslaan", bv. een verplichte upload. */
  submitDisabled?: boolean;
  /**
   * Tweede opslaanknop die hetzelfde formulier verstuurt met een extra waarde
   * mee, zodat de action daarna ergens anders naartoe kan (bv. "Opslaan en
   * tickets toevoegen"). Bewust een submit en geen aparte link: het formulier
   * moet eerst bewaard worden.
   */
  secondarySubmit?: { name: string; value: string; label: string };
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, SAVE_IDLE);
  const showToast = useToast();
  // Een veld kan nog bezig zijn (een upload die pas achteraf zijn key kent).
  // Verzenden zou dan een lege waarde bewaren onder een groene toast.
  const { busy, register } = useFormBusy();
  // Per submit exact één toast, ook als de component om een andere reden
  // hertekent met dezelfde state.
  const handled = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * Zelf verzenden in plaats van `<form action={formAction}>`.
   *
   * React leegt een uncontrolled formulier na élke afgelopen form action, dus
   * ook na een geweigerde opslag: je typte twintig velden, één e-mailadres had
   * een tikfout, en alles stond weer op de oude waarde onder een rode toast.
   * Via een eigen submit gebeurt dat niet, en resetten we hieronder enkel na
   * succes; daar rekenen de "toevoegen"-formulieren op, die na een geslaagde
   * toevoeging leeg horen te zijn.
   *
   * De submitter moet mee in de FormData, anders verliest `secondarySubmit`
   * zijn name/value en weet de action niet op welke knop je klikte.
   */
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // Alleen een echte submitknop mag als submitter mee; iets anders laat de
    // FormData-constructor met een TypeError afgaan.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(
      form,
      submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
        ? submitter
        : null
    );
    startTransition(() => formAction(data));
  }

  useEffect(() => {
    if (state.status === "idle" || handled.current === state.nonce) return;
    handled.current = state.nonce;

    if (state.status === "success") {
      if (resetOnSuccess) formRef.current?.reset();
      showToast({ message: savedMessage, variant: "success" });
      onSuccess?.();
    } else {
      // Blijft staan tot het lid ze wegklikt: een foutmelding die na vier
      // seconden verdwijnt kan je net missen.
      showToast({
        message: errorMessages?.[state.code] ?? state.detail ?? fallbackErrorMessage,
        variant: "error",
        duration: 0,
      });
    }
  }, [
    state,
    showToast,
    savedMessage,
    errorMessages,
    fallbackErrorMessage,
    onSuccess,
    resetOnSuccess,
  ]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      <FormBusyProvider register={register}>{children}</FormBusyProvider>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || submitDisabled || busy}>
          {pending ? savingLabel : submitLabel}
        </Button>
        {secondarySubmit ? (
          // `name`/`value` op de knop: die waarde komt enkel mee wanneer je op
          // déze knop klikt, zodat de action ziet welke van de twee je gebruikte.
          <Button
            type="submit"
            variant="secondary"
            name={secondarySubmit.name}
            value={secondarySubmit.value}
            disabled={pending || submitDisabled || busy}
          >
            {secondarySubmit.label}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
