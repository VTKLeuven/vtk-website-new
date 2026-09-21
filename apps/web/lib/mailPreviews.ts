import "server-only";

import { takedownMailBody } from "@vtk/gallery";
import {
  accountVerificationMail,
  managedPasswordSetupMail,
  passwordResetMail,
} from "@/lib/accountMail";
import { heroWeekNoticeMail } from "@/lib/calendar/heroWeekNoticeMail";
import { contactMailBody } from "@/lib/contactForm";
import type { EmailSource } from "@/lib/email";
import { confirmationMail, notificationMail } from "@/lib/forms/mail";
import { meetingReservationInvalidatedMail, noShowWarningMail, orderCancelledMail } from "@/lib/mail";
import { pianoConfirmationMail } from "@/lib/piano-reservations";
import { expenseMailDraft } from "@/lib/rekeningen/expenses";
import { shiftReminderMail } from "@/lib/shift/reminders";
import { newLesbezoekNotificationMail } from "@/lib/lesbezoeken-server";
import { newRentalNotificationMail } from "@/lib/theokotVerhuur-server";
import { orderConfirmationMail } from "@/lib/ticketing/mail";
import { urenloopDownloadCodeMail, urenloopPairCodeMail } from "@/lib/urenloopAppMail";

/**
 * Elke mail die de site zelf opstelt, met een voorbeeld erbij.
 *
 * **Waarom dit bestaat.** Een mail zie je niet door de site open te doen: ze
 * vertrekt wanneer iemand anders iets doet, soms pas dagen later, en soms enkel
 * op een server met een mailserver erachter. Wie wil weten of een tekst nog
 * klopt, moest dus een bestelling naspelen of in de code lezen. Deze lijst
 * rendert in de plaats daarvan elke mail met verzonnen gegevens; /admin/it/flows
 * toont ze.
 *
 * **Elke rij roept de echte template aan.** Nooit een kopie van de tekst: een
 * voorvertoning die zelf de mail naschrijft, wijkt na de eerste wijziging af en
 * is dan erger dan geen voorvertoning. Staat een tekst nog in de verzendfunctie
 * zelf, dan hoort ze eerst uit elkaar gehaald te worden (een pure functie die
 * `{ subject, text }` teruggeeft) en pas daarna hier.
 *
 * De gegevens hieronder zijn duidelijk verzonnen: geen echte namen, geen echte
 * adressen, en bedragen die niemand voor een echte bestelling aanziet.
 */

export type MailPreview = {
  /** Stabiel, want het staat in de URL (`#mail-<id>`). */
  id: string;
  title: string;
  /** Wanneer ze vertrekt, in één zin. */
  when: string;
  /** Wie ze krijgt. */
  to: string;
  /** Herkomst in het maillogboek (/admin/it/email-logboek). */
  source: EmailSource;
  /** Waar de template staat, voor wie ze wil aanpassen. */
  file: string;
  subject: string;
  text: string;
  /** De opgemaakte HTML-versie van het bericht in de VTK-huisstijl. */
  html?: string;
  /** Bijzonderheden die je aan de mail zelf niet ziet. */
  notes?: string[];
};

export type MailPreviewGroup = {
  id: string;
  title: string;
  description: string;
  mails: MailPreview[];
};

/** Een vast moment, zodat de voorvertoning niet elke seconde verandert. */
const SAMPLE_START = new Date("2026-10-02T18:00:00.000Z");
const SAMPLE_PAID = new Date("2026-09-19T09:00:00.000Z");

export function mailPreviewGroups(): MailPreviewGroup[] {
  return [
    {
      id: "tickets",
      title: "Tickets",
      description: "De post van de ticketverkoop.",
      mails: [ticketOrderPreview()],
    },
    {
      id: "kalender",
      title: "Kalender",
      description: "Berichten naar de post die een evenement beheert.",
      mails: [heroWeekNoticePreview()],
    },
    {
      id: "account",
      title: "Accounts",
      description: "De mails voor het aanmaken, bevestigen en herstellen van accounts.",
      mails: accountPreviews(),
    },
    {
      id: "shiften",
      title: "Shiften",
      description: "Twee herinneringen per shift, elk met een eigen venster.",
      mails: shiftPreviews(),
    },
    {
      id: "theokot",
      title: "Theokot",
      description: "Broodjes en de verhuur van de zaal.",
      mails: theokotPreviews(),
    },
    {
      id: "piano",
      title: "Piano",
      description: "De bevestiging is meteen het bewijs voor de bewaking van het kasteel.",
      mails: [pianoPreview()],
    },
    {
      id: "formulieren",
      title: "Formulieren",
      description:
        "De inhoud komt per formulier uit de admin; hieronder staat een ingevuld voorbeeld met de vaste omkadering erbij.",
      mails: formPreviews(),
    },
    {
      id: "meldingen",
      title: "Meldingen aan een VTK-adres",
      description: "Wat er binnenkomt via een formulier op de site.",
      mails: notificationPreviews(),
    },
    {
      id: "24ul",
      title: "24urenloop-app",
      description: "Twee codes, elk voor een andere stap.",
      mails: urenloopPreviews(),
    },
  ];
}

/** Alle mails plat, bv. om er één op id te zoeken. */
export function mailPreviews(): MailPreview[] {
  return mailPreviewGroups().flatMap((group) => group.mails);
}

function ticketOrderPreview(): MailPreview {
  const mail = orderConfirmationMail({
    locale: "nl",
    buyerName: "Wannes",
    buyerEmail: "wannes@voorbeeld.test",
    eventName: "Voorbeeldcantus",
    orderNumber: "VTK-26-VOORBEELD",
    ticketCount: 2,
    orderUrl: "https://vtk.be/tickets/toegang?orderId=voorbeeld#access=voorbeeld",
    contents: { pdf: true, applePasses: 2, googleLinks: [] },
    event: {
      startsAt: SAMPLE_START,
      timeZone: "Europe/Brussels",
      location: "Theokot, Studentenwijk Arenberg",
      // Zonder poster: de voorvertoning mag geen afbeelding laden die er in een
      // echte mail wel is, maar hier niet bestaat.
      posterUrl: null,
      ownerName: "Activiteiten",
    },
    summary: {
      lines: [{ name: "Ticket lid", quantity: 2, unitPriceCents: 1200, totalCents: 2400 }],
      totalCents: 2400,
      currency: "EUR",
      paidAt: SAMPLE_PAID,
    },
  });
  return {
    id: "ticket-order",
    title: "Bevestiging van een ticketbestelling",
    when: "Zodra een betaling binnen is, via de ticket-outbox (elke minuut).",
    to: "De koper",
    source: "ticketing",
    file: "lib/ticketing/mail.ts",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notes: [
      "De poster van het gekoppelde kalender-event staat er in het echt bovenaan; hier staat ze niet, want de voorvertoning laadt geen bestaande foto.",
      "De pdf met de tickets en de Apple Wallet-passen gaan als bijlage mee; de tekst noemt enkel wat er echt bij zit.",
    ],
  };
}

function heroWeekNoticePreview(): MailPreview {
  const mail = heroWeekNoticeMail({
    title: "Voorbeeldcantus",
    start: SAMPLE_START,
    allDay: false,
    location: "Theokot",
    groupName: "Onthaal",
    reasons: ["draft", "banner"],
    adminUrl: "https://vtk.be/admin/kalender/voorbeeld",
    publicUrl: null,
    logoUrl: "https://vtk.be/vtk-logo.png",
  });
  return {
    id: "hero-week-notice",
    title: "Je evenement komt dichterbij",
    when: "Zodra het evenement in het weekoverzicht van de homepage zou komen (zes dagen vooruit, zaterdag niet meegeteld) terwijl het nog een concept is of nog geen eigen banner heeft. Via de background-worker, elke vijf minuten.",
    to: "De post van het evenement, op haar eigen adres (post@vtk.be)",
    source: "calendar",
    file: "lib/calendar/heroWeekNoticeMail.ts",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    notes: [
      "Eén mail per evenement: staat het nog als concept én zonder banner, dan is dat één mail met twee punten.",
      "Een evenement dat bewust uit het weekoverzicht gehaald is (heroWeek = HIDDEN), krijgt niets.",
      "De knop naar de eventpagina staat er enkel bij wanneer het evenement gepubliceerd is.",
    ],
  };
}

function accountPreviews(): MailPreview[] {
  const name = "Wannes Voorbeeld";
  const verification = accountVerificationMail({
    name,
    locale: "nl",
    url: "https://vtk.be/registreren/bevestigen?token=voorbeeld",
  });
  const reset = passwordResetMail({
    name,
    locale: "nl",
    url: "https://vtk.be/wachtwoord-vergeten/nieuw?token=voorbeeld",
  });
  const managed = managedPasswordSetupMail({
    name,
    locale: "nl",
    url: "https://vtk.be/wachtwoord-vergeten/nieuw?token=voorbeeld",
  });
  return [
    {
      id: "account-verification",
      title: "Bevestig je VTK-account",
      when: "Meteen nadat iemand zelf een account aanmaakt met een e-mailadres.",
      to: "Het opgegeven adres",
      source: "account",
      file: "lib/accountMail.ts",
      ...verification,
      notes: ["De link blijft zeven dagen geldig.", "Ook in het Engels, voor wie de site in het Engels gebruikt."],
    },
    {
      id: "account-reset",
      title: "Nieuw wachtwoord",
      when: "Wanneer iemand op /wachtwoord-vergeten een nieuw wachtwoord aanvraagt.",
      to: "Het adres van het account",
      source: "account",
      file: "lib/accountMail.ts",
      ...reset,
      notes: ["De link blijft één uur geldig en werkt één keer."],
    },
    {
      id: "account-managed",
      title: "Blijf toegang houden (alumni)",
      when: "Wanneer een beheerder een toegangslink stuurt naar iemand wiens KU Leuven-login wegvalt.",
      to: "Het persoonlijke adres van het lid",
      source: "account",
      file: "lib/accountMail.ts",
      ...managed,
      notes: [
        "Dezelfde resetpagina als hierboven, maar zonder te beweren dat de ontvanger de mail zelf aanvroeg.",
      ],
    },
  ];
}

function shiftPreviews(): MailPreview[] {
  const shift = {
    name: "Fakbar: tap 22u-1u",
    startTime: SAMPLE_START,
    endTime: new Date(SAMPLE_START.getTime() + 3 * 60 * 60 * 1000),
    location: "Fakbar Letteren",
    reward: 2,
  };
  const dayBefore = shiftReminderMail("dayBefore", { name: "Wannes", locale: "NL" }, shift);
  const soon = shiftReminderMail("soon", { name: "Wannes", locale: "NL" }, shift);
  return [
    {
      id: "shift-day-before",
      title: "Morgen sta je ingepland",
      when: "24 uur voor de start van de shift, via de shift-worker (elke vijf minuten).",
      to: "Wie voor de shift ingeschreven is en de herinnering aan heeft staan",
      source: "shifts",
      file: "lib/shift/reminders.ts",
      ...dayBefore,
      notes: [
        "Wie zich later dan het venster inschrijft, krijgt die herinnering niet meer: anders leest ze als \"morgen\" terwijl de shift straks begint.",
        "Elk lid kan de twee herinneringen apart uitzetten in zijn profiel.",
      ],
    },
    {
      id: "shift-soon",
      title: "Straks sta je ingepland",
      when: "2 uur voor de start van de shift.",
      to: "Wie voor de shift ingeschreven is en de herinnering aan heeft staan",
      source: "shifts",
      file: "lib/shift/reminders.ts",
      ...soon,
    },
  ];
}

function theokotPreviews(): MailPreview[] {
  const invalidated = meetingReservationInvalidatedMail(
    { name: "Wannes", locale: "NL" },
    {
      meetingLabel: "Grocomeet",
      dateLabel: "dinsdag 6 oktober",
      reason: "Theokot is die dag gesloten.",
      url: "https://vtk.be/theokot/grocomeet",
    },
  );
  const noShow = noShowWarningMail({ name: "Wannes", locale: "NL" }, "dinsdag 6 oktober");
  const cancelled = orderCancelledMail(
    { name: "Wannes", locale: "NL" },
    {
      dateLabel: "dinsdag 6 oktober",
      reason: "Er waren minder broodjes beschikbaar dan er gereserveerd waren.",
      itemsLabel: "1\u00d7 Broodje voorbeeld",
      url: "https://vtk.be/theokot",
    },
  );
  const rental = newRentalNotificationMail({
    rental: {
      id: "voorbeeld",
      responsibleName: "Wannes Voorbeeld",
      email: "wannes@voorbeeld.test",
      phone: "0470 00 00 00",
      startsAt: SAMPLE_START,
      endsAt: new Date(SAMPLE_START.getTime() + 5 * 60 * 60 * 1000),
      purpose: "Receptie na een doctoraatsverdediging",
      attendees: 60,
      depositChoice: "TRANSFER",
      remarks: null,
      renterType: "EXTERNAL",
      locale: "nl",
      extraAnswers: [],
      clashes: [],
    },
    approveUrl: "https://vtk.be/theokot/verhuur/beslissing/voorbeeld-ja",
    rejectUrl: "https://vtk.be/theokot/verhuur/beslissing/voorbeeld-nee",
    adminUrl: "https://vtk.be/admin/theokot/verhuur",
  });
  return [
    {
      id: "theokot-invalidated",
      title: "Je broodje kan niet meer",
      when: "Wanneer het aanbod van een verkoopdag verandert of Theokot dicht gaat, en een gereserveerd broodje daardoor wegvalt.",
      to: "Wie het broodje reserveerde",
      source: "theokot",
      file: "lib/mail.ts",
      ...invalidated,
      notes: ["Zegt meteen waar er opnieuw gekozen kan worden; een melding zonder uitweg laat iemand met lege handen achter."],
    },
    {
      id: "theokot-no-show",
      title: "Je bestelling werd niet opgehaald",
      when: "Na het sluiten van de afhaal, voor wie zijn broodjes niet kwam halen. Via de background-worker.",
      to: "Wie de bestelling plaatste",
      source: "theokot",
      file: "lib/mail.ts",
      ...noShow,
    },
    {
      id: "theokot-order-cancelled",
      title: "Je bestelling is geannuleerd",
      when: "Wanneer een verkoopdag verwijderd wordt, of wanneer het aanbod van een dag onder het aantal gereserveerde broodjes gezet wordt en de laatste bestellingen sneuvelen.",
      to: "Wie de bestelling plaatste",
      source: "theokot",
      file: "lib/mail.ts",
      ...cancelled,
      notes: [
        "Bij het verlagen van het aanbod sneuvelen de laatst geplaatste bestellingen eerst: wie het eerst reserveerde, houdt zijn broodje.",
        "Deze mail houdt de verwerking niet tegen wanneer ze niet vertrekt; de bestelling is dan al geschrapt en de mislukking staat in het maillogboek.",
      ],
    },
    {
      id: "theokot-rental",
      title: "Nieuwe verhuuraanvraag",
      when: "Zodra iemand het verhuurformulier van het Theokot indient.",
      to: "De adressen uit de verhuur-instellingen",
      source: "theokotRental",
      file: "lib/theokotVerhuur-server.ts",
      ...rental,
      notes: [
        "De twee links openen een bevestigingsscherm en versturen zelf niets: een mailclient die links vooruitlaadt zou anders een aanvraag kunnen goedkeuren.",
      ],
    },
  ];
}

function pianoPreview(): MailPreview {
  const mail = pianoConfirmationMail({
    name: "Wannes",
    locale: "NL",
    startsAt: SAMPLE_START,
    endsAt: new Date(SAMPLE_START.getTime() + 60 * 60 * 1000),
  });
  return {
    id: "piano-confirmation",
    title: "Bevestiging van een pianoreservatie",
    when: "Meteen nadat iemand een uur reserveert in lokaal 01.52.",
    to: "Wie reserveerde",
    source: "website",
    file: "lib/piano-reservations.ts",
    ...mail,
    notes: [
      "De speler moet deze mail bij zich hebben: de bewaking van het kasteel mag ernaar vragen. Zie docs/design-decisions.md, \"De bevestigingsmail als bewijs\".",
      "Een mislukte mail blokkeert de reservatie niet; ze staat dan wel gewoon in het overzicht.",
    ],
  };
}

function formPreviews(): MailPreview[] {
  const answers = [
    { label: "Naam", value: "Wannes Voorbeeld" },
    { label: "Studierichting", value: "Burgerlijk ingenieur" },
    { label: "Ik kom mee eten", value: "Ja" },
  ];
  const confirmation = confirmationMail({
    locale: "nl",
    formTitle: "Inschrijving voorbeeldweekend",
    slug: "voorbeeldweekend",
    recipient: "wannes@voorbeeld.test",
    recipientName: "Wannes",
    subject: null,
    body: null,
    answers,
    includeAnswers: true,
    event: null,
  });
  const notification = notificationMail({
    formTitle: "Inschrijving voorbeeldweekend",
    slug: "voorbeeldweekend",
    recipients: ["activiteiten@vtk.be"],
    submitterName: "Wannes Voorbeeld",
    submitterEmail: "wannes@voorbeeld.test",
    answers,
    entryCount: 42,
  });
  return [
    {
      id: "form-confirmation",
      title: "Bevestiging van een inzending",
      when: "Zodra iemand een formulier indient waarvoor een bevestiging aan staat, via de forms-outbox.",
      to: "Wie het formulier invulde",
      source: "forms",
      file: "lib/forms/mail.ts",
      subject: confirmation.subject,
      text: confirmation.text,
      html: confirmation.html,
      notes: [
        "Onderwerp en begeleidende tekst komen per formulier uit de admin; hier staat de standaardtekst omdat dit voorbeeldformulier niets eigen ingevuld heeft.",
        "De antwoorden eronder staan er enkel wanneer de redacteur dat aanvinkte, en een gekoppeld evenement gaat als .ics mee.",
      ],
    },
    {
      id: "form-notification",
      title: "Nieuwe inzending",
      when: "Bij elke inzending, wanneer het formulier meldingsadressen heeft. Een formulier kan in de plaats daarvan een dagelijkse samenvatting krijgen.",
      to: "De meldingsadressen van het formulier",
      source: "forms",
      file: "lib/forms/mail.ts",
      subject: notification.subject,
      text: notification.text,
      html: notification.html,
    },
  ];
}

function notificationPreviews(): MailPreview[] {
  const contact = contactMailBody({
    name: "Wannes Voorbeeld",
    email: "wannes@voorbeeld.test",
    subject: "Vraag over het Theokot",
    message: "Dag VTK,\n\nIs het Theokot open tijdens de blok?\n\nGroeten,\nWannes",
  });
  const takedown = takedownMailBody({
    gallery: "main",
    submission: {
      albumSlug: "voorbeeldweekend-2026",
      assetId: "voorbeeld",
      name: "Wannes Voorbeeld",
      email: "wannes@voorbeeld.test",
      reason: "ON_PHOTO",
      message: "Ik sta hier herkenbaar op en had dat liever niet.",
    },
    albumTitle: "Voorbeeldweekend 2026",
    photoFilename: "DSC_0042.jpg",
    adminUrl: "https://vtk.be/nl/admin/media/verwijderverzoeken",
    albumUrl: "https://vtk.be/nl/media/voorbeeldweekend-2026",
  });
  const lesbezoek = newLesbezoekNotificationMail({
    startsAt: SAMPLE_START,
    course: "Analyse I",
    audience: "Eerste bachelor",
    subject: "Studentenvertegenwoordiging",
    teacherEmail: "professor@voorbeeld.test",
    requesterEmail: "onderwijs@vtk.be",
    organisation: { name: "VTK Onderwijs" },
  });
  const expense = expenseMailDraft({
    postLabel: "Onthaal",
    payerName: "Wannes Voorbeeld",
    description: "Drank voor de openingsreceptie",
    amountCents: 8450,
  });
  return [
    {
      id: "contact",
      title: "Bericht via het contactformulier",
      when: "Zodra iemand /contact invult.",
      to: "info@vtk.be",
      source: "contact",
      file: "lib/contactForm.ts",
      ...contact,
      notes: ["Antwoorden gaat rechtstreeks naar de bezoeker: het reply-to staat op zijn adres."],
    },
    {
      id: "takedown",
      title: "Verzoek om een foto weg te halen",
      when: "Zodra iemand bij een foto in de galerij op \"laat deze foto verwijderen\" klikt.",
      to: "Het adres uit de galerij-instellingen",
      source: "takedowns",
      file: "packages/gallery/src/takedown.ts",
      ...takedown,
      notes: ["Het verzoek staat ook in het beheer; mislukt deze mail, dan is het verzoek niet verloren."],
    },
    {
      id: "lesbezoek",
      title: "Nieuwe lesbezoekaanvraag",
      when: "Zodra een organisatie een lesbezoek aanvraagt.",
      to: "Het meldingsadres uit de lesbezoek-instellingen",
      source: "lesbezoeken",
      file: "lib/lesbezoeken-server.ts",
      ...lesbezoek,
      notes: [
        "De mails naar de professor en de aanvrager zijn geen vaste sjablonen: die stelt iemand op uit een sjabloon in het beheer, met een voorbeeld ernaast.",
      ],
    },
    {
      id: "expense",
      title: "Rekening doorsturen naar de boekhouding",
      when: "Wanneer een penningmeester in /admin/rekeningen op doorsturen klikt. Dit is een concept dat in zijn eigen mailprogramma opent.",
      to: "De boekhouding",
      source: "expenses",
      file: "lib/rekeningen/expenses.ts",
      subject: expense.subject,
      text: expense.body,
      html: expense.html,
      notes: ["Het blad voor de boekhouder en het bonnetje gaan als pdf mee."],
    },
  ];
}

function urenloopPreviews(): MailPreview[] {
  const download = urenloopDownloadCodeMail({ code: "123456", minutes: 15 });
  const pair = urenloopPairCodeMail({ code: "123456", minutes: 15 });
  return [
    {
      id: "urenloop-download",
      title: "Code om de app te downloaden",
      when: "Wanneer iemand met een toegelaten adres een code aanvraagt op de downloadpagina.",
      to: "Het opgegeven adres, enkel wanneer het op de lijst staat",
      source: "urenloopApp",
      file: "lib/urenloopAppMail.ts",
      ...download,
      notes: [
        "Staat het adres niet op de lijst, dan vertrekt er niets en krijgt de aanvrager toch hetzelfde antwoord: anders is het formulier een manier om de lijst uit te lezen.",
      ],
    },
    {
      id: "urenloop-pair",
      title: "Code om een computer te koppelen",
      when: "Wanneer de app zelf een koppelcode aanvraagt.",
      to: "Het opgegeven adres, enkel wanneer het op de lijst staat",
      source: "urenloopApp",
      file: "lib/urenloopAppMail.ts",
      ...pair,
    },
  ];
}
