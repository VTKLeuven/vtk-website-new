import { formatEuro } from "@/lib/rekeningen/expenses";
import {
  mailButton,
  mailContentRow,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailInfoTable,
  mailNoticeBox,
  mailParagraph,
} from "@/lib/mailDesign";
import {
  countsLines,
  countsTotalCents,
  denominationLabel,
  timeRangeLabel,
  type Counts,
} from "@/lib/kassas/kassa";

/**
 * De mail die vertrekt wanneer Beheer een kassa aanvaardt, als pure functie:
 * geen database, geen mailserver. Het versturen staat in `app/actions/kassas.ts`;
 * /admin/it/flows rendert deze functie met verzonnen gegevens.
 *
 * Het belangrijkste staat in het kader: de kassa ligt niet klaar op een vast
 * moment, de aanvrager spreekt zelf af wanneer hij ze ophaalt.
 */
export type CashRegisterAcceptedMailInput = {
  locale: "nl" | "en";
  /** Voornaam of naam van de aanvrager, voor de aanhef. */
  name: string;
  activity: string;
  /** De datum van de activiteit (`@db.Date`, dus middernacht UTC). */
  date: Date;
  /** Begin en einde; `null` bij een kassa van voor er naar de uren gevraagd werd. */
  startsAt: Date | null;
  endsAt: Date | null;
  postLabel: string;
  responsibleName: string;
  startCounts: Counts;
  wantsBancontact: boolean;
  wantsPayconiq: boolean;
  /** De bakjes en rekeningen die Beheer bij het aanvaarden koos. */
  bancontactTerminals: string[];
  payconiqAccounts: string[];
  /** Het adres van Beheer; staat in de tekst en is het reply-to. */
  contactEmail: string;
  /** Volledige link naar de aanvraag in het beheer. */
  url: string;
};

export function cashRegisterAcceptedMail(input: CashRegisterAcceptedMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const nl = input.locale === "nl";
  const date = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(input.date);
  const hours = timeRangeLabel(input.startsAt, input.endsAt, nl);
  const yes = nl ? "Ja" : "Yes";
  const no = nl ? "Nee" : "No";
  // De naam van het toestel, zodat de post weet wat ze komt ophalen.
  const device = (wanted: boolean, names: string[]) => (wanted ? names.join(", ") || yes : no);

  const startTotal = countsTotalCents(input.startCounts);
  const startLines = countsLines(input.startCounts).map(
    (line) => `${line.pieces} × ${denominationLabel(line.denomination)}`,
  );
  const startValue =
    startTotal > 0
      ? `${formatEuro(startTotal, input.locale)}\n${startLines.join("\n")}`
      : nl
        ? "Geen wisselgeld"
        : "No change";

  const subject = nl
    ? `Je kassa voor ${input.activity} is aanvaard`
    : `Your cash register for ${input.activity} was accepted`;
  const heading = nl ? "Je kassa is aanvaard" : "Your cash register was accepted";
  const greeting = nl ? `Dag ${input.name},` : `Hi ${input.name},`;
  const intro = nl
    ? `Beheer aanvaardde je aanvraag voor een kassa voor ${input.activity} op ${date}.`
    : `Administration accepted your request for a cash register for ${input.activity} on ${date}.`;
  const noticeTitle = nl ? "Spreek zelf een ophaalmoment af" : "Arrange a pick-up time yourself";
  const noticeText = nl
    ? `De kassa ligt niet vanzelf voor je klaar. Stuur een van de financieel beheerders persoonlijk een bericht, of mail naar ${input.contactEmail}, om af te spreken wanneer je ze ophaalt.`
    : `The cash register is not set aside for you automatically. Message one of the financial managers personally, or email ${input.contactEmail}, to agree on when you pick it up.`;
  const outro = nl
    ? "Klopt er iets niet in dit overzicht? Antwoord op deze mail, dan komt het bij Beheer terecht."
    : "Is something wrong in this overview? Reply to this email and it reaches Administration.";
  const facts = [
    { label: nl ? "Activiteit" : "Activity", value: input.activity },
    { label: nl ? "Datum" : "Date", value: date },
    ...(hours ? [{ label: nl ? "Uur" : "Time", value: hours }] : []),
    { label: nl ? "Post" : "Post", value: input.postLabel },
    { label: nl ? "Verantwoordelijke" : "Responsible", value: input.responsibleName },
    { label: nl ? "Startkassa" : "Starting float", value: startValue },
    { label: "Bancontact", value: device(input.wantsBancontact, input.bancontactTerminals) },
    { label: "Payconiq", value: device(input.wantsPayconiq, input.payconiqAccounts) },
  ];
  const buttonLabel = nl ? "Bekijk je aanvraag" : "View your request";
  const footer = nl
    ? "Je krijgt deze mail omdat je op vtk.be een kassa aanvroeg."
    : "You received this email because you requested a cash register on vtk.be.";

  const text = [
    greeting,
    "",
    intro,
    "",
    noticeTitle,
    noticeText,
    "",
    ...facts.map((fact) => `${fact.label}: ${fact.value.replace(/\n/g, "\n  ")}`),
    "",
    outro,
    "",
    `${buttonLabel}: ${input.url}`,
    "",
    nl ? "Groeten,\nBeheer VTK" : "Kind regards,\nVTK Administration",
    "",
    "--",
    footer,
  ].join("\n");

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: nl ? "VTK Kassa's" : "VTK Cash registers" })}${mailContentRow(
      [
        mailHeading(heading),
        mailParagraph(greeting),
        mailParagraph(intro),
        mailNoticeBox(noticeText, noticeTitle),
        mailInfoTable(facts),
        mailParagraph(outro),
        `<div style="margin-top:22px">${mailButton(input.url, buttonLabel)}</div>`,
      ].join(""),
    )}${mailFooterRow(footer)}`,
  });

  return { subject, text, html };
}
