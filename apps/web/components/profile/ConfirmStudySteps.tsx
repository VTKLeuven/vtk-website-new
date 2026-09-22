"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@vtk/ui";

export type ConfirmStudyStepsLabels = {
  /** "Stap {step} van {total}" */
  stepOf: string;
  continueLabel: string;
  backLabel: string;
  submitLabel: string;
  unchangedHint: string;
};

type Panes = {
  first: ReactNode;
  /** `null` wanneer er niets te vragen valt; dan blijft het één pagina. */
  second: ReactNode | null;
  /**
   * Of er bij het laden iets zichtbaars in stap 2 staat. De Career-vraag volgt
   * stap 1 en kan dus leeg beginnen (of leeg worden); zonder deze beginstand
   * toont de server "Stap 1 van 2" boven een formulier met maar één stap.
   */
  secondVisible?: boolean;
  labels: ConfirmStudyStepsLabels;
};

/** Staat er in dit paneel nog een vraag die niet `hidden` is? */
function hasVisibleQuestion(pane: HTMLElement): boolean {
  return Array.from(pane.children).some((child) => !(child as HTMLElement).hidden);
}

/**
 * De jaarlijkse studiebevestiging in twee stappen: eerst wie je bent en waar je
 * woont, dan de twee vragen die erbij komen (lidmaatschap en Career).
 *
 * Waarom gesplitst: het scherm was één kolom van vier statussen, vijf
 * studiejaren, zestien richtingen, twee adressen en dan pas de twee vragen
 * waarvoor het antwoord ons het meest uitmaakt. Die stonden onderaan een pagina
 * waar het lid al tien keer geklikt had en enkel nog "bevestigen" zocht. Op een
 * eigen stap staan ze niet meer in de staart van een lijst.
 *
 * **Eén formulier, twee panelen**, en niet twee POSTs. De verborgen stap blijft
 * in de DOM staan, dus alles vertrekt in één keer naar `confirmStudyAction`:
 * niemand kan halverwege blijven hangen met een bevestigde studie maar een
 * onbeantwoorde lidmaatschapsvraag, en de action hoeft geen tussenstand te
 * kennen. Terug gaan verliest daardoor ook niets.
 *
 * Zonder JavaScript staan beide panelen open en verstuurt de gewone submitknop
 * het hele formulier; een server action werkt daar ook zonder JS. Een gate die
 * op "Ga verder" blijft steken zou niemand nog binnenlaten.
 */
export function ConfirmStudySteps(
  props: Panes &
    (
      | {
          /**
           * Voor de voorvertoning in /admin/it/flows: beide stappen onder
           * elkaar, met hun stapkop, en geen navigatie. Die pagina zit in een
           * `SaveForm` die zelf het formulier en de submitknop bezit, en een
           * beheerder wil er de volledige inhoud zien zonder door te klikken.
           */
          preview: true;
        }
      | {
          preview?: false;
          action: (formData: FormData) => void | Promise<void>;
          next: string;
        }
    ),
) {
  const { first, second, labels } = props;
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const [secondVisible, setSecondVisible] = useState(props.secondVisible ?? true);

  // De vragen in stap 2 kunnen zichzelf verbergen (de Career-vraag doet dat
  // wanneer stap 1 niet meer bij Career past). Valt daardoor alles weg, dan is
  // stap 2 een lege pagina en een klik voor niets: dan wordt het één stap.
  useEffect(() => {
    const pane = secondRef.current;
    if (!pane) return;
    const update = () => setSecondVisible(hasVisibleQuestion(pane));
    update();
    const observer = new MutationObserver(update);
    observer.observe(pane, { subtree: true, childList: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, []);

  const hasSecond = second !== null;
  // Het tweede paneel blijft altijd gemount zolang er een is, ook wanneer het
  // leeg staat: anders verliest de Career-vraag haar luisteraar op stap 1 en
  // komt ze niet meer terug wanneer het antwoord daar opnieuw verandert.
  const twoStep = hasSecond && secondVisible;
  const stepLabel = (n: number) =>
    labels.stepOf.replace("{step}", String(n)).replace("{total}", "2");

  const kicker = (n: number) => (
    <p
      className="text-xs font-semibold uppercase tracking-[0.11em] text-[#5c667f]"
      data-step-kicker
    >
      {stepLabel(n)}
    </p>
  );

  if (props.preview) {
    return (
      <div className="space-y-6">
        <div className="space-y-6">
          {twoStep ? kicker(1) : null}
          {first}
        </div>
        {twoStep ? (
          <div className="space-y-6 border-t border-vtk-blue/10 pt-6">
            {kicker(2)}
            {second}
          </div>
        ) : null}
      </div>
    );
  }

  // Verder gaan zonder de browservalidatie is een lege stap: dan komt de
  // foutmelding op een veld te staan dat het lid niet meer ziet.
  const goForward = () => {
    if (formRef.current && !formRef.current.reportValidity()) return;
    setStep(2);
    formRef.current?.scrollIntoView({ block: "start" });
  };

  const goBack = () => {
    setStep(1);
    formRef.current?.scrollIntoView({ block: "start" });
  };

  const submitRow = (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit">{labels.submitLabel}</Button>
      {twoStep ? (
        <Button type="button" variant="ghost" onClick={goBack}>
          {labels.backLabel}
        </Button>
      ) : null}
      <span className="text-xs text-[#5c667f]">{labels.unchangedHint}</span>
    </div>
  );

  return (
    <form ref={formRef} action={props.action} className="vtk-steps space-y-6">
      <input type="hidden" name="next" value={props.next} />

      {twoStep ? kicker(step) : null}

      <div className="space-y-6" hidden={twoStep && step !== 1} data-step-pane>
        {first}
      </div>

      {hasSecond ? (
        <div ref={secondRef} className="space-y-6" hidden={!twoStep || step !== 2} data-step-pane>
          {second}
        </div>
      ) : null}

      {twoStep ? (
        <>
          <div hidden={step !== 1} data-step-nav>
            <Button type="button" onClick={goForward}>
              {labels.continueLabel}
            </Button>
          </div>
          <div hidden={step !== 2} data-step-submit>
            {submitRow}
          </div>
          {/* Zonder JS is er geen "Ga verder": dan is het één pagina met één knop. */}
          <noscript>
            <style>{`.vtk-steps [data-step-pane],.vtk-steps [data-step-submit]{display:block!important}.vtk-steps [data-step-nav],.vtk-steps [data-step-kicker]{display:none!important}`}</style>
          </noscript>
        </>
      ) : (
        submitRow
      )}
    </form>
  );
}
