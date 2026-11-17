/**
 * De weekmail van de kalender: zaterdagavond wat er de week die komt bij VTK te
 * doen is, aan wie de mailinglijst Evenementen aan heeft.
 *
 * Wanneer ze vertrekt en wat erin komt staat in `weekOverview.ts`; dit bestand
 * maakt enkel het bericht. Puur, zonder database en zonder mailserver, zodat de
 * voorvertoning in /admin/it/flows dezelfde mail toont als de verzender.
 *
 * Eén evenement staat bovenaan met zijn affiche over de hele breedte, een korte
 * tekst, wanneer en waar, en de ticket- of inschrijfknop. Daaronder "Verder deze
 * week" als lijst met een kleine foto per evenement, dan "Niet vergeten" (een
 * ticketverkoop die opent, een inschrijving die sluit) en de knop naar de
 * kalender. Onderaan waarom je dit krijgt en de knop om de lijst uit te zetten.
 *
 * In de taal van het lid (`User.locale`): dit is post aan een lid, geen interne
 * melding.
 */

import { timeRange } from "@/lib/calendar/interestReminderMail";
import {
  MAIL_COLOR as COLOR,
  MAIL_FONT as FONT,
  escapeHtml,
  mailButton,
  mailDocument,
  mailFooterRowHtml,
  mailHeaderRow,
  mailHeading,
  mailInfoTable,
} from "@/lib/mailDesign";

export type WeekOverviewMailEvent = {
  title: string;
  /** Het begin en einde van deze keer: het eerste moment in de week, of het evenement zelf. */
  start: Date;
  end: Date;
  allDay: boolean;
  /** De eigen naam van dat moment ("Nachtloop"), of `null`. */
  momentLabel: string | null;
  location: string | null;
  organiser: string;
  /** Volledige URL van de affiche; `null` = geen foto in de mail. */
  imageUrl: string | null;
  /** Volledige URL van de eventpagina. */
  eventUrl: string;
  /** De ticket- of inschrijflink, als volledige URL. */
  link: { label: string; url: string } | null;
  /** Hoeveel keer het deze week nog doorgaat na deze keer (momenten). */
  moreThisWeek: number;
  /** Platte tekst onder de titel; enkel gebruikt voor het uitgelichte evenement. */
  excerpt: string | null;
};

export type WeekOverviewMailReminder = {
  kind: "ticketSale" | "formCloses";
  at: Date;
  title: string;
  url: string;
};

export type WeekOverviewMailInput = {
  locale: "nl" | "en";
  /** De maandag waarop de week begint. */
  weekStart: Date;
  featured: WeekOverviewMailEvent;
  /** De rest van de week, in de volgorde waarin ze beginnen. */
  others: WeekOverviewMailEvent[];
  reminders: WeekOverviewMailReminder[];
  /** /kalender, als volledige URL. */
  calendarUrl: string;
  /** De pagina met de uitschrijfknop voor de lijst Evenementen. */
  unsubscribeUrl: string;
  /** /account, waar je de lijst ook weer aanzet. */
  accountUrl: string;
  /** Volledig adres van het logo, bv. `https://vtk.be/vtk-logo.png`. */
  logoUrl: string;
  timeZone?: string;
};

export type WeekOverviewMail = { subject: string; text: string; html: string };

function copy(locale: "nl" | "en") {
  return locale === "en"
    ? {
        kicker: (week: string) => `Week of ${week}`,
        featuredOn: (day: string) => `Featured on ${day}`,
        more: (count: number) => (count === 1 ? "and 1 more event this week" : `and ${count} more events this week`),
        alsoThisWeek: "Also this week",
        and: "and",
        andMore: "and more",
        restHeading: "More this week",
        when: "When",
        where: "Where",
        organiser: "Organiser",
        allDay: (day: string) => `${day}, all day`,
        again: (count: number) => (count === 1 ? "Once more this week" : `${count} more times this week`),
        view: "View the event",
        moreInfo: "More info",
        reminders: "Don't forget",
        ticketSale: (title: string) => `Ticket sale opens: ${title}`,
        formCloses: (title: string) => `Sign-ups close: ${title}`,
        calendar: "View the calendar",
        why: "You get this email because the Events mailing list is on in your account. It goes out every Saturday evening, unless there is nothing on the calendar the week after.",
        unsubscribe: "Unsubscribe from Events",
        account: "Manage your mailing lists",
        unsubscribeText: "Unsubscribe from the Events mailing list",
      }
    : {
        kicker: (week: string) => `Week van ${week}`,
        featuredOn: (day: string) => `Uitgelicht op ${day}`,
        more: (count: number) => (count === 1 ? "en nog 1 activiteit deze week" : `en nog ${count} activiteiten deze week`),
        alsoThisWeek: "Ook deze week",
        and: "en",
        andMore: "en meer",
        restHeading: "Verder deze week",
        when: "Wanneer",
        where: "Waar",
        organiser: "Organisatie",
        allDay: (day: string) => `${day}, de hele dag`,
        again: (count: number) => (count === 1 ? "Nog 1 keer deze week" : `Nog ${count} keer deze week`),
        view: "Bekijk het evenement",
        moreInfo: "Meer info",
        reminders: "Niet vergeten",
        ticketSale: (title: string) => `Ticketverkoop opent: ${title}`,
        formCloses: (title: string) => `Inschrijvingen sluiten: ${title}`,
        calendar: "Bekijk de kalender",
        why: "Je krijgt deze mail omdat de mailinglijst Evenementen aan staat in je account. Ze vertrekt elke zaterdagavond, behalve wanneer er de week erna niets op de kalender staat.",
        unsubscribe: "Uitschrijven voor Evenementen",
        account: "Beheer je mailinglijsten",
        unsubscribeText: "Uitschrijven voor de mailinglijst Evenementen",
      };
}

function tag(locale: "nl" | "en"): string {
  return locale === "en" ? "en-GB" : "nl-BE";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "donderdag 26 november" */
function longDay(date: Date, locale: "nl" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** "donderdag" */
function weekday(date: Date, locale: "nl" | "en", timeZone: string): string {
  return new Intl.DateTimeFormat(tag(locale), { timeZone, weekday: "long" }).format(date);
}

/** "wo 25 nov, 12:00" */
function shortMoment(date: Date, locale: "nl" | "en", timeZone: string): string {
  const day = new Intl.DateTimeFormat(tag(locale), { timeZone, weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(/\./g, "");
  const clock = new Intl.DateTimeFormat(tag(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${capitalize(day)}, ${clock}`;
}

function fullTitle(event: WeekOverviewMailEvent): string {
  return event.momentLabel ? `${event.title}: ${event.momentLabel}` : event.title;
}

/** "Donderdag 26 november, 22:00 tot 04:00" */
function when(event: WeekOverviewMailEvent, locale: "nl" | "en", timeZone: string): string {
  const day = capitalize(longDay(event.start, locale, timeZone));
  return event.allDay ? copy(locale).allDay(day) : `${day}, ${timeRange(event, locale, timeZone)}`;
}

/** "Career Talk, VTK Cantus en Quiz" of met "en meer" erachter. */
function titleList(titles: string[], locale: "nl" | "en"): string {
  const t = copy(locale);
  const shown = titles.slice(0, 3);
  if (titles.length > 3) return `${shown.join(", ")} ${t.andMore}`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} ${t.and} ${shown[shown.length - 1]}`;
}

function smallCaps(text: string): string {
  return `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.muted}">${escapeHtml(text)}</div>`;
}

function featuredBlock(event: WeekOverviewMailEvent, locale: "nl" | "en", timeZone: string): string {
  const t = copy(locale);
  const title = fullTitle(event);
  const facts = [
    {
      label: t.when,
      value: [when(event, locale, timeZone), event.moreThisWeek > 0 ? t.again(event.moreThisWeek) : ""]
        .filter(Boolean)
        .join("\n"),
    },
    { label: t.where, value: event.location?.trim() ?? "" },
    { label: t.organiser, value: event.organiser },
  ];
  const buttons = event.link
    ? `${mailButton(event.link.url, event.link.label)} ${mailButton(event.eventUrl, t.moreInfo, "secondary")}`
    : mailButton(event.eventUrl, t.view);
  return `${smallCaps(t.featuredOn(longDay(event.start, locale, timeZone)))}<div style="height:10px;font-size:0;line-height:0">&nbsp;</div>${mailHeading(
    title,
    26,
  )}${
    event.excerpt
      ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(event.excerpt)}</p>`
      : ""
  }${mailInfoTable(facts)}<div>${buttons}</div>`;
}

function thumb(event: WeekOverviewMailEvent): string {
  const inner = event.imageUrl
    ? `<a href="${escapeHtml(event.eventUrl)}"><img src="${escapeHtml(event.imageUrl)}" width="128" alt="" style="display:block;width:128px;height:auto;border:0;border-radius:10px"></a>`
    : `<div style="width:128px;height:72px;border-radius:10px;background:${COLOR.paper2};font-size:0;line-height:0">&nbsp;</div>`;
  return inner;
}

function listRow(event: WeekOverviewMailEvent, index: number, locale: "nl" | "en", timeZone: string): string {
  const t = copy(locale);
  const border = index > 0 ? `border-top:1px solid ${COLOR.line};` : "";
  const time = event.allDay ? t.allDay(capitalize(weekday(event.start, locale, timeZone))) : timeRange(event, locale, timeZone);
  const lines = [
    `<div style="margin-top:6px;font-family:${FONT};font-size:13.5px;line-height:1.45;font-weight:600;color:${COLOR.ink}">${escapeHtml(time)}</div>`,
    event.location?.trim()
      ? `<div style="font-family:${FONT};font-size:13.5px;line-height:1.45;color:${COLOR.muted}">${escapeHtml(event.location.trim())}</div>`
      : "",
    event.moreThisWeek > 0
      ? `<div style="font-family:${FONT};font-size:13px;line-height:1.45;color:${COLOR.muted}">${escapeHtml(t.again(event.moreThisWeek))}</div>`
      : "",
  ].join("");
  return `<tr><td valign="top" width="128" style="width:128px;padding:16px 0;${border}">${thumb(event)}</td><td valign="top" style="padding:14px 0 16px 16px;${border}">${smallCaps(
    longDay(event.start, locale, timeZone),
  )}<div style="padding-top:3px"><a href="${escapeHtml(event.eventUrl)}" style="font-family:${FONT};font-size:16px;font-weight:650;line-height:1.3;color:${COLOR.ink};text-decoration:none">${escapeHtml(
    fullTitle(event),
  )}</a></div>${lines}</td></tr>`;
}

function remindersBlock(reminders: WeekOverviewMailReminder[], locale: "nl" | "en", timeZone: string): string {
  if (reminders.length === 0) return "";
  const t = copy(locale);
  const rows = reminders
    .map((reminder, index) => {
      const border = index > 0 ? `border-top:1px solid ${COLOR.line};` : "";
      const label = reminder.kind === "ticketSale" ? t.ticketSale(reminder.title) : t.formCloses(reminder.title);
      return `<tr><td valign="top" style="padding:8px 14px 8px 0;${border}font-family:${FONT};font-size:13.5px;font-weight:700;color:${COLOR.ink};white-space:nowrap;width:132px">${escapeHtml(
        shortMoment(reminder.at, locale, timeZone),
      )}</td><td valign="top" style="padding:8px 0;${border}font-family:${FONT};font-size:14px;line-height:1.5"><a href="${escapeHtml(
        reminder.url,
      )}" style="color:${COLOR.ink};text-decoration:underline">${escapeHtml(label)}</a></td></tr>`;
    })
    .join("");
  return `<div style="margin:24px 0 0;padding:14px 18px 8px;border:1px solid ${COLOR.line};border-left:4px solid ${COLOR.yellow};background:${COLOR.surface};border-radius:0 12px 12px 0;font-family:${FONT}"><div style="font-size:13px;font-weight:700;color:${COLOR.ink};margin-bottom:4px">${escapeHtml(
    t.reminders,
  )}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">${rows}</table></div>`;
}

export function weekOverviewSubject(input: Pick<WeekOverviewMailInput, "locale" | "featured" | "others" | "timeZone">): string {
  const timeZone = input.timeZone ?? "Europe/Brussels";
  const t = copy(input.locale);
  const head = `${capitalize(weekday(input.featured.start, input.locale, timeZone))}: ${fullTitle(input.featured)}`;
  return input.others.length > 0 ? `${head}, ${t.more(input.others.length)}` : head;
}

export function weekOverviewMail(input: WeekOverviewMailInput): WeekOverviewMail {
  const timeZone = input.timeZone ?? "Europe/Brussels";
  const t = copy(input.locale);
  const { featured, others } = input;
  const subject = weekOverviewSubject(input);
  const weekLabel = new Intl.DateTimeFormat(tag(input.locale), { timeZone, day: "numeric", month: "long" }).format(
    input.weekStart,
  );
  const preheader =
    others.length > 0
      ? `${t.alsoThisWeek}: ${titleList(others.map(fullTitle), input.locale)}.`
      : when(featured, input.locale, timeZone);

  const banner = featured.imageUrl
    ? `<tr><td style="padding:0;font-size:0;line-height:0"><a href="${escapeHtml(featured.eventUrl)}"><img src="${escapeHtml(
        featured.imageUrl,
      )}" width="600" alt="${escapeHtml(fullTitle(featured))}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>`
    : "";

  const rest =
    others.length > 0
      ? `<tr><td style="padding:0 30px"><div style="height:1px;background:${COLOR.line};font-size:0;line-height:0">&nbsp;</div></td></tr><tr><td style="padding:26px 30px 0">${mailHeading(
          t.restHeading,
          20,
          2,
        )}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:10px">${others
          .map((event, index) => listRow(event, index, input.locale, timeZone))
          .join("")}</table></td></tr>`
      : "";

  const closing = `<tr><td style="padding:${others.length > 0 ? "4px" : "0"} 30px 30px">${remindersBlock(
    input.reminders,
    input.locale,
    timeZone,
  )}<div style="margin-top:24px">${mailButton(input.calendarUrl, t.calendar, "secondary")}</div></td></tr>`;

  const footer = `${escapeHtml(t.why)}<div style="margin-top:12px">${mailButton(
    input.unsubscribeUrl,
    t.unsubscribe,
    "secondary",
  )} <a href="${escapeHtml(input.accountUrl)}" style="margin-left:6px;font-family:${FONT};font-size:12.5px;color:${COLOR.muted};text-decoration:underline">${escapeHtml(
    t.account,
  )}</a></div>`;

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    preheader,
    rows: `${mailHeaderRow({ logoUrl: input.logoUrl, kicker: t.kicker(weekLabel) })}${banner}<tr><td style="padding:26px 30px 28px">${featuredBlock(
      featured,
      input.locale,
      timeZone,
    )}</td></tr>${rest}${closing}${mailFooterRowHtml(footer)}`,
  });

  const eventText = (event: WeekOverviewMailEvent) => [
    fullTitle(event),
    [when(event, input.locale, timeZone), event.location?.trim()].filter(Boolean).join(", "),
    ...(event.moreThisWeek > 0 ? [t.again(event.moreThisWeek)] : []),
    ...(event.link ? [`${event.link.label}: ${event.link.url}`] : []),
    `${t.view}: ${event.eventUrl}`,
    "",
  ];

  const text = [
    t.featuredOn(longDay(featured.start, input.locale, timeZone)).toUpperCase(),
    ...eventText(featured).slice(0, 1),
    ...(featured.excerpt ? [featured.excerpt] : []),
    ...eventText(featured).slice(1),
    ...(others.length > 0 ? [t.restHeading.toUpperCase(), "", ...others.flatMap(eventText)] : []),
    ...(input.reminders.length > 0
      ? [
          t.reminders.toUpperCase(),
          ...input.reminders.map(
            (reminder) =>
              `${shortMoment(reminder.at, input.locale, timeZone)}: ${
                reminder.kind === "ticketSale" ? t.ticketSale(reminder.title) : t.formCloses(reminder.title)
              } (${reminder.url})`,
          ),
          "",
        ]
      : []),
    `${t.calendar}: ${input.calendarUrl}`,
    "",
    t.why,
    `${t.unsubscribeText}: ${input.unsubscribeUrl}`,
  ].join("\n");

  return { subject, text, html };
}
