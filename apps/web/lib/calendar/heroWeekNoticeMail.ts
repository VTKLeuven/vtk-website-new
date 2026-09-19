/**
 * De herinnering aan een post: "je evenement komt op de homepage, maar er
 * ontbreekt nog iets."
 *
 * Wanneer ze vertrekt staat in `heroWeekNotice.ts`; dit bestand maakt enkel het
 * bericht. Puur, zonder database en zonder mailserver, zodat de voorvertoning in
 * /admin/it/flows precies dezelfde mail toont als de verzender.
 *
 * De vorm komt van het toegangsbewijs in de ticketmail: een donkere balk met
 * het logo, een kop met de gele streep, en dan een kaart met een navy stuk
 * links. Daar zat de qr van het ticket; hier zit de datum, want dat is wat deze
 * mail dringend maakt. Eronder staat per openstaand punt één regel met een gele
 * pil, en dan de knop naar het evenement in de admin.
 *
 * Bewust enkel in het Nederlands: dit is interne post naar een post van de
 * kring, geen bericht aan een bezoeker.
 */

import {
  MAIL_COLOR as COLOR,
  MAIL_FONT as FONT,
  escapeHtml,
  mailButton,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
} from "@/lib/mailDesign";
import { HERO_WEEK_TIME_ZONE } from "./heroWeek";
import type { HeroWeekNoticeReason } from "./heroWeekNotice";

export type HeroWeekNoticeMail = {
  subject: string;
  text: string;
  html: string;
};

export type HeroWeekNoticeMailInput = {
  /** Titel van het evenement, in het Nederlands. */
  title: string;
  start: Date;
  allDay: boolean;
  location: string | null;
  /** De post die het evenement beheert. */
  groupName: string;
  /** Wat er nog ontbreekt; minstens één. */
  reasons: HeroWeekNoticeReason[];
  /** Volledig adres van het evenement in de admin. */
  adminUrl: string;
  /** Volledig adres van de publieke eventpagina; `null` voor een concept. */
  publicUrl: string | null;
  /** Volledig adres van het logo, bv. `https://vtk.be/vtk-logo.png`. */
  logoUrl: string;
  timeZone?: string;
};

/** Wat er ontbreekt, in mensentaal: voor het onderwerp, de pil en de uitleg. */
const REASON_TEXT: Record<
  HeroWeekNoticeReason,
  { subject: string; pill: string; line: string }
> = {
  draft: {
    subject: "staat nog als concept opgeslagen",
    pill: "Nog een concept",
    line: "Een concept staat nergens op de site: niet in de kalender, niet in het weekoverzicht en niet in de agenda-feeds. Publiceer het, of het komt er niet op.",
  },
  banner: {
    subject: "heeft nog geen banner",
    pill: "Geen eigen banner",
    line: "Zonder eigen affiche valt het evenement terug op de standaardfoto, en die staat dan naast de andere evenementen van de week.",
  },
};

function zoned(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("nl-BE", { timeZone, ...options }).format(date);
}

/** "vrijdag 2 oktober 2026, 20:00", of zonder uur bij een heledagevenement. */
function moment(input: HeroWeekNoticeMailInput, timeZone: string): string {
  const day = zoned(input.start, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (input.allDay) return day;
  const time = zoned(input.start, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${day}, ${time}`;
}

/** De drie regels van het navy datumblok, zoals de datumpin op een eventtegel. */
function dateStub(input: HeroWeekNoticeMailInput, timeZone: string): string {
  const weekday = zoned(input.start, timeZone, { weekday: "short" });
  // Het dagnummer in en-GB: nl-BE schrijft "2." met een punt erachter.
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric" }).format(input.start);
  const month = zoned(input.start, timeZone, { month: "short" });
  const small = "font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase";
  return `<td width="128" valign="middle" align="center" style="width:128px;padding:20px 14px;background:${COLOR.navy};font-family:${FONT};color:#ffffff;line-height:1"><div style="${small};color:${COLOR.onDarkMuted}">${escapeHtml(weekday)}</div><div style="font-size:34px;font-weight:800;padding:4px 0 3px">${escapeHtml(day)}</div><div style="${small};color:${COLOR.onDarkMuted}">${escapeHtml(month)}</div></td>`;
}

export function heroWeekNoticeMail(input: HeroWeekNoticeMailInput): HeroWeekNoticeMail {
  const timeZone = input.timeZone ?? HERO_WEEK_TIME_ZONE;
  const reasons = input.reasons.length > 0 ? input.reasons : (["banner"] as HeroWeekNoticeReason[]);
  const when = moment(input, timeZone);

  // Twee punten worden één zin: "staat nog als concept opgeslagen en heeft nog
  // geen banner". Zo zegt de onderwerpregel meteen waarover het gaat, ook in
  // een mailbox die enkel die regel toont.
  const what = reasons.map((reason) => REASON_TEXT[reason].subject).join(" en ");
  const subject = `Je evenement komt dichterbij maar ${what}: ${input.title}`;

  const intro = `${input.title} staat op ${when}${
    input.location ? ` in ${input.location}` : ""
  } en komt daarmee in het weekoverzicht op de homepage. ${
    reasons.length === 1 ? "Er is nog één ding te doen." : "Er zijn nog twee dingen te doen."
  }`;

  const textLines = [
    intro,
    "",
    ...reasons.flatMap((reason) => [
      `${REASON_TEXT[reason].pill}: ${REASON_TEXT[reason].line}`,
      "",
    ]),
    `Werk het evenement bij: ${input.adminUrl}`,
    ...(input.publicUrl ? [`De eventpagina: ${input.publicUrl}`] : []),
    "",
    `Je krijgt deze mail omdat dit evenement van ${input.groupName} is. Hij vertrekt één keer per evenement.`,
  ];

  const facts = [when, input.location?.trim()].filter(Boolean) as string[];
  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${COLOR.line};border-radius:18px;overflow:hidden"><tr>${dateStub(
    input,
    timeZone,
  )}<td valign="middle" style="padding:18px 20px;font-family:${FONT}"><div style="font-size:12px;font-weight:600;color:${COLOR.muted}">${escapeHtml(
    input.groupName,
  )}</div><div style="margin:6px 0 4px;font-size:19px;font-weight:650;letter-spacing:-.02em;color:${COLOR.ink}">${escapeHtml(
    input.title,
  )}</div><div style="font-size:13px;line-height:1.5;color:${COLOR.muted}">${facts
    .map((fact) => escapeHtml(fact))
    .join("<br>")}</div></td></tr></table>`;

  // Eén rij per openstaand punt: de gele pil zegt wát er ontbreekt, de regel
  // eronder wat er gebeurt als het zo blijft.
  const points = reasons
    .map(
      (reason) =>
        `<tr><td style="padding:14px 0;border-top:1px solid ${COLOR.line};font-family:${FONT}"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${COLOR.yellow};color:${COLOR.ink};font-size:11.5px;font-weight:700">${escapeHtml(
          REASON_TEXT[reason].pill,
        )}</span><div style="margin-top:8px;font-size:14px;line-height:1.55;color:${COLOR.body}">${escapeHtml(
          REASON_TEXT[reason].line,
        )}</div></td></tr>`,
    )
    .join("");

  const buttons = [
    mailButton(input.adminUrl, "Werk het evenement bij"),
    ...(input.publicUrl ? [mailButton(input.publicUrl, "Bekijk de eventpagina", "secondary")] : []),
  ].join(" ");

  const html = mailDocument({
    lang: "nl",
    title: subject,
    rows: `${mailHeaderRow({ logoUrl: input.logoUrl, kicker: "VTK Kalender" })}<tr><td style="padding:28px 30px 30px">${mailHeading(
      "Je evenement komt dichterbij",
    )}<p style="margin:18px 0 20px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(
      intro,
    )}</p>${card}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin-top:6px">${points}</table><div style="margin-top:22px">${buttons}</div></td></tr>${mailFooterRow(
      `Je krijgt deze mail omdat dit evenement van ${input.groupName} is. Hij vertrekt één keer per evenement.`,
    )}`,
  });

  return { subject, text: textLines.join("\n"), html };
}
