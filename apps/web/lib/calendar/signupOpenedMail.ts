/**
 * De mail "de ticketverkoop of de inschrijvingen zijn open" aan wie interesse
 * aanduidde in een evenement.
 *
 * Wanneer ze vertrekt staat in `signupOpened.ts`; dit bestand maakt enkel het
 * bericht. Puur, zonder database en zonder mailserver, zodat de voorvertoning
 * in /admin/it/flows dezelfde mail toont als de verzender.
 *
 * Dezelfde kaart per evenement als de herinnering van de dag ervoor
 * (`interestEventCard`), maar met de ticket- of inschrijfknop vooraan: daar
 * gaat deze mail over. Wie in de voorverkoop zit, leest op de kaart wanneer de
 * verkoop voor iedereen opent.
 *
 * In de taal van het lid (`User.locale`): dit is post aan een lid, geen interne
 * melding.
 */

import {
  MAIL_COLOR as COLOR,
  MAIL_FONT as FONT,
  escapeHtml,
  mailButton,
  mailDocument,
  mailFooterRowHtml,
  mailHeaderRow,
  mailHeading,
} from "@/lib/mailDesign";
import { interestEventCard, timeRange, type InterestReminderMailEvent } from "./interestReminderMail";
import type { SignupOpeningKind } from "./signupOpened";

export type SignupOpenedMailEvent = InterestReminderMailEvent & {
  kind: SignupOpeningKind;
  /** Bij een voorverkoop: wanneer de verkoop voor iedereen opent. */
  presalePublicStart: Date | null;
  /** De knop naar de verkoop of de inschrijving; hier altijd ingevuld. */
  link: { label: string; url: string };
};

export type SignupOpenedMailInput = {
  locale: "nl" | "en";
  firstName: string | null;
  /** Minstens één. */
  events: SignupOpenedMailEvent[];
  /** De pagina met de uitschrijfknop voor de lijst Evenementen. */
  unsubscribeUrl: string;
  /** /account, waar je de lijst ook weer aanzet. */
  accountUrl: string;
  /** Volledig adres van het logo, bv. `https://vtk.be/vtk-logo.png`. */
  logoUrl: string;
  timeZone?: string;
};

export type SignupOpenedMail = { subject: string; text: string; html: string };

function copy(locale: "nl" | "en") {
  return locale === "en"
    ? {
        kicker: "VTK Calendar",
        subjectTickets: (title: string) => `Tickets for ${title} are on sale`,
        subjectPresale: (title: string) => `Your presale for ${title} has started`,
        subjectSignup: (title: string) => `Sign-ups for ${title} are open`,
        subjectMany: (title: string, more: number) =>
          `Now open: ${title} and ${more === 1 ? "1 more event" : `${more} more events`}`,
        headingMany: "Now open for your events",
        hello: (name: string | null) => (name ? `Hi ${name},` : "Hi,"),
        introTickets: "you marked that you are interested in this event, and ticket sales have just started.",
        introPresale: "you marked that you are interested in this event, and you can already buy tickets in the presale.",
        introSignup: "you marked that you are interested in this event, and sign-ups have just opened.",
        introMany: (count: number) =>
          `you marked that you are interested in ${count} events, and you can now buy tickets or sign up for them.`,
        presaleNote: (date: string) => `Presale: open to everyone from ${date}`,
        why: (count: number) =>
          `You get this email because you marked your interest in ${count === 1 ? "this event" : "these events"} and the Events mailing list is on in your account.`,
        unsubscribe: "Unsubscribe from Events",
        account: "Manage your mailing lists",
        unsubscribeText: "Unsubscribe from the Events mailing list",
      }
    : {
        kicker: "VTK Kalender",
        subjectTickets: (title: string) => `Tickets voor ${title} zijn te koop`,
        subjectPresale: (title: string) => `Je voorverkoop voor ${title} is begonnen`,
        subjectSignup: (title: string) => `Inschrijvingen voor ${title} zijn open`,
        subjectMany: (title: string, more: number) =>
          `Nu open: ${title} ${more === 1 ? "en nog 1 evenement" : `en nog ${more} evenementen`}`,
        headingMany: "Nu open voor je evenementen",
        hello: (name: string | null) => (name ? `Hey ${name},` : "Hey,"),
        introTickets: "je duidde aan dat je interesse hebt in dit evenement, en de ticketverkoop is net gestart.",
        introPresale: "je duidde aan dat je interesse hebt in dit evenement, en jij kan al tickets kopen in de voorverkoop.",
        introSignup: "je duidde aan dat je interesse hebt in dit evenement, en de inschrijvingen zijn net geopend.",
        introMany: (count: number) =>
          `je duidde interesse aan in ${count} evenementen, en daarvoor kan je nu tickets kopen of je inschrijven.`,
        presaleNote: (date: string) => `Voorverkoop: voor iedereen open vanaf ${date}`,
        why: (count: number) =>
          `Je krijgt deze mail omdat je interesse aanduidde in ${count === 1 ? "dit evenement" : "deze evenementen"} en de mailinglijst Evenementen aan staat in je account.`,
        unsubscribe: "Uitschrijven voor Evenementen",
        account: "Beheer je mailinglijsten",
        unsubscribeText: "Uitschrijven voor de mailinglijst Evenementen",
      };
}

function fullTitle(event: SignupOpenedMailEvent): string {
  return event.momentLabel ? `${event.title}: ${event.momentLabel}` : event.title;
}

/** "woensdag 19 november om 20:00". */
function when(date: Date, locale: "nl" | "en", timeZone: string): string {
  const tag = locale === "en" ? "en-GB" : "nl-BE";
  const day = new Intl.DateTimeFormat(tag, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date);
  const clock = new Intl.DateTimeFormat(tag, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    date,
  );
  return locale === "en" ? `${day} at ${clock}` : `${day} om ${clock}`;
}

function presaleNote(event: SignupOpenedMailEvent, locale: "nl" | "en", timeZone: string): string | null {
  if (!event.presalePublicStart) return null;
  return copy(locale).presaleNote(when(event.presalePublicStart, locale, timeZone));
}

export function signupOpenedMail(input: SignupOpenedMailInput): SignupOpenedMail {
  const timeZone = input.timeZone ?? "Europe/Brussels";
  const t = copy(input.locale);
  const events = input.events;
  const first = events[0]!;
  const firstTitle = fullTitle(first);

  const single =
    first.kind === "tickets"
      ? first.presalePublicStart
        ? { subject: t.subjectPresale(firstTitle), intro: t.introPresale }
        : { subject: t.subjectTickets(firstTitle), intro: t.introTickets }
      : { subject: t.subjectSignup(firstTitle), intro: t.introSignup };
  const subject = events.length === 1 ? single.subject : t.subjectMany(firstTitle, events.length - 1);
  const intro = `${t.hello(input.firstName)} ${events.length === 1 ? single.intro : t.introMany(events.length)}`;

  const textLines = [
    intro,
    "",
    ...events.flatMap((event) => {
      const note = presaleNote(event, input.locale, timeZone);
      return [
        fullTitle(event),
        [timeRange(event, input.locale, timeZone), event.location?.trim()].filter(Boolean).join(", "),
        `${event.link.label}: ${event.link.url}`,
        ...(note ? [note] : []),
        event.eventUrl,
        "",
      ];
    }),
    t.why(events.length),
    `${t.unsubscribeText}: ${input.unsubscribeUrl}`,
  ];

  const footer = `${escapeHtml(t.why(events.length))}<div style="margin-top:12px">${mailButton(
    input.unsubscribeUrl,
    t.unsubscribe,
    "secondary",
  )} <a href="${escapeHtml(input.accountUrl)}" style="margin-left:6px;font-family:${FONT};font-size:12.5px;color:${COLOR.muted};text-decoration:underline">${escapeHtml(
    t.account,
  )}</a></div>`;

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ logoUrl: input.logoUrl, kicker: t.kicker })}<tr><td style="padding:28px 30px 30px">${mailHeading(
      events.length === 1 ? single.subject : t.headingMany,
    )}<p style="margin:18px 0 0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(
      intro,
    )}</p>${events
      .map((event) =>
        interestEventCard(event, input.locale, timeZone, {
          linkFirst: true,
          note: presaleNote(event, input.locale, timeZone),
        }),
      )
      .join("")}</td></tr>${mailFooterRowHtml(footer)}`,
  });

  return { subject, text: textLines.join("\n"), html };
}
