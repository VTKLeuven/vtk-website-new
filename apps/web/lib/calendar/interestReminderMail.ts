/**
 * De herinnering de dag voor een evenement waarin je interesse aanduidde.
 *
 * Wanneer ze vertrekt staat in `interestReminder.ts`; dit bestand maakt enkel
 * het bericht. Puur, zonder database en zonder mailserver, zodat de
 * voorvertoning in /admin/it/flows dezelfde mail toont als de verzender.
 *
 * Eén mail per lid per dag, met elk evenement van morgen als kaart: de banner
 * bovenaan, daaronder het navy datumblok met wat, wanneer en waar, en de
 * knoppen naar de eventpagina en de tickets of inschrijving. Onderaan staat
 * waarom je dit krijgt en de knop om de lijst Evenementen uit te zetten.
 *
 * In de taal van het lid (`User.locale`): dit is post aan een lid, geen interne
 * melding.
 */

import {
  MAIL_COLOR as COLOR,
  MAIL_FONT as FONT,
  escapeHtml,
  mailButton,
  mailDateStub,
  mailDocument,
  mailFooterRowHtml,
  mailHeaderRow,
  mailHeading,
} from "@/lib/mailDesign";

export type InterestReminderMailEvent = {
  title: string;
  /** Het begin en einde van het moment, of van het evenement zelf. */
  start: Date;
  end: Date;
  allDay: boolean;
  /** De eigen naam van één moment in een reeks ("Nachtloop"), of `null`. */
  momentLabel: string | null;
  location: string | null;
  organiser: string;
  /** Volledige URL van de eigen banner; `null` = geen foto in de mail. */
  imageUrl: string | null;
  /** Volledige URL van de eventpagina. */
  eventUrl: string;
  /** De ticket- of inschrijflink, als volledige URL. */
  link: { label: string; url: string } | null;
};

export type InterestReminderMailInput = {
  locale: "nl" | "en";
  firstName: string | null;
  /** Minstens één; in de volgorde waarin ze morgen beginnen. */
  events: InterestReminderMailEvent[];
  /** De pagina met de uitschrijfknop voor de lijst Evenementen. */
  unsubscribeUrl: string;
  /** /account, waar je de lijst ook weer aanzet. */
  accountUrl: string;
  /** Volledig adres van het logo, bv. `https://vtk.be/vtk-logo.png`. */
  logoUrl: string;
  timeZone?: string;
};

export type InterestReminderMail = { subject: string; text: string; html: string };

/** Korter dan dit is "tot 03:00" en geen volledige einddatum: één avond. */
const SAME_NIGHT_MS = 20 * 60 * 60 * 1000;

function copy(locale: "nl" | "en") {
  return locale === "en"
    ? {
        kicker: "VTK Calendar",
        tomorrow: "Tomorrow",
        headingMany: "Tomorrow on your calendar",
        hello: (name: string | null) => (name ? `Hi ${name},` : "Hi,"),
        introOne: "you marked that you are interested in this event, and it is tomorrow.",
        introMany: (count: number) => `you marked that you are interested in ${count} events, and they are tomorrow.`,
        more: (count: number) => (count === 1 ? "and 1 more event" : `and ${count} more events`),
        allDay: "All day",
        until: "until",
        view: "View the event",
        why: (count: number) =>
          `You get this email because you marked your interest in ${count === 1 ? "this event" : "these events"} and the Events mailing list is on in your account.`,
        unsubscribe: "Unsubscribe from Events",
        account: "Manage your mailing lists",
        unsubscribeText: "Unsubscribe from the Events mailing list",
      }
    : {
        kicker: "VTK Kalender",
        tomorrow: "Morgen",
        headingMany: "Morgen op je kalender",
        hello: (name: string | null) => (name ? `Hey ${name},` : "Hey,"),
        introOne: "je duidde aan dat je interesse hebt in dit evenement, en het is morgen al zover.",
        introMany: (count: number) => `je duidde interesse aan in ${count} evenementen, en die zijn morgen al.`,
        more: (count: number) => (count === 1 ? "en nog 1 evenement" : `en nog ${count} evenementen`),
        allDay: "Hele dag",
        until: "tot",
        view: "Bekijk het evenement",
        why: (count: number) =>
          `Je krijgt deze mail omdat je interesse aanduidde in ${count === 1 ? "dit evenement" : "deze evenementen"} en de mailinglijst Evenementen aan staat in je account.`,
        unsubscribe: "Uitschrijven voor Evenementen",
        account: "Beheer je mailinglijsten",
        unsubscribeText: "Uitschrijven voor de mailinglijst Evenementen",
      };
}

/** "20:00 tot 03:00", "Hele dag", of een einde op een andere dag voluit. */
function timeRange(event: InterestReminderMailEvent, locale: "nl" | "en", timeZone: string): string {
  const t = copy(locale);
  if (event.allDay) return t.allDay;
  const tag = locale === "en" ? "en-GB" : "nl-BE";
  const clock = new Intl.DateTimeFormat(tag, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const start = clock.format(event.start);
  if (event.end.getTime() - event.start.getTime() <= SAME_NIGHT_MS) {
    return `${start} ${t.until} ${clock.format(event.end)}`;
  }
  const end = new Intl.DateTimeFormat(tag, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(event.end);
  return `${start} ${t.until} ${end}`;
}

function eventCard(event: InterestReminderMailEvent, locale: "nl" | "en", timeZone: string): string {
  const t = copy(locale);
  const title = event.momentLabel ? `${event.title}: ${event.momentLabel}` : event.title;
  const facts = [timeRange(event, locale, timeZone), event.location?.trim()].filter(Boolean) as string[];
  const banner = event.imageUrl
    ? `<tr><td colspan="2" style="padding:0;font-size:0;line-height:0"><a href="${escapeHtml(event.eventUrl)}"><img src="${escapeHtml(event.imageUrl)}" width="600" alt="${escapeHtml(title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>`
    : "";
  const buttons = [
    mailButton(event.eventUrl, t.view),
    ...(event.link ? [mailButton(event.link.url, event.link.label, "secondary")] : []),
  ].join(" ");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:20px 0 0;border:1px solid ${COLOR.line};border-radius:18px;overflow:hidden">${banner}<tr>${mailDateStub(
    { date: event.start, timeZone, locale },
  )}<td valign="middle" style="padding:18px 20px;font-family:${FONT}"><div style="font-size:12px;font-weight:600;color:${COLOR.muted}">${escapeHtml(
    event.organiser,
  )}</div><div style="margin:6px 0 4px;font-size:19px;font-weight:650;letter-spacing:-.02em;color:${COLOR.ink}">${escapeHtml(
    title,
  )}</div><div style="font-size:13px;line-height:1.5;color:${COLOR.muted}">${facts
    .map((fact) => escapeHtml(fact))
    .join("<br>")}</div></td></tr><tr><td colspan="2" style="padding:0 20px 18px;border-top:1px solid ${COLOR.line}"><div style="margin-top:16px">${buttons}</div></td></tr></table>`;
}

export function interestReminderMail(input: InterestReminderMailInput): InterestReminderMail {
  const timeZone = input.timeZone ?? "Europe/Brussels";
  const t = copy(input.locale);
  const events = input.events;
  const first = events[0]!;
  const firstTitle = first.momentLabel ? `${first.title}: ${first.momentLabel}` : first.title;
  const subject =
    events.length === 1
      ? `${t.tomorrow}: ${firstTitle}`
      : `${t.tomorrow}: ${firstTitle} ${t.more(events.length - 1)}`;
  const intro = `${t.hello(input.firstName)} ${events.length === 1 ? t.introOne : t.introMany(events.length)}`;

  const textLines = [
    intro,
    "",
    ...events.flatMap((event) => [
      event.momentLabel ? `${event.title}: ${event.momentLabel}` : event.title,
      [timeRange(event, input.locale, timeZone), event.location?.trim()].filter(Boolean).join(", "),
      `${t.view}: ${event.eventUrl}`,
      ...(event.link ? [`${event.link.label}: ${event.link.url}`] : []),
      "",
    ]),
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
      events.length === 1 ? `${t.tomorrow}: ${firstTitle}` : t.headingMany,
    )}<p style="margin:18px 0 0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(
      intro,
    )}</p>${events.map((event) => eventCard(event, input.locale, timeZone)).join("")}</td></tr>${mailFooterRowHtml(footer)}`,
  });

  return { subject, text: textLines.join("\n"), html };
}
