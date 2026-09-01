/**
 * De mails rond een verhuuraanvraag: de instellingen, welke sjablonen er zijn,
 * wat er in de plaats van de placeholders komt, en de teksten waarmee we starten.
 *
 * Puur, dus testbaar zonder mailserver. Het versturen zelf staat in
 * `lib/theokotVerhuur-server.ts`.
 *
 * Waarom sjablonen en geen vaste teksten in code: dit waren mails die iemand
 * elke keer opnieuw uit een oud bericht kopieerde, en die tekst schuift elk jaar
 * op. Wie de verhuur doet, moet ze kunnen aanpassen zonder een deploy. Ze staan
 * in `Setting` onder `theokot.rental.mail`, met de teksten hieronder als terugval.
 */

import type { DepositChoice, RenterType } from "@/lib/theokotVerhuur";

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

/**
 * Instellingen van de verhuur, beheerd in /admin/theokot/verhuur.
 *
 * `notifyEmails` zijn de mensen die de aanvragen behandelen: zij krijgen de
 * melding met de knoppen "Goedkeuren" en "Weigeren" erin. `replyTo` is het adres
 * waar een antwoord van de aanvrager toekomt; zonder dat zou "Beantwoorden" bij
 * de afzender van de server belanden.
 */
export type RentalConfig = {
  notifyEmails: string[];
  replyTo: string;
  signature: string;
  /**
   * Hoeveel dagen op voorhand een aanvraag minstens binnen moet zijn. Nul laat
   * alles toe; dat was in het Google Form ook zo, maar wie de verhuur doet mag
   * die drempel zelf leggen.
   */
  minLeadDays: number;
  /** Uit = het publieke formulier neemt niets meer aan (bv. tijdens de examens). */
  formOpen: boolean;
  /** Wat er op de gesloten pagina staat. Leeg = de standaardzin. */
  closedNoticeNl: string;
  closedNoticeEn: string;
};

export const DEFAULT_RENTAL_CONFIG: RentalConfig = {
  notifyEmails: ["theokot@vtk.be"],
  replyTo: "theokot@vtk.be",
  signature: "Theokot\ntheokot@vtk.be",
  minLeadDays: 0,
  formOpen: true,
  closedNoticeNl: "",
  closedNoticeEn: "",
};

export function parseRentalConfig(value: unknown): RentalConfig {
  const stored = (value ?? {}) as Partial<RentalConfig> & { notifyEmail?: unknown };
  const notify = Array.isArray(stored.notifyEmails)
    ? stored.notifyEmails.map((entry) => String(entry).trim()).filter(Boolean)
    : typeof stored.notifyEmail === "string"
      ? splitEmails(stored.notifyEmail)
      : [];

  return {
    notifyEmails: notify.length > 0 ? notify : DEFAULT_RENTAL_CONFIG.notifyEmails,
    replyTo:
      typeof stored.replyTo === "string" && stored.replyTo.trim()
        ? stored.replyTo.trim()
        : (notify[0] ?? DEFAULT_RENTAL_CONFIG.replyTo),
    signature:
      typeof stored.signature === "string" && stored.signature.trim()
        ? stored.signature
        : DEFAULT_RENTAL_CONFIG.signature,
    minLeadDays: clampLeadDays(stored.minLeadDays),
    formOpen: stored.formOpen !== false,
    closedNoticeNl: typeof stored.closedNoticeNl === "string" ? stored.closedNoticeNl : "",
    closedNoticeEn: typeof stored.closedNoticeEn === "string" ? stored.closedNoticeEn : "",
  };
}

/** Adressen uit één veld: komma's, puntkomma's, spaties en regels mogen allemaal. */
export function splitEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

/** Meer dan een half jaar op voorhand eisen is geen drempel meer maar een muur. */
export const RENTAL_LEAD_MAX = 180;

export function clampLeadDays(value: unknown): number {
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(days)) return DEFAULT_RENTAL_CONFIG.minLeadDays;
  return Math.min(RENTAL_LEAD_MAX, Math.max(0, Math.round(days)));
}

// -----------------------------------------------------------------------------
// De richtlijnen en de handleiding
// -----------------------------------------------------------------------------

/**
 * De tekst naast het formulier (voor wie huurt) en de tekst in het beheer (voor
 * wie de aanvragen behandelt). Allebei markdown, allebei door Theokot zelf te
 * schrijven.
 *
 * De richtlijnen stonden vroeger verspreid over de vraagteksten van het Google
 * Form en een mail met "sla deze mail op". Een pagina doet dat beter, en de
 * handleiding houdt de kennis van dit jaar bij voor wie het volgend jaar doet.
 */
export type RentalGuide = {
  guidelinesNl: string;
  guidelinesEn: string;
  handbook: string;
};

export const DEFAULT_RENTAL_GUIDE: RentalGuide = {
  guidelinesNl: [
    "## Voor je aanvraagt",
    "",
    "- De **verantwoordelijke** moet op het moment van de aanvraag student zijn aan de Faculteit Ingenieurswetenschappen. Alumni tellen niet mee; ereleden van VTK wel.",
    "- Die verantwoordelijke tekent het huurcontract en wordt tijdens het **hele** evenement in het Theokot verwacht.",
    "- Op weekdagen is de zaal ten vroegste vrij vanaf 18u00.",
    "- Vermeld bij het einduur ook de tijd die je nodig hebt om te kuisen.",
    "",
    "## Wat mag en wat niet",
    "",
    "- Het Theokot is niet voor openbare evenementen en niet voor activiteiten met winstoogmerk. Vraag je inkom, dan mag dat enkel om je kosten te dekken.",
    "- Posten en werkgroepen van VTK vallen buiten die regel. Zij zetten hun groep tussen vierkante haakjes vooraan bij de aard van de activiteit, bijvoorbeeld \"[Theokot] Kaas- en wijnavond\".",
    "- Is de zaal die dag al gereserveerd, dan wordt je aanvraag geweigerd. De enige uitzondering is een aanvraag van een post of werkgroep van VTK.",
    "",
    "## Na je aanvraag",
    "",
    "1. Je krijgt meteen een bevestiging dat je aanvraag binnen is.",
    "2. Wij laten je weten of ze goedgekeurd is; dat antwoord komt op het adres dat je hier invult.",
    "3. Bij een goedkeuring krijg je het huurcontract mee. Dat teken je voor je de sleutel krijgt.",
    "4. Betaal je de waarborg met een overschrijving, dan volgen de instructies bij de goedkeuring. Cash betaal je bij het ophalen van de sleutel.",
  ].join("\n"),
  guidelinesEn: [
    "## Before you apply",
    "",
    "- The **person in charge** has to be a student at the Faculty of Engineering Science at the time of the request. Alumni do not count; honorary members of VTK do.",
    "- That person signs the rental contract and is expected to be present at Theokot during the **entire** event.",
    "- On weekdays the room is available from 18:00 at the earliest.",
    "- When filling in the ending hour, include the time you need to clean the room.",
    "",
    "## What is allowed",
    "",
    "- Theokot is not for public events and not for events with a profit motive. If you charge admission, it may only cover your costs.",
    "- Posts and work groups of VTK are exempt from that rule. They start the type of activity with their group in square brackets, for example \"[Theokot] Cheese and wine night\".",
    "- If the room is already booked that day, your request will be denied. The only exception is a request from a post or work group of VTK.",
    "",
    "## After your request",
    "",
    "1. You get a confirmation straight away that your request arrived.",
    "2. We let you know whether it is approved; that answer goes to the address you fill in here.",
    "3. On approval you receive the rental contract. You sign it before you get the key.",
    "4. If you pay the deposit by wire transfer, the instructions follow with the approval. Cash is paid when you pick up the key.",
  ].join("\n"),
  handbook: [
    "## Een aanvraag behandelen",
    "",
    "1. Kijk bij **Aanvragen** of de datum vrij is. Botst ze met een andere aanvraag, dan staat dat bovenaan het paneel.",
    "2. Zet **Intern of extern** juist voor je antwoordt: daar hangt aan welk huurcontract er meegaat.",
    "3. Kies een sjabloon, lees de mail na en verstuur ze. De status volgt de knop die je gebruikt.",
    "4. Zet daarna **Waarborg**, **Contract** en **Sleutel** bij zodra er iets verandert. Die drie staan los van de status.",
    "",
    "## De knoppen in de meldingsmail",
    "",
    "Wie de melding van een nieuwe aanvraag krijgt, kan er meteen op goedkeuren of",
    "weigeren. Die knop opent een bevestigingsscherm; daar staat welke mail er",
    "vertrekt, en er staat een tweede knop die enkel de status zet zonder te mailen.",
    "",
    "## Aan het einde",
    "",
    "Zet een verhuur op **Afgerond** wanneer de sleutel terug is en de waarborg",
    "geregeld. Zo blijft de lijst met openstaand werk kort.",
  ].join("\n"),
};

export function parseRentalGuide(value: unknown): RentalGuide {
  const stored = (value ?? {}) as Partial<RentalGuide>;
  return {
    guidelinesNl:
      typeof stored.guidelinesNl === "string" ? stored.guidelinesNl : DEFAULT_RENTAL_GUIDE.guidelinesNl,
    guidelinesEn:
      typeof stored.guidelinesEn === "string" ? stored.guidelinesEn : DEFAULT_RENTAL_GUIDE.guidelinesEn,
    handbook: typeof stored.handbook === "string" ? stored.handbook : DEFAULT_RENTAL_GUIDE.handbook,
  };
}

// -----------------------------------------------------------------------------
// De sjablonen
// -----------------------------------------------------------------------------

/**
 * Waar een sjabloon voor dient. `decision` bepaalt welke status de knop naast het
 * sjabloon zet, en welk sjabloon de knop in de meldingsmail voorstelt.
 */
export type RentalTemplateCategory = "confirmation" | "approved" | "rejected" | "other";

export type RentalTemplate = {
  id: string;
  name: string;
  category: RentalTemplateCategory;
  lang: "nl" | "en";
  subject: string;
  body: string;
  /**
   * Hangt het huurcontract als pdf onder deze mail? Het contract dat meegaat
   * volgt uit de aanvraag zelf (intern of extern, en haar taal), niet uit het
   * sjabloon; anders zou een sjabloon per combinatie nodig zijn.
   */
  attachContract: boolean;
  /** Een standaardsjabloon kan je bewerken maar niet verwijderen. */
  isDefault: boolean;
};

export const RENTAL_PLACEHOLDERS = [
  "naam",
  "datum",
  "startuur",
  "einduur",
  "reden",
  "aantal",
  "waarborg",
  "opmerkingen",
  "motivatie",
  "ondertekening",
] as const;
export type RentalPlaceholder = (typeof RENTAL_PLACEHOLDERS)[number];
export type RentalTemplateVars = Partial<Record<RentalPlaceholder, string>>;

/**
 * Vult `{placeholder}` in. Een onbekende placeholder blijft staan in plaats van
 * te verdwijnen: zo ziet wie de mail nakijkt dat er een tikfout in het sjabloon
 * staat, terwijl een leeggemaakte plek onopgemerkt de deur uit gaat.
 */
export function renderRentalTemplate(text: string, vars: RentalTemplateVars): string {
  return text.replace(/\{([a-z]+)\}/gi, (match, name: string) => {
    const value = vars[name.toLowerCase() as RentalPlaceholder];
    return value === undefined ? match : value;
  });
}

/** Wat er over een aanvraag in een mail terechtkomt; al geformatteerd. */
export type RentalMailFacts = {
  responsibleName: string;
  mailDate: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendees: number | null;
  depositChoice: DepositChoice;
  depositLabel: string;
  remarks: string | null;
  decisionNote: string | null;
};

export function rentalMailVars(facts: RentalMailFacts, signature: string): RentalTemplateVars {
  return {
    naam: facts.responsibleName,
    datum: facts.mailDate,
    startuur: facts.startTime,
    einduur: facts.endTime,
    reden: facts.purpose,
    aantal: facts.attendees === null ? "" : String(facts.attendees),
    waarborg: facts.depositLabel,
    opmerkingen: facts.remarks?.trim() || "",
    motivatie: facts.decisionNote?.trim() || "",
    ondertekening: signature,
  };
}

/**
 * Voorbeeldwaarden voor het mailvoorbeeld in het beheer.
 *
 * Een sjabloon bewerk je met `{plaatshouders}` in beeld, en dat is precies niet
 * wat de huurder krijgt. Deze waarden vullen het voorbeeld zodat je de echte zin
 * leest; ze zijn herkenbaar verzonnen, want een voorbeeld met een echte naam
 * erin leest als een verstuurde mail.
 */
export function previewRentalVars(locale: "nl" | "en", signature: string): RentalTemplateVars {
  const nl = locale === "nl";
  return {
    naam: nl ? "Jonas Voorbeeld" : "Jonas Example",
    datum: nl ? "vrijdag 3 oktober 2025" : "Friday 3 October 2025",
    startuur: "20:00",
    einduur: "02:00",
    reden: nl ? "Kaas- en wijnavond met de vrienden" : "Cheese and wine night with friends",
    aantal: "45",
    waarborg: nl ? "Overschrijving" : "Wire transfer",
    opmerkingen: nl
      ? "We brengen zelf een geluidsinstallatie mee en gebruiken het pleintje niet."
      : "We are bringing our own sound system and will not use the terrain outside.",
    motivatie: nl
      ? "De zaal is die avond al gereserveerd door een post van VTK."
      : "The room is already booked that evening by a post of VTK.",
    ondertekening: signature,
  };
}

export function renderRentalMail(
  template: Pick<RentalTemplate, "subject" | "body">,
  vars: RentalTemplateVars,
): { subject: string; body: string } {
  return {
    subject: renderRentalTemplate(template.subject, vars).replace(/\s+/g, " ").trim(),
    body: renderRentalTemplate(template.body, vars),
  };
}

const SIGNATURE = "{ondertekening}";

/**
 * De basisteksten. Per taal een eigen sjabloon in plaats van één tweetalige:
 * de aanvrager koos in het formulier zelf hoe hij aangesproken wil worden, en
 * dan is een mail met twee versies onder elkaar precies wat we niet meer doen.
 */
export const DEFAULT_RENTAL_TEMPLATES: RentalTemplate[] = [
  {
    id: "confirmationNl",
    name: "Ontvangstbevestiging · NL",
    category: "confirmation",
    lang: "nl",
    attachContract: false,
    isDefault: true,
    subject: "Je aanvraag voor het Theokot op {datum}",
    body: [
      "Beste {naam},",
      "",
      "We ontvingen je aanvraag om het Theokot te gebruiken op {datum} van {startuur} tot {einduur}.",
      "",
      "Wat je aanvroeg:",
      "- Aard van de activiteit: {reden}",
      "- Aantal aanwezigen: {aantal}",
      "- Waarborg: {waarborg}",
      "",
      "We bekijken je aanvraag en laten je zo snel mogelijk weten of ze goedgekeurd is. Je hoeft voorlopig niets te doen; antwoord gerust op deze mail als er iets veranderd is aan je plannen.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "confirmationEn",
    name: "Ontvangstbevestiging · EN",
    category: "confirmation",
    lang: "en",
    attachContract: false,
    isDefault: true,
    subject: "Your request for Theokot on {datum}",
    body: [
      "Dear {naam},",
      "",
      "We received your request to use Theokot on {datum} from {startuur} to {einduur}.",
      "",
      "What you requested:",
      "- Type of activity: {reden}",
      "- Number of people: {aantal}",
      "- Deposit: {waarborg}",
      "",
      "We will review your request and let you know as soon as possible whether it is approved. There is nothing you need to do for now; feel free to reply to this email if your plans change.",
      "",
      "Kind regards,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "approvedNl",
    name: "Goedgekeurd · NL",
    category: "approved",
    lang: "nl",
    attachContract: true,
    isDefault: true,
    subject: "Goedgekeurd: het Theokot op {datum}",
    body: [
      "Beste {naam},",
      "",
      "Goed nieuws: je aanvraag om het Theokot te gebruiken op {datum} van {startuur} tot {einduur} is goedgekeurd.",
      "{motivatie}",
      "",
      "In bijlage vind je het huurcontract. Lees het na, onderteken het als verantwoordelijke en bezorg het ons terug voor je de sleutel komt ophalen.",
      "",
      "Je koos als waarborg: {waarborg}. Betaal je met een overschrijving, dan bezorgen we je de gegevens; betaal je cash, dan doe je dat bij het ophalen van de sleutel.",
      "",
      "Denk eraan dat de verantwoordelijke tijdens het hele evenement aanwezig moet zijn, en dat de zaal gekuist wordt binnen het uur dat je opgaf.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "approvedEn",
    name: "Goedgekeurd · EN",
    category: "approved",
    lang: "en",
    attachContract: true,
    isDefault: true,
    subject: "Approved: Theokot on {datum}",
    body: [
      "Dear {naam},",
      "",
      "Good news: your request to use Theokot on {datum} from {startuur} to {einduur} has been approved.",
      "{motivatie}",
      "",
      "You will find the rental contract attached. Read it, sign it as the person in charge and return it to us before you pick up the key.",
      "",
      "You chose the following deposit: {waarborg}. If you pay by wire transfer we will send you the details; if you pay cash, you do so when picking up the key.",
      "",
      "Remember that the person in charge has to be present during the entire event, and that the room is cleaned within the hour you filled in.",
      "",
      "Kind regards,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "rejectedNl",
    name: "Geweigerd · NL",
    category: "rejected",
    lang: "nl",
    attachContract: false,
    isDefault: true,
    subject: "Je aanvraag voor het Theokot op {datum}",
    body: [
      "Beste {naam},",
      "",
      "Helaas kunnen we je aanvraag om het Theokot te gebruiken op {datum} van {startuur} tot {einduur} niet goedkeuren.",
      "",
      "{motivatie}",
      "",
      "Wil je op een andere datum langskomen, dien dan gerust een nieuwe aanvraag in.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "rejectedEn",
    name: "Geweigerd · EN",
    category: "rejected",
    lang: "en",
    attachContract: false,
    isDefault: true,
    subject: "Your request for Theokot on {datum}",
    body: [
      "Dear {naam},",
      "",
      "Unfortunately we cannot approve your request to use Theokot on {datum} from {startuur} to {einduur}.",
      "",
      "{motivatie}",
      "",
      "If you would like to come on another date, feel free to submit a new request.",
      "",
      "Kind regards,",
      SIGNATURE,
    ].join("\n"),
  },
];

/** Leest de sjablonen uit `Setting` en vult aan met de standaardteksten. */
export function parseRentalTemplates(value: unknown): RentalTemplate[] {
  const stored = value && typeof value === "object" && "items" in (value as object)
    ? (value as { items: unknown }).items
    : value;
  if (!Array.isArray(stored)) return DEFAULT_RENTAL_TEMPLATES;

  const items: RentalTemplate[] = [];
  const seen = new Set<string>();

  for (const raw of stored) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<RentalTemplate>;
    const id = String(entry.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    const fallback = DEFAULT_RENTAL_TEMPLATES.find((item) => item.id === id);
    const subject = typeof entry.subject === "string" && entry.subject.trim() ? entry.subject : fallback?.subject;
    const body = typeof entry.body === "string" && entry.body.trim() ? entry.body : fallback?.body;
    if (!subject || !body) continue;

    seen.add(id);
    items.push({
      id,
      name: (typeof entry.name === "string" && entry.name.trim()) || fallback?.name || id,
      category: isCategory(entry.category) ? entry.category : (fallback?.category ?? "other"),
      lang: entry.lang === "en" ? "en" : "nl",
      subject,
      body,
      attachContract:
        typeof entry.attachContract === "boolean"
          ? entry.attachContract
          : (fallback?.attachContract ?? false),
      isDefault: Boolean(fallback),
    });
  }

  // Een standaardsjabloon dat iemand uit de opslag wist, komt terug: de knoppen
  // in het beheer en in de meldingsmail rekenen erop dat er altijd één
  // goedkeurings- en één weigeringssjabloon per taal is.
  for (const fallback of DEFAULT_RENTAL_TEMPLATES) {
    if (!seen.has(fallback.id)) items.push(fallback);
  }

  return items;
}

function isCategory(value: unknown): value is RentalTemplateCategory {
  return value === "confirmation" || value === "approved" || value === "rejected" || value === "other";
}

/**
 * Het sjabloon dat standaard voorgesteld wordt voor deze uitkomst en deze taal.
 * Valt terug op het Nederlandse, en daarna op het eerste van die categorie.
 */
export function defaultTemplateFor(
  templates: readonly RentalTemplate[],
  category: RentalTemplateCategory,
  locale: "nl" | "en",
): RentalTemplate | null {
  const inCategory = templates.filter((item) => item.category === category);
  return (
    inCategory.find((item) => item.lang === locale) ??
    inCategory.find((item) => item.lang === "nl") ??
    inCategory[0] ??
    null
  );
}

/** Welk huurcontract er bij deze aanvraag hoort. */
export function contractKeyFor(renterType: RenterType, locale: "nl" | "en"): string {
  return `${renterType}:${locale}`;
}
