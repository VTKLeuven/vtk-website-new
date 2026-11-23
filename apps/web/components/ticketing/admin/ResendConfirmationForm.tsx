"use client";

import { resendTicketOrderConfirmationAction } from "@/app/actions/tickets";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AdminLocale } from "./format";

/**
 * "Bevestiging opnieuw versturen" in het detail van een bestelling. Meldt wat
 * er gebeurde, ook wanneer er niets vertrekt: een kale knop zonder melding liet
 * een beheerder 132 keer klikken (zie `queueConfirmationResend`).
 */
export function ResendConfirmationForm({
  eventId,
  orderId,
  buyerEmail,
  locale,
}: {
  eventId: string;
  orderId: string;
  buyerEmail: string;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={resendTicketOrderConfirmationAction}
      disableAutoTranslate
      submitLabel={nl ? "Bevestiging opnieuw versturen" : "Resend confirmation"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={nl ? "In de rij zetten..." : "Queueing..."}
      savedMessage={
        nl
          ? `De bevestiging vertrekt binnen een minuut naar ${buyerEmail}.`
          : `The confirmation goes out to ${buyerEmail} within a minute.`
      }
      fallbackErrorMessage={nl ? "Bevestiging niet opnieuw verstuurd." : "Confirmation was not resent."}
      errorMessages={
        nl
          ? {
              CONFIRMATION_ALREADY_QUEUED:
                "Niets extra verstuurd: de bevestiging staat al in de rij en vertrekt zo. Nog eens klikken stuurt de koper dezelfde mail twee keer.",
              CONFIRMATION_RECENTLY_SENT:
                "Niets extra verstuurd: de bevestiging vertrok minder dan twee minuten geleden. Laat de koper eerst in de spam kijken.",
              ORDER_NOT_DELIVERABLE: "Niets verstuurd: deze bestelling is niet betaald.",
            }
          : {
              CONFIRMATION_ALREADY_QUEUED:
                "Nothing extra sent: the confirmation is already queued and goes out shortly. Clicking again sends the buyer the same email twice.",
              CONFIRMATION_RECENTLY_SENT:
                "Nothing extra sent: the confirmation went out less than two minutes ago. Ask the buyer to check their spam folder first.",
              ORDER_NOT_DELIVERABLE: "Nothing sent: this order has not been paid.",
            }
      }
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="orderId" value={orderId} />
    </SaveForm>
  );
}
