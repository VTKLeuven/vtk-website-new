"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  CAREER_OPT_IN_FIELD,
  CAREER_OPT_IN_SHOWN_FIELD,
  careerFitsStudy,
  careerHeading,
  type CareerOptInCopy,
  type CareerStudyState,
} from "@/lib/careerOptIn";

/** De studievelden zoals stap 1 ze nu in het formulier heeft staan. */
function studyFromForm(form: HTMLFormElement): CareerStudyState {
  const data = new FormData(form);
  return {
    isStudent: data.get("isStudent") === "on",
    notAtFaculty: data.get("notAtFaculty") === "on",
    studyYears: data.getAll("studyYears").map(String),
    studyProgrammes: data.getAll("studyProgrammes").map(String),
  };
}

/**
 * De Career-vraag onderaan de studiebevestiging: de Career Fair met de titel op
 * de linkerhelft, en de vraag eronder.
 *
 * De foto doet het werk. Dit is waar die mails over gaan, en een zaal vol
 * bedrijven zegt dat sneller dan een zin. De vormkeuzes (3.4:1, een verloop dat
 * links draagt en rechts oplost, de titel achter een gele regel) staan in
 * `vtk-career-optin.css` en in docs/design-decisions.md.
 *
 * Wat het bewust **niet** doet, en dat is een AVG-grens en geen stijlkeuze:
 * niet voorgevinkt (een voorgevinkt vakje is geen toestemming), niet verplicht
 * om te bevestigen, en de tekst zegt wat je krijgt en hoe je er weer af raakt.
 * Wie het leeg laat, bevestigt zijn studie gewoon.
 *
 * **Het blok volgt stap 1.** Of het verschijnt en wat de titel zegt, hangt af van
 * het studiejaar en de richting van dít jaar, en die vult het lid pas in stap 1
 * in; het profiel dat de server kent, is dat van vorig jaar (zie
 * `shouldAskCareerOptIn`). Past het antwoord niet (meer) bij Career, dan staat
 * het fieldset `hidden` én `disabled`, zodat een vinkje van daarnet niet
 * ongezien meegaat. De server beslist bij het opslaan opnieuw op dezelfde regel.
 *
 * `copy` is `null` wanneer het lid de vraag sowieso niet krijgt (Career al aan,
 * of uitgeschreven via een mail); dat hangt niet van stap 1 af.
 */
export function CareerOptIn({
  copy,
  initial,
  photoAlt,
  alwaysShow = false,
}: {
  copy: CareerOptInCopy | null;
  /** Het profiel zoals de server het kent; ook de beginstand van stap 1. */
  initial: CareerStudyState;
  photoAlt: string;
  /**
   * Voor de voorvertoning in /admin/it/flows: altijd tonen, want ze zou anders
   * verdwijnen net wanneer een beheerder ze wil nakijken. De titel beweegt wel mee.
   */
  alwaysShow?: boolean;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const [study, setStudy] = useState<CareerStudyState>(initial);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const update = () => setStudy(studyFromForm(form));
    // `change` volstaat: elk veld dat telt is een vinkje. Eén keer bij het
    // mounten, voor het geval de browser een formulier bij "terug" herstelde.
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  if (!copy) return null;
  const shown = alwaysShow || careerFitsStudy(study);

  return (
    <fieldset ref={ref} className="vtk-career" hidden={!shown} disabled={!shown}>
      <input type="hidden" name={CAREER_OPT_IN_SHOWN_FIELD} value="1" />
      <div className="vtk-career-shot">
        {/* Dezelfde foto als de Career-band op de homepage. `fill` met een eigen
            hoogteverhouding: de uitsnede hoort bij het blok, niet bij het bestand. */}
        {/* quality 90 en niet de standaard 75: onder het verloop worden de
            donkere delen van een zaalfoto op 75 vlekkerig (zie CLAUDE.md). */}
        <Image
          src="/career-fair.jpg"
          alt={photoAlt}
          fill
          quality={90}
          sizes="(max-width: 860px) 100vw, 800px"
        />
        <div className="vtk-career-text">
          <div className="vtk-career-kicker">{copy.kicker}</div>
          <p className="vtk-career-title">{careerHeading(copy, study)}</p>
        </div>
      </div>
      <div className="vtk-career-body">
        <p className="vtk-career-lead">{copy.lead}</p>
        <label className="vtk-career-pick">
          <input type="checkbox" name={CAREER_OPT_IN_FIELD} value="on" defaultChecked={false} />
          <span className="vtk-career-pick-label">
            {copy.option}
            <span className="vtk-career-fine">{copy.hint}</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
