"use client";

import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";

export type UnsubscribeState = "confirm" | "done" | "invalid";

/**
 * Het paneel van /uitschrijven: eerst bevestigen, dan bevestigd, of een link
 * die niet klopt.
 *
 * Eerst een klik en niet meteen uitschrijven bij het openen: mailscanners van
 * de universiteit openen elke link in een mail, en dan zou iedereen uitgeschreven
 * zijn voor hij de mail las. Ook /admin/it/flows toont dit paneel, met een actie
 * die niets bewaart.
 */
export function UnsubscribePanel({
  locale,
  categoryLabel,
  state,
  token,
  action,
  accountHref,
}: {
  locale: Locale;
  categoryLabel: string;
  state: UnsubscribeState;
  token: string;
  action: SaveAction;
  accountHref: string;
}) {
  const nl = locale === "nl";
  const accountLink = (
    <Link href={accountHref} className="btn btn-ghost">
      {nl ? "Naar je account" : "Go to your account"}
    </Link>
  );

  return (
    <section className="rounded-[18px] border border-vtk-blue/15 bg-[var(--surface)] p-6 shadow-[inset_3px_0_0_var(--yellow)] sm:p-8">
      {state === "confirm" ? (
        <>
          <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
            {nl ? `Uitschrijven voor ${categoryLabel}?` : `Unsubscribe from ${categoryLabel}?`}
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--body)]">
            {nl
              ? `Je krijgt dan geen mails meer van de mailinglijst ${categoryLabel}. Dat geldt ook voor de herinnering de dag voor een evenement waarin je interesse aanduidde. Je andere mailinglijsten blijven zoals ze zijn.`
              : `You will no longer get emails from the ${categoryLabel} mailing list. That includes the reminder the day before an event you marked your interest in. Your other mailing lists stay as they are.`}
          </p>
          <SaveForm
            action={action}
            submitLabel={nl ? "Uitschrijven" : "Unsubscribe"}
            savingLabel={nl ? "Uitschrijven..." : "Unsubscribing..."}
            savedMessage={nl ? `Uitgeschreven voor ${categoryLabel}` : `Unsubscribed from ${categoryLabel}`}
            errorMessages={{
              INVALID_TOKEN: nl
                ? "Deze uitschrijflink klopt niet meer. Zet de lijst uit op je account."
                : "This unsubscribe link is no longer valid. Turn the list off in your account.",
            }}
            fallbackErrorMessage={nl ? "Uitschrijven lukte niet. Probeer het opnieuw." : "Unsubscribing failed. Try again."}
            footer={({ submitButton }) => (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {submitButton}
                {accountLink}
              </div>
            )}
          >
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="locale" value={locale} />
          </SaveForm>
        </>
      ) : state === "done" ? (
        <>
          <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
            {nl ? "Je bent uitgeschreven" : "You are unsubscribed"}
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--body)]">
            {nl
              ? `Je krijgt geen mails meer van de mailinglijst ${categoryLabel}. Van gedachten veranderd? Je zet de lijst weer aan op je account.`
              : `You will no longer get emails from the ${categoryLabel} mailing list. Changed your mind? Turn the list back on in your account.`}
          </p>
          <div className="mt-6">{accountLink}</div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
            {nl ? "Deze link werkt niet" : "This link does not work"}
          </h2>
          <p className="mt-3 leading-relaxed text-[var(--body)]">
            {nl
              ? "De uitschrijflink is onvolledig of klopt niet meer. Je mailinglijsten zet je ook zelf aan of uit op je account."
              : "The unsubscribe link is incomplete or no longer valid. You can also turn your mailing lists on or off yourself in your account."}
          </p>
          <div className="mt-6">{accountLink}</div>
        </>
      )}
    </section>
  );
}
