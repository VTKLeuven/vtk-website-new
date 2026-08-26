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

/**
 * Toegangslink die een beheerder voor een alumnus verstuurt. Dezelfde veilige
 * resetpagina, maar zonder te beweren dat de ontvanger de mail zelf aanvroeg.
 */
export async function sendAlumniPasswordSetupMail(input: {
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
    subject: nl ? "Blijf toegang houden tot je VTK-account" : "Keep access to your VTK account",
    text: nl
      ? [
          `Dag ${firstName}`,
          "",
          "Je VTK-account was gekoppeld aan je KU Leuven-login. Via de link hieronder kan je een wachtwoord instellen, zodat je ook na je afstuderen toegang houdt met je persoonlijke e-mailadres.",
          "",
          url,
          "",
          "De link blijft één uur geldig en werkt maar één keer. Verwachtte je deze mail niet, dan hoef je niets te doen.",
          "",
          "VTK",
        ].join("\n")
      : [
          `Hi ${firstName}`,
          "",
          "Your VTK account was linked to your KU Leuven sign-in. Use the link below to set a password, so you can keep access after graduating with your personal email address.",
          "",
          url,
          "",
          "The link stays valid for one hour and works only once. If you did not expect this email, you do not need to do anything.",
          "",
          "VTK",
        ].join("\n"),
  });
}
