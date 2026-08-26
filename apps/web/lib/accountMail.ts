import "server-only";

import { sendMail } from "@vtk/mail";
import type { Locale } from "@vtk/i18n";
import { siteBaseUrl } from "@/lib/calendar/feeds";

/**
 * De twee mails die bij een zelfgemaakt account horen: je adres bevestigen en je
 * wachtwoord opnieuw zetten.
 *
 * Bewust platte tekst met één link. Deze mails moeten door een spamfilter en op
 * een telefoon van 2011 leesbaar zijn; een opgemaakte mailtemplate koopt daar
 * niets voor, en elk beeld erin is een reden te meer om in de map "reclame" te
 * belanden.
 */

function link(path: string, token: string, locale: Locale): string {
  const base = `${siteBaseUrl()}${locale === "en" ? "/en" : ""}`;
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationMail(input: {
  to: string;
  name: string;
  token: string;
  locale: Locale;
}): Promise<boolean> {
  const url = link("/registreren/bevestigen", input.token, input.locale);
  const nl = input.locale === "nl";
  const firstName = input.name.split(" ")[0] || input.name;

  return sendMail({
    to: input.to,
    subject: nl ? "Bevestig je VTK-account" : "Confirm your VTK account",
    text: nl
      ? [
          `Dag ${firstName}`,
          "",
          "Je maakte een VTK-account aan met dit e-mailadres. Klik op de link hieronder om het te bevestigen; daarna kan je inloggen.",
          "",
          url,
          "",
          "De link blijft zeven dagen geldig. Maakte jij dit account niet aan, dan hoef je niets te doen: zonder bevestiging gebeurt er niets met dit adres.",
          "",
          "VTK",
        ].join("\n")
      : [
          `Hi ${firstName}`,
          "",
          "You created a VTK account with this email address. Use the link below to confirm it; after that you can sign in.",
          "",
          url,
          "",
          "The link stays valid for seven days. If you did not create this account, you do not have to do anything: without confirmation nothing happens with this address.",
          "",
          "VTK",
        ].join("\n"),
  });
}

export async function sendPasswordResetMail(input: {
  to: string;
  name: string;
  token: string;
  locale: Locale;
}): Promise<boolean> {
  const url = link("/wachtwoord-vergeten/nieuw", input.token, input.locale);
  const nl = input.locale === "nl";
  const firstName = input.name.split(" ")[0] || input.name;

  return sendMail({
    to: input.to,
    subject: nl ? "Nieuw wachtwoord voor je VTK-account" : "New password for your VTK account",
    text: nl
      ? [
          `Dag ${firstName}`,
          "",
          "Je vroeg een nieuw wachtwoord aan voor je VTK-account. Klik op de link hieronder om er een in te stellen.",
          "",
          url,
          "",
          "De link blijft één uur geldig en werkt maar één keer. Vroeg jij dit niet aan, dan verandert er niets: je huidige wachtwoord blijft gewoon werken.",
          "",
          "VTK",
        ].join("\n")
      : [
          `Hi ${firstName}`,
          "",
          "You asked for a new password for your VTK account. Use the link below to set one.",
          "",
          url,
          "",
          "The link stays valid for one hour and works only once. If you did not ask for this, nothing changes: your current password keeps working.",
          "",
          "VTK",
        ].join("\n"),
  });
}
