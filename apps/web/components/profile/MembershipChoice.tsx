import type { MembershipOffer } from "@/lib/membership/offer";

export type MembershipChoiceLabels = {
  heading: string;
  option: string;
  hint: string;
};

/**
 * De lidmaatschapsvraag op de studiebevestiging en in de onboarding.
 *
 * Eén vinkje, nooit twee: wie aan de faculteit studeert krijgt de gratis weg te
 * zien, de rest de betalende. Twee keuzes naast elkaar zouden suggereren dat er
 * iets te kiezen valt, terwijl het van je faculteit afhangt.
 *
 * Het vinkje is bewust niet voorgevinkt en niet verplicht: dit is een beslissing
 * van het lid (bij de betalende weg zelfs een uitgave), en het bevestigen van de
 * studie mag er niet op blijven hangen.
 *
 * De teksten komen als prop binnen, zoals bij `StudyStatusFields`: dit hangt ook
 * in het clientformulier van de onboarding, en dan hoort de hele i18n-dictionary
 * niet mee in die bundel.
 */
export function MembershipChoice({
  offer,
  labels,
}: {
  offer: MembershipOffer;
  labels: MembershipChoiceLabels | null;
}) {
  if (offer.kind === "none" || !labels) return null;

  return (
    <fieldset className="rounded-2xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-4">
      <legend className="px-1 text-sm font-medium text-vtk-ink">{labels.heading}</legend>
      <label className="flex items-start gap-3 text-sm text-vtk-ink">
        <input type="checkbox" name="membership" value={offer.kind} className="mt-1 shrink-0" />
        <span>
          {labels.option}
          <span className="mt-1 block text-xs text-[#5c667f]">{labels.hint}</span>
        </span>
      </label>
    </fieldset>
  );
}
