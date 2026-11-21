"use client";

import { Card } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { joinMembershipAction } from "@/app/actions/membership";

/**
 * Alsnog lid worden, nadat je de vraag bij de studiebevestiging liet staan.
 *
 * Eén knop, want welke van de twee wegen het is (gratis of betalend) hangt van
 * je faculteit af en niet van een voorkeur; de server bepaalt ze opnieuw. De
 * betalende weg gaat meteen door naar de betaalpagina, de gratis meldt zich met
 * een toast en de status erboven verandert mee.
 *
 * Met `honorary` is het de kaart om betalend erelid te worden: dezelfde action
 * met `soort=erelid`, die het aanbod ook zelf opnieuw nakijkt.
 */
export function JoinMembershipCard({
  locale,
  heading,
  intro,
  submitLabel,
  savingLabel,
  savedMessage,
  closedMessage,
  failedMessage,
  honorary = false,
  errorMessages = {},
}: {
  locale: "nl" | "en";
  heading: string;
  intro: string;
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  closedMessage: string;
  failedMessage: string;
  honorary?: boolean;
  /** Extra foutmeldingen, bovenop "gesloten". */
  errorMessages?: Record<string, string>;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-vtk-ink">{heading}</h2>
      <p className="mb-4 mt-1 text-sm text-[#34405e]">{intro}</p>
      <SaveForm
        action={joinMembershipAction}
        submitLabel={submitLabel}
        savingLabel={savingLabel}
        savedMessage={savedMessage}
        errorMessages={{ ...errorMessages, MEMBERSHIP_CLOSED: closedMessage }}
        fallbackErrorMessage={failedMessage}
      >
        <input type="hidden" name="locale" value={locale} />
        {honorary ? <input type="hidden" name="soort" value="erelid" /> : null}
      </SaveForm>
    </Card>
  );
}
