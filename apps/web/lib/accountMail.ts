import "server-only";

import { sendMail } from "@/lib/email";
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

import {
  mailButton,
  mailContentRow,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailNoticeBox,
  mailParagraph,
} from "@/lib/mailDesign";

/** De opbouw van de drie berichten, los van het versturen: zo toont de
 *  voorvertoning in /admin/it/flows dezelfde mail als de ontvanger krijgt. */
export type AccountMail = { subject: string; text: string; html: string };

type AccountMailInput = { name: string; url: string; locale: Locale };

function firstNameOf(name: string): string {
  return name.split(" ")[0] || name;
}

export function accountVerificationMail(input: AccountMailInput): AccountMail {
  const nl = input.locale === "nl";
  const firstName = firstNameOf(input.name);
  const subject = nl ? "Bevestig je VTK-account" : "Confirm your VTK account";
  const text = nl
    ? [
        `Dag ${firstName}`,
        "",
        "Je maakte een VTK-account aan met dit e-mailadres. Klik op de link hieronder om het te bevestigen; daarna kan je inloggen.",
        "",
        input.url,
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
        input.url,
        "",
        "The link stays valid for seven days. If you did not create this account, you do not have to do anything: without confirmation nothing happens with this address.",
        "",
        "VTK",
      ].join("\n");

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Account" })}${mailContentRow(
      `${mailHeading(nl ? "Bevestig je account" : "Confirm your account")}${mailParagraph(
        nl ? `Dag ${firstName},` : `Hi ${firstName},`,
      )}${mailParagraph(
        nl
          ? "Je maakte een VTK-account aan met dit e-mailadres. Klik op de knop hieronder om je account te bevestigen; daarna kan je inloggen."
          : "You created a VTK account with this email address. Click the button below to confirm your account; after that you can sign in.",
      )}<div style="margin:24px 0 20px">${mailButton(
        input.url,
        nl ? "Bevestig je account" : "Confirm your account",
      )}</div>${mailNoticeBox(
        nl
          ? "De link blijft zeven dagen geldig. Maakte jij dit account niet aan, dan hoef je niets te doen: zonder bevestiging gebeurt er niets met dit adres."
          : "The link stays valid for seven days. If you did not create this account, you do not have to do anything: without confirmation nothing happens with this address.",
        nl ? "Geldigheid" : "Validity",
      )}`,
    )}${mailFooterRow(
      nl
        ? "Automatisch verzonden door VTK · Vlaamse Technische Kring"
        : "Automatically sent by VTK · Vlaamse Technische Kring",
    )}`,
  });

  return { subject, text, html };
}

export function passwordResetMail(input: AccountMailInput): AccountMail {
  const nl = input.locale === "nl";
  const firstName = firstNameOf(input.name);
  const subject = nl
    ? "Nieuw wachtwoord voor je VTK-account"
    : "New password for your VTK account";
  const text = nl
    ? [
        `Dag ${firstName}`,
        "",
        "Je vroeg een nieuw wachtwoord aan voor je VTK-account. Klik op de link hieronder om er een in te stellen.",
        "",
        input.url,
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
        input.url,
        "",
        "The link stays valid for one hour and works only once. If you did not ask for this, nothing changes: your current password keeps working.",
        "",
        "VTK",
      ].join("\n");

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Account" })}${mailContentRow(
      `${mailHeading(nl ? "Nieuw wachtwoord instellen" : "Set a new password")}${mailParagraph(
        nl ? `Dag ${firstName},` : `Hi ${firstName},`,
      )}${mailParagraph(
        nl
          ? "Je vroeg een nieuw wachtwoord aan voor je VTK-account. Klik op de knop hieronder om een nieuw wachtwoord in te stellen."
          : "You asked for a new password for your VTK account. Click the button below to set a new password.",
      )}<div style="margin:24px 0 20px">${mailButton(
        input.url,
        nl ? "Stel nieuw wachtwoord in" : "Set new password",
      )}</div>${mailNoticeBox(
        nl
          ? "De link blijft één uur geldig en werkt maar één keer. Vroeg jij dit niet aan, dan verandert er niets: je huidige wachtwoord blijft gewoon werken."
          : "The link stays valid for one hour and works only once. If you did not ask for this, nothing changes: your current password keeps working.",
        nl ? "Beveiliging" : "Security",
      )}`,
    )}${mailFooterRow(
      nl
        ? "Automatisch verzonden door VTK · Vlaamse Technische Kring"
        : "Automatically sent by VTK · Vlaamse Technische Kring",
    )}`,
  });

  return { subject, text, html };
}

export function managedPasswordSetupMail(input: AccountMailInput): AccountMail {
  const nl = input.locale === "nl";
  const firstName = firstNameOf(input.name);
  const subject = nl
    ? "Blijf toegang houden tot je VTK-account"
    : "Keep access to your VTK account";
  const text = nl
    ? [
        `Dag ${firstName}`,
        "",
        "Je VTK-account was gekoppeld aan je KU Leuven-login. Via de link hieronder kan je een wachtwoord instellen, zodat je ook na je afstuderen toegang houdt met je persoonlijke e-mailadres.",
        "",
        input.url,
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
        input.url,
        "",
        "The link stays valid for one hour and works only once. If you did not expect this email, you do not need to do anything.",
        "",
        "VTK",
      ].join("\n");

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Account" })}${mailContentRow(
      `${mailHeading(nl ? "Toegang voor alumni" : "Keep your access")}${mailParagraph(
        nl ? `Dag ${firstName},` : `Hi ${firstName},`,
      )}${mailParagraph(
        nl
          ? "Je VTK-account was gekoppeld aan je KU Leuven-login. Via de knop hieronder kan je een wachtwoord instellen, zodat je ook na je afstuderen toegang houdt met je persoonlijke e-mailadres."
          : "Your VTK account was linked to your KU Leuven sign-in. Use the button below to set a password, so you can keep access after graduating with your personal email address.",
      )}<div style="margin:24px 0 20px">${mailButton(
        input.url,
        nl ? "Stel een wachtwoord in" : "Set a password",
      )}</div>${mailNoticeBox(
        nl
          ? "De link blijft één uur geldig en werkt maar één keer. Verwachtte je deze mail niet, dan hoef je niets te doen."
          : "The link stays valid for one hour and works only once. If you did not expect this email, you do not need to do anything.",
        nl ? "Alumni" : "Alumni",
      )}`,
    )}${mailFooterRow(
      nl
        ? "Verstuurd door het beheer van VTK · Vlaamse Technische Kring"
        : "Sent by VTK administration · Vlaamse Technische Kring",
    )}`,
  });

  return { subject, text, html };
}

export async function sendVerificationMail(input: {
  to: string;
  name: string;
  token: string;
  locale: Locale;
}): Promise<boolean> {
  const url = link("/registreren/bevestigen", input.token, input.locale);
  return sendMail({ to: input.to, ...accountVerificationMail({ ...input, url }) }, { source: "account" });
}

export async function sendPasswordResetMail(input: {
  to: string;
  name: string;
  token: string;
  locale: Locale;
}): Promise<boolean> {
  const url = link("/wachtwoord-vergeten/nieuw", input.token, input.locale);
  return sendMail({ to: input.to, ...passwordResetMail({ ...input, url }) }, { source: "account" });
}

/**
 * Toegangslink die een beheerder voor een alumnus verstuurt. Dezelfde veilige
 * resetpagina, maar zonder te beweren dat de ontvanger de mail zelf aanvroeg.
 */
export async function sendManagedPasswordSetupMail(input: {
  to: string;
  name: string;
  token: string;
  locale: Locale;
}): Promise<boolean> {
  const url = link("/wachtwoord-vergeten/nieuw", input.token, input.locale);
  return sendMail(
    { to: input.to, ...managedPasswordSetupMail({ ...input, url }) },
    { source: "account" },
  );
}
