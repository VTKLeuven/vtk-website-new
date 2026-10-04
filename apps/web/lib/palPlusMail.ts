import {
  MAIL_COLOR,
  MAIL_FONT,
  escapeHtml,
  mailButton,
  mailContentRow,
  mailDateStub,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailInfoTable,
  mailMessageBox,
  mailNoticeBox,
  mailParagraph,
  mailPill,
} from "@/lib/mailDesign";

/**
 * De mails van PAL+, als pure functies: geen database, geen mailserver. Het
 * versturen (wie, wanneer) staat in `lib/palPlusNotify.ts`; /admin/it/flows
 * rendert dezelfde functies met verzonnen gegevens.
 *
 * Elke mail is dezelfde opbouw (`composeMail`): een aanhef, een paar zinnen,
 * eventueel de sessie als kaart, een reden of een aandachtspunt, en knoppen.
 * Zo blijven negen mails één familie, en staan tekst- en html-versie altijd
 * gelijk, want ze komen uit dezelfde stukken.
 *
 * Wat een lid intikte (omschrijving, reden) gaat altijd door `escapeHtml`; dat
 * doen de bouwstenen uit `mailDesign` zelf.
 */

export type PalPlusMailLocale = "nl" | "en";
export type PalPlusMailRole = "attendee" | "tutor";

/** Een sessie zoals ze in een mail staat, al vertaald naar de taal van de ontvanger. */
export type PalPlusMailSession = {
  courseLabel: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  /** `null`: het lokaal ligt nog niet vast. */
  roomLabel: string | null;
  tutorNames: string[];
};

export type PalPlusMail = { subject: string; text: string; html: string };

const SIGNATURE = "VTK Onderwijs";

// -----------------------------------------------------------------------------
// Opmaak van datums
// -----------------------------------------------------------------------------

const TZ = "Europe/Brussels";

function dayFormat(locale: PalPlusMailLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function shortDayFormat(locale: PalPlusMailLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
}

function timeFormat(locale: PalPlusMailLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "donderdag 22 oktober, 14:00 - 16:00" */
export function palPlusMailMoment(startsAt: Date, endsAt: Date, locale: PalPlusMailLocale): string {
  const time = timeFormat(locale);
  return `${dayFormat(locale).format(startsAt)}, ${time.format(startsAt)} - ${time.format(endsAt)}`;
}

function shortDate(date: Date, locale: PalPlusMailLocale): string {
  return shortDayFormat(locale).format(date);
}

function vouchers(amount: number, locale: PalPlusMailLocale): string {
  const value = amount.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB");
  return locale === "nl"
    ? `${value} ${amount === 1 ? "bonnetje" : "bonnetjes"}`
    : `${value} ${amount === 1 ? "voucher" : "vouchers"}`;
}

function joinNames(names: string[], locale: PalPlusMailLocale): string {
  if (names.length <= 1) return names.join("");
  const and = locale === "nl" ? "en" : "and";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

// -----------------------------------------------------------------------------
// De gemeenschappelijke opbouw
// -----------------------------------------------------------------------------

type MailButtonSpec = { url: string; label: string; secondary?: boolean };

type ComposeInput = {
  locale: PalPlusMailLocale;
  subject: string;
  heading: string;
  /** De naam in de aanhef; weg voor een mail aan een groepsadres. */
  greetingName?: string;
  /** Zinnen boven de kaart. */
  intro: string[];
  session?: { value: PalPlusMailSession; note?: string };
  /** Een gele pil onder de kaart, bv. de bonnetjes. */
  pill?: string;
  /** Labels en waarden, voor een melding aan Onderwijs. */
  facts?: { label: string; value: string }[];
  /** Een citaat: de omschrijving van de indiener, de reden van Onderwijs. */
  box?: { label: string; text: string };
  notice?: { title: string; text: string };
  /** Zinnen onder de kaart. */
  outro: string[];
  buttons: MailButtonSpec[];
  footer: string;
};

function sessionLines(session: PalPlusMailSession, locale: PalPlusMailLocale, note?: string): string[] {
  const nl = locale === "nl";
  return [
    `PAL+: ${session.courseLabel}`,
    `${palPlusMailMoment(session.startsAt, session.endsAt, locale)}${note ? ` (${note})` : ""}`,
    `${nl ? "Lokaal" : "Room"}: ${session.roomLabel ?? (nl ? "volgt nog" : "to be announced")}`,
    ...(session.tutorNames.length > 0
      ? [`${nl ? "Gegeven door" : "Given by"}: ${joinNames(session.tutorNames, locale)}`]
      : []),
    ...(session.description ? ["", session.description] : []),
  ];
}

function sessionCard(session: PalPlusMailSession, locale: PalPlusMailLocale, note?: string): string {
  const nl = locale === "nl";
  const room = session.roomLabel
    ? escapeHtml(session.roomLabel)
    : `<em>${nl ? "volgt nog" : "to be announced"}</em>`;
  const tutors =
    session.tutorNames.length > 0
      ? `<br>${nl ? "Gegeven door" : "Given by"} ${escapeHtml(joinNames(session.tutorNames, locale))}`
      : "";
  const description = session.description
    ? `<div style="margin-top:10px;font-size:13px;line-height:1.5;color:${MAIL_COLOR.muted};white-space:pre-wrap">${escapeHtml(session.description)}</div>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:18px 0;border:1px solid ${MAIL_COLOR.line};border-radius:18px;overflow:hidden"><tr>${mailDateStub(
    { date: session.startsAt, locale },
  )}<td valign="middle" style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${MAIL_COLOR.muted}">PAL+</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${escapeHtml(
    session.courseLabel,
  )}</div><div style="font-size:13px;line-height:1.5;color:${MAIL_COLOR.body}"><strong>${escapeHtml(
    palPlusMailMoment(session.startsAt, session.endsAt, locale),
  )}</strong>${note ? ` <span style="color:${MAIL_COLOR.muted}">(${escapeHtml(note)})</span>` : ""}<br>${
    nl ? "Lokaal" : "Room"
  }: ${room}${tutors}</div>${description}</td></tr></table>`;
}

function composeMail(input: ComposeInput): PalPlusMail {
  const nl = input.locale === "nl";
  const greeting = input.greetingName ? (nl ? `Dag ${input.greetingName},` : `Hi ${input.greetingName},`) : null;

  const text: string[] = [];
  if (greeting) text.push(greeting, "");
  for (const line of input.intro) text.push(line, "");
  if (input.session) text.push(...sessionLines(input.session.value, input.locale, input.session.note), "");
  if (input.pill) text.push(input.pill, "");
  if (input.facts) {
    for (const fact of input.facts) if (fact.value.trim()) text.push(`${fact.label}: ${fact.value}`);
    text.push("");
  }
  if (input.box) text.push(`${input.box.label}:`, input.box.text, "");
  if (input.notice) text.push(`${input.notice.title}: ${input.notice.text}`, "");
  for (const line of input.outro) text.push(line, "");
  for (const button of input.buttons) text.push(`${button.label}: ${button.url}`);
  if (input.buttons.length > 0) text.push("");
  text.push(SIGNATURE, "", "--", input.footer);

  const html = mailDocument({
    lang: input.locale,
    title: input.subject,
    rows: `${mailHeaderRow({ kicker: "VTK PAL+" })}${mailContentRow(
      [
        mailHeading(input.heading),
        greeting ? mailParagraph(greeting) : "",
        ...input.intro.map((line) => mailParagraph(line)),
        input.session ? sessionCard(input.session.value, input.locale, input.session.note) : "",
        input.pill ? `<div style="margin:6px 0 4px">${mailPill(input.pill, "yellow")}</div>` : "",
        input.facts ? mailInfoTable(input.facts) : "",
        input.box ? mailMessageBox(input.box.text, input.box.label) : "",
        input.notice ? mailNoticeBox(input.notice.text, input.notice.title) : "",
        ...input.outro.map((line) => mailParagraph(line)),
        input.buttons.length > 0
          ? `<div style="margin-top:22px">${input.buttons
              .map((button) => mailButton(button.url, button.label, button.secondary ? "secondary" : "primary"))
              .join(' <span style="display:inline-block;width:8px"></span> ')}</div>`
          : "",
      ].join(""),
    )}${mailFooterRow(input.footer)}`,
  });

  return { subject: input.subject, text: text.join("\n"), html };
}

// -----------------------------------------------------------------------------
// Naar wie iets indiende
// -----------------------------------------------------------------------------

/** Meteen na het indienen: wat er nu gebeurt. */
export function palPlusRequestReceivedMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  kind: "GIVE" | "FOLLOW";
  courseLabel: string;
  description: string;
  /** Enkel bij een aanbod: het voorgestelde moment. */
  proposed: { startsAt: Date; endsAt: Date } | null;
  pageUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const give = input.kind === "GIVE";
  const boxText = [
    input.courseLabel,
    ...(give && input.proposed
      ? [
          `${nl ? "Voorgesteld moment" : "Proposed moment"}: ${palPlusMailMoment(input.proposed.startsAt, input.proposed.endsAt, input.locale)}`,
        ]
      : []),
    "",
    input.description,
  ].join("\n");
  return composeMail({
    locale: input.locale,
    subject: give
      ? nl
        ? `Je PAL+-aanbod is binnen: ${input.courseLabel}`
        : `We received your PAL+ offer: ${input.courseLabel}`
      : nl
        ? `Je PAL+-vraag is binnen: ${input.courseLabel}`
        : `We received your PAL+ request: ${input.courseLabel}`,
    heading: give ? (nl ? "We hebben je aanbod" : "We have your offer") : nl ? "We hebben je vraag" : "We have your request",
    greetingName: input.name,
    intro: give
      ? [
          nl
            ? "Bedankt om een PAL+-sessie te willen geven. VTK Onderwijs bekijkt je aanbod, plant de sessie en reserveert een lokaal. Het voorgestelde moment kan daarbij nog verschuiven."
            : "Thank you for offering to give a PAL+ session. VTK Onderwijs reviews your offer, plans the session and books a room. The proposed moment may still change.",
          nl
            ? "Je krijgt een mail zodra de sessie gepland is, of als het er niet van komt."
            : "You get an email once the session is planned, or if it does not go ahead.",
        ]
      : [
          nl
            ? "VTK Onderwijs kijkt je vraag na en zet ze dan zonder je naam op de PAL+-pagina. Daar kunnen medestudenten ze steunen en kan een tutor erop aanbieden."
            : "VTK Onderwijs reviews your request and then puts it on the PAL+ page without your name. There, fellow students can back it and a tutor can offer to give it.",
          nl ? "Je krijgt een mail zodra ze online staat." : "You get an email once it is online.",
        ],
    box: { label: give ? (nl ? "Je aanbod" : "Your offer") : nl ? "Je vraag" : "Your request", text: boxText },
    outro: [],
    buttons: [{ url: `${input.pageUrl}#jouw-aanvragen`, label: nl ? "Bekijk je aanvragen" : "View your requests" }],
    footer: give
      ? nl
        ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be een sessie aanbood."
        : "You received this email because you offered a session on the PAL+ page on vtk.be."
      : nl
        ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be hulp vroeg."
        : "You received this email because you asked for help on the PAL+ page on vtk.be.",
  });
}

/** Onderwijs keek een hulpvraag na en zette ze online. */
export function palPlusRequestPublishedMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  courseLabel: string;
  description: string;
  pageUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  return composeMail({
    locale: input.locale,
    subject: nl ? `Je PAL+-vraag staat online: ${input.courseLabel}` : `Your PAL+ request is online: ${input.courseLabel}`,
    heading: nl ? "Je vraag staat online" : "Your request is online",
    greetingName: input.name,
    intro: [
      nl
        ? "VTK Onderwijs keek je vraag na. Ze staat nu zonder je naam op de PAL+-pagina: medestudenten kunnen ze steunen en een tutor kan erop aanbieden."
        : "VTK Onderwijs reviewed your request. It is now on the PAL+ page without your name: fellow students can back it and a tutor can offer to give it.",
    ],
    box: { label: nl ? "Je vraag" : "Your request", text: `${input.courseLabel}\n\n${input.description}` },
    outro: [
      nl
        ? "Onderwijs zoekt mee naar een tutor. Zodra er een sessie gepland is, krijg je een mail."
        : "Onderwijs helps look for a tutor. Once a session is planned, you get an email.",
    ],
    buttons: [{ url: input.pageUrl, label: nl ? "Naar PAL+" : "Go to PAL+" }],
    footer: nl
      ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be hulp vroeg."
      : "You received this email because you asked for help on the PAL+ page on vtk.be.",
  });
}

/** Onderwijs sloot een aanvraag, met een reden. */
export function palPlusRequestClosedMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  kind: "GIVE" | "FOLLOW";
  /** Bij een vraag: stond ze al op de pagina, of werd ze bij het nakijken gesloten? */
  wasOnline: boolean;
  courseLabel: string;
  reason: string;
  pageUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const give = input.kind === "GIVE";
  const course = input.courseLabel;
  return composeMail({
    locale: input.locale,
    subject: give
      ? nl
        ? `Je PAL+-aanbod voor ${course}`
        : `Your PAL+ offer for ${course}`
      : nl
        ? `Je PAL+-vraag voor ${course}`
        : `Your PAL+ request for ${course}`,
    heading: give
      ? nl
        ? "Geen sessie voor je aanbod"
        : "No session for your offer"
      : input.wasOnline
        ? nl
          ? "Je vraag is gesloten"
          : "Your request is closed"
        : nl
          ? "Je vraag komt niet online"
          : "Your request will not be published",
    greetingName: input.name,
    intro: [
      give
        ? nl
          ? `VTK Onderwijs plant je aanbod voor ${course} niet in.`
          : `VTK Onderwijs will not plan your offer for ${course}.`
        : input.wasOnline
          ? nl
            ? `VTK Onderwijs sloot je vraag voor ${course}. Ze staat niet meer op de PAL+-pagina.`
            : `VTK Onderwijs closed your request for ${course}. It is no longer on the PAL+ page.`
          : nl
            ? `VTK Onderwijs zet je vraag voor ${course} niet op de PAL+-pagina.`
            : `VTK Onderwijs will not put your request for ${course} on the PAL+ page.`,
    ],
    box: { label: nl ? "Reden" : "Reason", text: input.reason },
    outro: [
      nl
        ? `Vragen hierover? Antwoord gewoon op deze mail. ${give ? "Een nieuw aanbod doen kan altijd." : "Een nieuwe vraag stellen kan altijd."}`
        : `Questions about this? Just reply to this email. ${give ? "You can always make a new offer." : "You can always post a new request."}`,
    ],
    buttons: [{ url: input.pageUrl, label: nl ? "Naar PAL+" : "Go to PAL+" }],
    footer: give
      ? nl
        ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be een sessie aanbood."
        : "You received this email because you offered a session on the PAL+ page on vtk.be."
      : nl
        ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be hulp vroeg."
        : "You received this email because you asked for help on the PAL+ page on vtk.be.",
  });
}

/** Er is een sessie gepland die een vraag beantwoordt: naar wie ze stelde en wie ze steunde. */
export function palPlusSessionForRequestMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  role: "asker" | "backer";
  session: PalPlusMailSession;
  pageUrl: string;
  calendarUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const asker = input.role === "asker";
  const course = input.session.courseLabel;
  return composeMail({
    locale: input.locale,
    subject: asker
      ? nl
        ? `Er is een PAL+-sessie voor je vraag: ${course}`
        : `There is a PAL+ session for your request: ${course}`
      : nl
        ? `Er is een PAL+-sessie voor ${course}`
        : `There is a PAL+ session for ${course}`,
    heading: asker
      ? nl
        ? "Er is een sessie voor je vraag"
        : "There is a session for your request"
      : nl
        ? "Er is een sessie voor een vraag die je steunde"
        : "There is a session for a request you backed",
    greetingName: input.name,
    intro: [
      asker
        ? nl
          ? "VTK Onderwijs plande een PAL+-sessie voor je vraag:"
          : "VTK Onderwijs planned a PAL+ session for your request:"
        : nl
          ? "VTK Onderwijs plande een PAL+-sessie voor een vraag die je steunde:"
          : "VTK Onderwijs planned a PAL+ session for a request you backed:",
    ],
    session: { value: input.session },
    notice: input.session.roomLabel
      ? undefined
      : {
          title: nl ? "Lokaal volgt" : "Room to be announced",
          text: nl
            ? "Het lokaal ligt nog niet vast. Schrijf je in, dan krijg je een mail zodra het bekend is."
            : "The room is not fixed yet. Sign up and you get an email once it is known.",
        },
    outro: [
      nl
        ? "Schrijf je in op de PAL+-pagina, zodat de tutor weet hoeveel mensen er komen. Inschrijven en uitschrijven kan tot de sessie begint."
        : "Sign up on the PAL+ page, so the tutor knows how many people are coming. You can sign up and cancel until the session starts.",
    ],
    buttons: [
      { url: input.pageUrl, label: nl ? "Inschrijven" : "Sign up" },
      { url: input.calendarUrl, label: nl ? "Zet in mijn agenda" : "Add to my calendar", secondary: true },
    ],
    footer: asker
      ? nl
        ? "Je krijgt deze mail omdat je via de PAL+-pagina op vtk.be hulp vroeg bij dit vak."
        : "You received this email because you asked for help with this course on the PAL+ page on vtk.be."
      : nl
        ? "Je krijgt deze mail omdat je deze vraag op de PAL+-pagina op vtk.be steunde."
        : "You received this email because you backed this request on the PAL+ page on vtk.be.",
  });
}

// -----------------------------------------------------------------------------
// Naar de tutors en de ingeschrevenen
// -----------------------------------------------------------------------------

function roleFooter(role: PalPlusMailRole, locale: PalPlusMailLocale): string {
  const nl = locale === "nl";
  return role === "tutor"
    ? nl
      ? "Je krijgt deze mail omdat je tutor bent van deze PAL+-sessie."
      : "You received this email because you are a tutor of this PAL+ session."
    : nl
      ? "Je krijgt deze mail omdat je ingeschreven bent voor deze PAL+-sessie."
      : "You received this email because you signed up for this PAL+ session.";
}

const ROOM_PENDING = {
  nl: { title: "Lokaal volgt", text: "Het lokaal ligt nog niet vast. Je krijgt een mail zodra het bekend is." },
  en: { title: "Room to be announced", text: "The room is not fixed yet. You get an email once it is known." },
} as const;

/** Iemand werd tutor van een sessie: bij het plannen, of later toegevoegd. */
export function palPlusTutorAssignedMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  session: PalPlusMailSession;
  /** De sessie kwam uit het aanbod van deze tutor. */
  fromOffer: boolean;
  /** Wat de sessie oplevert; nul (praesidium) laat de regel weg. */
  reward: number;
  /** De andere tutors van de sessie, zonder de ontvanger. */
  coTutorNames: string[];
  pageUrl: string;
  calendarUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const course = input.session.courseLabel;
  const others = input.coTutorNames;
  return composeMail({
    locale: input.locale,
    subject: nl
      ? `Je geeft een PAL+-sessie: ${course}, ${shortDate(input.session.startsAt, input.locale)}`
      : `You are giving a PAL+ session: ${course}, ${shortDate(input.session.startsAt, input.locale)}`,
    heading: nl ? "Je geeft een PAL+-sessie" : "You are giving a PAL+ session",
    greetingName: input.name,
    intro: [
      input.fromOffer
        ? nl
          ? "VTK Onderwijs aanvaardde je aanbod en plande de sessie:"
          : "VTK Onderwijs accepted your offer and planned the session:"
        : nl
          ? "VTK Onderwijs plande een PAL+-sessie met jou als tutor:"
          : "VTK Onderwijs planned a PAL+ session with you as tutor:",
    ],
    session: { value: input.session },
    pill:
      input.reward > 0
        ? nl
          ? `${vouchers(input.reward, input.locale)} na de sessie`
          : `${vouchers(input.reward, input.locale)} after the session`
        : undefined,
    notice: input.session.roomLabel ? undefined : ROOM_PENDING[input.locale],
    outro: [
      ...(others.length > 0
        ? [nl ? `Je geeft de sessie samen met ${joinNames(others, input.locale)}.` : `You give the session together with ${joinNames(others, input.locale)}.`]
        : []),
      nl
        ? "Op de PAL+-pagina zie je wie er ingeschreven is, en na de sessie duid je daar aan wie er kwam."
        : "On the PAL+ page you see who signed up, and after the session you mark there who came.",
      nl
        ? "Kan je toch niet? Laat het dan meteen weten aan VTK Onderwijs door op deze mail te antwoorden."
        : "Can you not make it after all? Let VTK Onderwijs know right away by replying to this email.",
    ],
    buttons: [
      { url: input.pageUrl, label: nl ? "Bekijk de sessie" : "View the session" },
      { url: input.calendarUrl, label: nl ? "Zet in mijn agenda" : "Add to my calendar", secondary: true },
    ],
    footer: nl
      ? "Je krijgt deze mail omdat VTK Onderwijs je als tutor op deze PAL+-sessie zette."
      : "You received this email because VTK Onderwijs made you a tutor of this PAL+ session.",
  });
}

export type PalPlusSessionChange = {
  /** Het oude moment, wanneer het verschoof. */
  previousMoment?: { startsAt: Date; endsAt: Date };
  /** Het oude lokaal (`null`: lag nog niet vast), wanneer het veranderde. */
  previousRoom?: { label: string | null };
};

/** Het moment of het lokaal van een geplande sessie veranderde. */
export function palPlusSessionChangedMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  role: PalPlusMailRole;
  session: PalPlusMailSession;
  change: PalPlusSessionChange;
  pageUrl: string;
  calendarUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const { session, change } = input;
  const course = session.courseLabel;
  const date = shortDate(session.startsAt, input.locale);
  const moved = Boolean(change.previousMoment);
  const roomKnown = !moved && change.previousRoom?.label === null && session.roomLabel !== null;

  const subject = moved
    ? nl
      ? `Verplaatst: PAL+ ${course}`
      : `Moved: PAL+ ${course}`
    : roomKnown
      ? nl
        ? `Lokaal bekend: PAL+ ${course}, ${date}`
        : `Room announced: PAL+ ${course}, ${date}`
      : nl
        ? `Ander lokaal: PAL+ ${course}, ${date}`
        : `Room changed: PAL+ ${course}, ${date}`;

  const intro: string[] = [];
  if (moved) {
    intro.push(nl ? "VTK Onderwijs verzette je PAL+-sessie. Het nieuwe moment:" : "VTK Onderwijs moved your PAL+ session. The new moment:");
  }
  if (change.previousRoom) {
    if (session.roomLabel === null) {
      intro.push(
        nl
          ? "Het lokaal ligt opnieuw niet vast. Je krijgt een mail zodra het bekend is."
          : "The room is no longer fixed. You get an email once it is known.",
      );
    } else if (change.previousRoom.label === null) {
      intro.push(nl ? `Het lokaal is bekend: ${session.roomLabel}.` : `The room is known: ${session.roomLabel}.`);
    } else {
      intro.push(
        nl
          ? `De sessie gaat nu door in ${session.roomLabel} (eerst ${change.previousRoom.label}).`
          : `The session now takes place in ${session.roomLabel} (previously ${change.previousRoom.label}).`,
      );
    }
  }

  const outro: string[] = [];
  if (moved) {
    outro.push(
      input.role === "tutor"
        ? nl
          ? "Past het nieuwe moment niet? Laat het dan meteen weten aan VTK Onderwijs door op deze mail te antwoorden."
          : "Does the new moment not suit you? Let VTK Onderwijs know right away by replying to this email."
        : nl
          ? "Past het nieuwe moment niet? Schrijf je dan uit op de PAL+-pagina, zodat je plaats vrijkomt."
          : "Does the new moment not suit you? Cancel your sign-up on the PAL+ page, so your place frees up.",
      nl
        ? "Zette je de sessie in je agenda, voeg ze dan opnieuw toe met de knop hieronder: dat vervangt de oude afspraak."
        : "If you added the session to your calendar, add it again with the button below: that replaces the old entry.",
    );
  }

  return composeMail({
    locale: input.locale,
    subject,
    heading: moved
      ? nl
        ? "Je PAL+-sessie is verplaatst"
        : "Your PAL+ session has moved"
      : roomKnown
        ? nl
          ? "Het lokaal is bekend"
          : "The room is known"
        : nl
          ? "Je PAL+-sessie heeft een ander lokaal"
          : "Your PAL+ session has a different room",
    greetingName: input.name,
    intro,
    session: {
      value: session,
      note: change.previousMoment
        ? nl
          ? `eerst ${palPlusMailMoment(change.previousMoment.startsAt, change.previousMoment.endsAt, input.locale)}`
          : `previously ${palPlusMailMoment(change.previousMoment.startsAt, change.previousMoment.endsAt, input.locale)}`
        : undefined,
    },
    outro,
    buttons: [
      { url: input.pageUrl, label: nl ? "Bekijk de sessie" : "View the session" },
      { url: input.calendarUrl, label: nl ? "Zet in mijn agenda" : "Add to my calendar", secondary: true },
    ],
    footer: roleFooter(input.role, input.locale),
  });
}

/** De dag voor de sessie. */
export function palPlusSessionReminderMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  role: PalPlusMailRole;
  session: PalPlusMailSession;
  /** Enkel voor een tutor: hoeveel mensen er ingeschreven zijn. */
  attendeeCount: number;
  pageUrl: string;
  calendarUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const tutor = input.role === "tutor";
  const count = input.attendeeCount;
  return composeMail({
    locale: input.locale,
    subject: nl ? `Morgen: PAL+ ${input.session.courseLabel}` : `Tomorrow: PAL+ ${input.session.courseLabel}`,
    heading: tutor ? (nl ? "Morgen geef je PAL+" : "You give PAL+ tomorrow") : nl ? "Morgen heb je PAL+" : "PAL+ tomorrow",
    greetingName: input.name,
    intro: [
      tutor
        ? nl
          ? `Een herinnering: morgen geef je een PAL+-sessie. ${
              count === 0 ? "Er is nog niemand ingeschreven." : count === 1 ? "Er is 1 persoon ingeschreven." : `Er zijn ${count} mensen ingeschreven.`
            }`
          : `A reminder: you give a PAL+ session tomorrow. ${
              count === 0 ? "Nobody has signed up yet." : count === 1 ? "1 person has signed up." : `${count} people have signed up.`
            }`
        : nl
          ? "Een herinnering: morgen heb je een PAL+-sessie."
          : "A reminder: you have a PAL+ session tomorrow.",
    ],
    session: { value: input.session },
    notice: input.session.roomLabel
      ? undefined
      : {
          title: nl ? "Lokaal volgt" : "Room to be announced",
          text: nl
            ? "Het lokaal ligt nog niet vast. Kijk vlak voor de sessie op de PAL+-pagina."
            : "The room is not fixed yet. Check the PAL+ page just before the session.",
        },
    outro: [
      tutor
        ? nl
          ? "Na de sessie duid je op de PAL+-pagina aan wie er kwam."
          : "After the session, mark on the PAL+ page who came."
        : nl
          ? "Kan je toch niet? Schrijf je dan uit op de PAL+-pagina, zodat je plaats vrijkomt."
          : "Can you not make it after all? Cancel your sign-up on the PAL+ page, so your place frees up.",
    ],
    buttons: [{ url: input.pageUrl, label: nl ? "Bekijk de sessie" : "View the session" }],
    footer: roleFooter(input.role, input.locale),
  });
}

/** Onderwijs annuleerde een sessie die nog moest beginnen. */
export function palPlusSessionCancelledMail(input: {
  locale: PalPlusMailLocale;
  name: string;
  role: PalPlusMailRole;
  session: PalPlusMailSession;
  reason: string;
  pageUrl: string;
}): PalPlusMail {
  const nl = input.locale === "nl";
  const course = input.session.courseLabel;
  return composeMail({
    locale: input.locale,
    subject: nl
      ? `Geannuleerd: PAL+ ${course}, ${shortDate(input.session.startsAt, input.locale)}`
      : `Cancelled: PAL+ ${course}, ${shortDate(input.session.startsAt, input.locale)}`,
    heading: nl ? "Deze PAL+-sessie gaat niet door" : "This PAL+ session is cancelled",
    greetingName: input.name,
    intro: [nl ? "VTK Onderwijs annuleerde de sessie:" : "VTK Onderwijs cancelled the session:"],
    session: { value: input.session },
    box: { label: nl ? "Reden" : "Reason", text: input.reason },
    outro: [
      input.role === "tutor"
        ? nl
          ? "Je hoeft niets te doen. Vragen hierover? Antwoord gewoon op deze mail."
          : "You do not need to do anything. Questions about this? Just reply to this email."
        : nl
          ? "Je hoeft niets te doen. Plant Onderwijs een nieuwe sessie, dan staat die op de PAL+-pagina."
          : "You do not need to do anything. If Onderwijs plans a new session, it appears on the PAL+ page.",
    ],
    buttons: [{ url: input.pageUrl, label: nl ? "Naar PAL+" : "Go to PAL+" }],
    footer: roleFooter(input.role, input.locale),
  });
}

// -----------------------------------------------------------------------------
// Naar VTK Onderwijs
// -----------------------------------------------------------------------------

/**
 * Een nieuwe aanvraag, naar het adres van Onderwijs. Enkel in het Nederlands:
 * het is interne post, zoals de melding van een nieuwe verhuuraanvraag.
 */
export function palPlusNewRequestNotificationMail(input: {
  kind: "GIVE" | "FOLLOW";
  submitterName: string;
  submitterEmail: string;
  courseLabel: string;
  /** Het vak werd ingetikt en hangt nog niet aan een vak uit de lijst. */
  courseTyped: boolean;
  description: string;
  proposed: { startsAt: Date; endsAt: Date } | null;
  preferredPeriod: string | null;
  /** Bij "ik kan dit geven": de vraag waarop het aanbod antwoordt. */
  respondsToLabel: string | null;
  adminUrl: string;
}): PalPlusMail {
  const give = input.kind === "GIVE";
  return composeMail({
    locale: "nl",
    subject: give
      ? `[PAL+] Nieuw aanbod: ${input.courseLabel} (${input.submitterName})`
      : `[PAL+] Nieuwe hulpvraag: ${input.courseLabel} (${input.submitterName})`,
    heading: give ? "Nieuw aanbod voor PAL+" : "Nieuwe hulpvraag voor PAL+",
    intro: [
      give
        ? `${input.submitterName} wil een PAL+-sessie geven.`
        : `${input.submitterName} vraagt hulp bij een vak. De vraag staat pas op de PAL+-pagina wanneer je ze nakijkt en online zet.`,
    ],
    facts: [
      { label: "Vak", value: input.courseTyped ? `${input.courseLabel} (zelf ingetikt, nog geen vak uit de lijst)` : input.courseLabel },
      { label: "Wie", value: input.submitterName },
      { label: "E-mail", value: input.submitterEmail },
      ...(give && input.proposed
        ? [{ label: "Voorgesteld", value: palPlusMailMoment(input.proposed.startsAt, input.proposed.endsAt, "nl") }]
        : []),
      ...(!give && input.preferredPeriod ? [{ label: "Wanneer nodig", value: input.preferredPeriod }] : []),
      ...(input.respondsToLabel ? [{ label: "Antwoord op", value: input.respondsToLabel }] : []),
    ],
    box: { label: give ? "Wat de tutor wil behandelen" : "Waarmee de student hulp zoekt", text: input.description },
    outro: ["Antwoorden op deze mail gaat rechtstreeks naar de indiener."],
    buttons: [{ url: input.adminUrl, label: "Naar het werkbakje" }],
    footer: "Elke nieuwe PAL+-aanvraag komt binnen op het adres van VTK Onderwijs.",
  });
}
