"use server";

import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { sendMail } from "@/lib/email";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  CONTACT_RATE_LIMIT,
  RateLimiter,
  clientKeyFromHeaders,
  contactMailBody,
  parseContactSubmission,
} from "@/lib/contactForm";

/**
 * Het contactformulier op `/contact`.
 *
 * Alles komt op één adres terecht: `info@vtk.be` verdeelt intern verder. Zie
 * `docs/design-decisions.md` waarom er geen routering per onderwerp is en geen
 * bevestigingsmail naar de verzender vertrekt.
 */

/** Waar elk bericht naartoe gaat. Eén bestemming, bewust. */
const CONTACT_TO = process.env.CONTACT_MAIL_TO?.trim() || "info@vtk.be";

/**
 * De afzender van de mail. Niet het adres van de bezoeker: dan zou onze
 * mailserver een domein spoofen dat hij niet mag ondertekenen, en SPF/DKIM
 * gooit dat bericht in de spam. De bezoeker zit in `replyTo`, zodat
 * "Beantwoorden" wél bij hem uitkomt.
 *
 * Bewust niet `MAIL_FROM`: die staat op de ticket-/Theokot-afzender, en een
 * contactvraag hoort niet als "VTK Tickets" in de inbox te landen.
 */
const CONTACT_FROM = process.env.MAIL_FROM_CONTACT?.trim() || "VTK website <info@vtk.be>";

/**
 * De teller staat in het geheugen van dit proces. Bij een herstart begint ze
 * opnieuw, en met meerdere containers telt elk zijn eigen deel; voor een drempel
 * tegen scripts volstaat dat, en het scheelt een tabel en een opkuistaak.
 */
const limiter = new RateLimiter(CONTACT_RATE_LIMIT.max, CONTACT_RATE_LIMIT.windowMs);

export async function sendContactMessageAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = parseContactSubmission({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    honeypot: formData.get("website"),
  });

  // De honeypot: doen alsof het gelukt is. Een bot die een foutmelding krijgt,
  // weet dat hij ontdekt is en past zijn volgende poging aan.
  if (parsed.status === "honeypot") return saveOk();
  if (parsed.status === "error") return saveError(parsed.code);

  const key = clientKeyFromHeaders(await headers());
  if (!limiter.take(key)) return saveError("RATE_LIMITED");

  const body = contactMailBody(parsed.message);
  const delivered = await sendMail(
    {
      to: CONTACT_TO,
      from: CONTACT_FROM,
      // Antwoorden gaat rechtstreeks naar de bezoeker; zonder dit kan niemand
      // reageren zonder het adres uit de tekst over te typen.
      replyTo: `${parsed.message.name} <${parsed.message.email}>`,
      subject: body.subject,
      text: body.text,
    },
    { source: "contact" },
  );

  if (!delivered) {
    // Enkel dat het misging, nooit wat er in het bericht stond: dat is de post
    // van een bezoeker en hoort niet in onze monitoring.
    Sentry.captureMessage("Contactformulier: mail versturen mislukt", "error");
    return saveError("MAIL_FAILED");
  }

  // Geen `revalidatePath` en geen `redirect`: het formulier verandert niets aan
  // wat de pagina toont, en een redirect naar de pagina waar je al staat is geen
  // feedback. De groene toast van `SaveForm` is de bevestiging.
  return saveOk();
}
