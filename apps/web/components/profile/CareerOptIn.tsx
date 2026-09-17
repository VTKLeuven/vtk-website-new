import Image from "next/image";
import { CAREER_OPT_IN_FIELD } from "@/lib/careerOptIn";

export type CareerOptInLabels = {
  kicker: string;
  heading: string;
  option: string;
  hint: string;
  lead: string;
};

/**
 * De Career-vraag onderaan de studiebevestiging: de Career Fair onder een navy
 * wash, met de vraag eronder.
 *
 * De foto doet het werk. Dit is waar die mails over gaan, en een zaal vol
 * bedrijven zegt dat sneller dan een zin. De vormkeuzes (gelijkmatige wash op
 * 75%, 4:1, tekst linksonder) staan in `vtk-career-optin.css` en in
 * docs/design-decisions.md.
 *
 * Wat het bewust **niet** doet, en dat is een AVG-grens en geen stijlkeuze:
 * niet voorgevinkt (een voorgevinkt vakje is geen toestemming), niet verplicht
 * om te bevestigen, en de tekst zegt wat je krijgt en hoe je er weer af raakt.
 * Wie het leeg laat, bevestigt zijn studie gewoon.
 *
 * De teksten komen als prop binnen, zoals bij `MembershipChoice`; de titel
 * draagt de richting van het lid (zie `careerChoiceLabels`).
 */
export function CareerOptIn({
  labels,
  photoAlt,
}: {
  labels: CareerOptInLabels | null;
  photoAlt: string;
}) {
  if (!labels) return null;

  return (
    <fieldset className="vtk-career">
      <div className="vtk-career-shot">
        {/* Dezelfde foto als de Career-band op de homepage. `fill` met een eigen
            hoogteverhouding: de uitsnede hoort bij het blok, niet bij het bestand. */}
        {/* quality 90 en niet de standaard 75: onder de navy wash worden de
            donkere delen van een zaalfoto op 75 vlekkerig (zie CLAUDE.md). */}
        <Image
          src="/career-fair.jpg"
          alt={photoAlt}
          fill
          quality={90}
          sizes="(max-width: 860px) 100vw, 800px"
        />
        <div className="vtk-career-text">
          <div className="vtk-career-kicker">{labels.kicker}</div>
          <p className="vtk-career-title">{labels.heading}</p>
        </div>
      </div>
      <div className="vtk-career-body">
        <p className="vtk-career-lead">{labels.lead}</p>
        <label className="vtk-career-pick">
          <input type="checkbox" name={CAREER_OPT_IN_FIELD} value="on" defaultChecked={false} />
          <span className="vtk-career-pick-label">
            {labels.option}
            <span className="vtk-career-fine">{labels.hint}</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
