"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { FormBusyProvider, useFormBusy } from "@/components/ui/formBusy";
import { SAVE_IDLE, type SaveAction } from "@/lib/saveState";

type SecondarySubmit = {
  name: string;
  value: string;
  label: string;
  /**
   * Vraagt eerst een bevestiging. Voor een knop die iets doet wat de bezoeker
   * van de site meteen merkt (een evenement offline halen), maar die niet als
   * "verwijderen" gelabeld staat en dus niet vanzelf argwaan wekt.
   */
  confirm?: {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
  };
};

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
  header,
  footer,
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
   * Alternatieve opslaanknoppen die hetzelfde formulier versturen met een extra
   * waarde mee, zodat de action een andere intentie kent (bv. als concept
   * bewaren of na het opslaan tickets toevoegen). Bewust submits en geen aparte
   * links: het formulier moet eerst bewaard worden.
   */
  /** Eén of meer alternatieve submitacties met elk hun eigen name/value. */
  secondarySubmit?: SecondarySubmit | SecondarySubmit[];
  /**
   * Zet een eigen balk vóór de velden, met de actieknoppen erin (zoals de
   * meescrollende kop van het evenementenformulier). Krijgt dezelfde knoppen en
   * dialoog mee als `footer`, en vervangt net als `footer` de standaard
   * knoppenrij onderaan; geef er hoogstens één van de twee de knoppen, anders
   * staat dezelfde submitknop twee keer in het formulier.
   *
   * De submitknop blijft de eerste submit in het formulier, ook hierboven: die
   * bepaalt wat Enter in een tekstveld doet.
   */
  header?: (props: {
    pending: boolean;
    disabled: boolean;
    submitButton: ReactNode;
    secondaryButtons: ReactNode;
    confirmDialog: ReactNode;
  }) => ReactNode;
  /**
   * Vervangt de standaard knoppenrij onderaan door een eigen footer (zoals de
   * sticky actiebalk van het evenementenformulier). Krijgt de actieknoppen en
   * de bevestigingsdialoog mee zodat de submit-, toestand- en dialooglogica van
   * `SaveForm` intact blijft.
   */
  footer?: (props: {
    pending: boolean;
    disabled: boolean;
    submitButton: ReactNode;
    secondaryButtons: ReactNode;
    confirmDialog: ReactNode;
  }) => ReactNode;
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
  const secondarySubmits = secondarySubmit
    ? Array.isArray(secondarySubmit)
      ? secondarySubmit
      : [secondarySubmit]
    : [];
  // Welke secundaire knop op een bevestiging staat te wachten. De knop zelf mag
  // het formulier dan niet verzenden; dat gebeurt pas in de dialoog.
  const [confirming, setConfirming] = useState<SecondarySubmit | null>(null);

  /**
   * Verstuurt het formulier alsof er op `submit` geklikt was. Nodig omdat de
   * bevestigingsdialoog buiten het formulier staat: `requestSubmit` met een
   * submitter uit de dialoog kan niet, dus zetten we de name/value zelf in de
   * FormData.
   */
  function submitWith(submit: SecondarySubmit) {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set(submit.name, submit.value);
    setConfirming(null);
    startTransition(() => formAction(data));
  }

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

  const submitButton = (
    <Button type="submit" disabled={pending || submitDisabled || busy}>
      {pending ? savingLabel : submitLabel}
    </Button>
  );

  const secondaryButtons = secondarySubmits.map((submit) => (
    // `name`/`value` op de knop: die waarde komt enkel mee wanneer je op
    // déze knop klikt, zodat de action ziet welke van de twee je gebruikte.
    // Staat er een bevestiging op, dan is het een gewone knop en gaat de
    // waarde pas mee wanneer de dialoog bevestigd wordt.
    <Button
      key={`${submit.name}:${submit.value}`}
      type={submit.confirm ? "button" : "submit"}
      variant="secondary"
      {...(submit.confirm ? {} : { name: submit.name, value: submit.value })}
      onClick={submit.confirm ? () => setConfirming(submit) : undefined}
      disabled={pending || submitDisabled || busy}
    >
      {submit.label}
    </Button>
  ));

  const confirmDialog = confirming?.confirm ? (
    <ConfirmDialog
      open
      title={confirming.confirm.title}
      description={confirming.confirm.description}
      confirmLabel={confirming.confirm.confirmLabel}
      cancelLabel={confirming.confirm.cancelLabel}
      pending={pending}
      onConfirm={() => submitWith(confirming)}
      onCancel={() => setConfirming(null)}
    />
  ) : null;

  const chrome = {
    pending,
    disabled: pending || submitDisabled || busy,
    submitButton,
    secondaryButtons,
    confirmDialog,
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      {header ? header(chrome) : null}
      <FormBusyProvider register={register}>{children}</FormBusyProvider>
      {footer ? (
        footer(chrome)
      ) : header ? null : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {submitButton}
            {secondaryButtons}
          </div>
          {confirmDialog}
        </>
      )}
    </form>
  );
}
