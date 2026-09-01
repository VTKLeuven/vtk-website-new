/**
 * Theokot-verhuur, los van React, Next en Prisma.
 *
 * Alles hier is puur: de vier opvolgvelden met hun labels, de vragenlijst van
 * het publieke formulier, en de controle van een ingediende aanvraag. Zo is de
 * logica te testen zonder een render, een request of een mailserver
 * (test/theokotVerhuur.test.ts); `lib/theokotVerhuur-server.ts` doet het I/O-werk.
 *
 * Bevat geen server-only imports: het publieke formulier is een client component
 * en gebruikt dezelfde vragenlijst en dezelfde limieten.
 */

import { isValidEmail, toMessageText, toSingleLine } from "@/lib/contactForm";

// -----------------------------------------------------------------------------
// De vier opvolgvelden
// -----------------------------------------------------------------------------

export const RENTAL_STATUSES = [
  "UNANSWERED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "ENDED",
  "COMPLETED",
] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const DEPOSIT_STATES = [
  "NVT",
  "TRANSFER",
  "CASH",
  "TRANSFER_IN",
  "CASH_IN",
  "TRANSFER_BACK",
  "CASH_BACK",
  "PROBLEM",
] as const;
export type DepositState = (typeof DEPOSIT_STATES)[number];

export const CONTRACT_STATES = ["PENDING", "SIGNED", "NVT"] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];

export const KEY_STATES = ["PENDING", "GIVEN", "RETURNED", "NVT"] as const;
export type KeyState = (typeof KEY_STATES)[number];

export const RENTER_TYPES = ["INTERNAL", "EXTERNAL"] as const;
export type RenterType = (typeof RENTER_TYPES)[number];

export const DEPOSIT_CHOICES = ["TRANSFER", "CASH", "NVT"] as const;
export type DepositChoice = (typeof DEPOSIT_CHOICES)[number];

type Label = { nl: string; en: string };

/**
 * Label en toon per status. `tone` stuurt de kleur van het blokje in de kalender
 * en van de badge in de lijst: een goedgekeurde verhuur staat er vol op, een
 * aanvraag die nog wacht dof, zodat je in één blik ziet wat vastligt en wat niet.
 */
export const RENTAL_STATUS_META: Record<
  RentalStatus,
  Label & { tone: "waiting" | "ok" | "no" | "done" }
> = {
  UNANSWERED: { nl: "Onbeantwoord", en: "Unanswered", tone: "waiting" },
  APPROVED: { nl: "Goedgekeurd", en: "Approved", tone: "ok" },
  REJECTED: { nl: "Geweigerd", en: "Denied", tone: "no" },
  CANCELLED: { nl: "Geannuleerd", en: "Cancelled", tone: "no" },
  ENDED: { nl: "Afgelopen", en: "Ended", tone: "done" },
  COMPLETED: { nl: "Afgerond", en: "Completed", tone: "done" },
};

/**
 * De waarborgkolom uit de Sheet. "OS" is een overschrijving, "C" is cash;
 * "binnen" is ontvangen, "terug" is teruggestort of teruggegeven. De twee
 * bovenste zijn wat de aanvrager koos maar nog niet betaalde.
 */
export const DEPOSIT_STATE_META: Record<DepositState, Label> = {
  NVT: { nl: "NVT", en: "N/A" },
  TRANSFER: { nl: "Overschrijving", en: "Wire transfer" },
  CASH: { nl: "Cash", en: "Cash" },
  TRANSFER_IN: { nl: "OS Binnen", en: "Transfer received" },
  CASH_IN: { nl: "C Binnen", en: "Cash received" },
  TRANSFER_BACK: { nl: "OS Terug", en: "Transfer returned" },
  CASH_BACK: { nl: "C Terug", en: "Cash returned" },
  PROBLEM: { nl: "Probleem", en: "Problem" },
};

export const CONTRACT_STATE_META: Record<ContractState, Label> = {
  PENDING: { nl: "Pending", en: "Pending" },
  SIGNED: { nl: "Getekend", en: "Signed" },
  NVT: { nl: "NVT", en: "N/A" },
};

export const KEY_STATE_META: Record<KeyState, Label> = {
  PENDING: { nl: "Pending", en: "Pending" },
  GIVEN: { nl: "Gegeven", en: "Handed over" },
  RETURNED: { nl: "Terug", en: "Returned" },
  NVT: { nl: "NVT", en: "N/A" },
};

export const RENTER_TYPE_META: Record<RenterType, Label> = {
  INTERNAL: { nl: "Intern (post of werkgroep)", en: "Internal (post or work group)" },
  EXTERNAL: { nl: "Extern", en: "External" },
};

export const DEPOSIT_CHOICE_META: Record<DepositChoice, Label> = {
  TRANSFER: { nl: "Overschrijving", en: "Wire transfer" },
  CASH: { nl: "Cash", en: "Cash" },
  NVT: { nl: "NVT", en: "N/A" },
};

export function isRentalStatus(value: unknown): value is RentalStatus {
  return typeof value === "string" && (RENTAL_STATUSES as readonly string[]).includes(value);
}
export function isDepositState(value: unknown): value is DepositState {
  return typeof value === "string" && (DEPOSIT_STATES as readonly string[]).includes(value);
}
export function isContractState(value: unknown): value is ContractState {
  return typeof value === "string" && (CONTRACT_STATES as readonly string[]).includes(value);
}
export function isKeyState(value: unknown): value is KeyState {
  return typeof value === "string" && (KEY_STATES as readonly string[]).includes(value);
}
export function isRenterType(value: unknown): value is RenterType {
  return typeof value === "string" && (RENTER_TYPES as readonly string[]).includes(value);
}

/** Aanvragen waar nog iets mee moet gebeuren. */
export const OPEN_RENTAL_STATUSES: readonly RentalStatus[] = ["UNANSWERED", "APPROVED"] as const;

/**
 * "Onbeantwoord" is echt open werk; "goedgekeurd" is dat ook, want daar moeten
 * nog een contract, een sleutel en een waarborg achteraan. Wat geweigerd,
 * geannuleerd, afgelopen of afgerond is, verhuist naar het verwerkt-tabblad.
 */
export function isOpenRental(status: RentalStatus): boolean {
  return (OPEN_RENTAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Gaat deze aanvraag niet door?
 *
 * De kalender verbergt deze standaard: ze zeggen niets over of de zaal vrij is,
 * en op een drukke week staan ze de aanvragen die er wél toe doen in de weg. Wie
 * ze toch wil zien (om na te gaan of iemand al eens geweigerd werd), zet ze met
 * een vinkje terug.
 */
export function isDeclinedRental(status: RentalStatus): boolean {
  return status === "REJECTED" || status === "CANCELLED";
}

/** Blokkeert deze aanvraag de zaal? Enkel wat nog kan of zal doorgaan. */
export function blocksRoom(status: RentalStatus): boolean {
  return status === "APPROVED" || status === "UNANSWERED" || status === "ENDED" || status === "COMPLETED";
}

/**
 * Een post of werkgroep begint haar antwoord op "Aard van de activiteit" met
 * haar naam tussen vierkante haakjes ("[Theokot] Kaas- en wijnavond"). Dat is de
 * enige aanwijzing die het formulier geeft, dus we gokken erop en laten het
 * achteraf overschrijven: het bepaalt welk huurcontract meegaat en of er een
 * waarborg gevraagd wordt.
 */
export function guessRenterType(purpose: string): RenterType {
  return /^\s*\[[^\]]+\]/.test(purpose) ? "INTERNAL" : "EXTERNAL";
}

// -----------------------------------------------------------------------------
// De vragenlijst
// -----------------------------------------------------------------------------

/**
 * De vragen die het systeem zelf nodig heeft. Hun tekst is bewerkbaar, hun
 * bestaan niet: op `day`, `startTime` en `endTime` hangt de kalender, op `email`
 * hangt elke mail, en zonder `responsible` weet niemand wie er tekent.
 */
export const CORE_QUESTIONS = [
  "language",
  "responsible",
  "phone",
  "email",
  "day",
  "startTime",
  "endTime",
  "purpose",
  "attendees",
  "deposit",
  "remarks",
] as const;
export type CoreQuestionKey = (typeof CORE_QUESTIONS)[number];

/** Kernvragen die niet uitgezet mogen worden; zonder die vier is er geen aanvraag. */
export const REQUIRED_CORE_QUESTIONS: readonly CoreQuestionKey[] = [
  "responsible",
  "email",
  "day",
  "startTime",
  "endTime",
] as const;

export type QuestionText = {
  labelNl: string;
  labelEn: string;
  helpNl: string;
  helpEn: string;
  required: boolean;
};

export type CoreQuestion = QuestionText & { key: CoreQuestionKey };

export const EXTRA_QUESTION_TYPES = ["text", "textarea", "choice", "checkbox"] as const;
export type ExtraQuestionType = (typeof EXTRA_QUESTION_TYPES)[number];

export type ExtraQuestionOption = { value: string; labelNl: string; labelEn: string };

/** Een vraag die Theokot zelf toevoegde. Het antwoord landt in `extraAnswers`. */
export type ExtraQuestion = QuestionText & {
  id: string;
  type: ExtraQuestionType;
  options: ExtraQuestionOption[];
};

export type RentalQuestions = {
  core: Record<CoreQuestionKey, CoreQuestion>;
  extra: ExtraQuestion[];
};

/**
 * De standaardvragenlijst: letterlijk het Google Form dat dit vervangt, met de
 * Engelse helft niet meer als "############## English version ##############"
 * onder de Nederlandse maar als de vertaling van hetzelfde veld. Dat formulier
 * toonde beide talen aan iedereen omdat een Google Form er maar één kan; de site
 * kent de taal van de bezoeker al.
 */
export const DEFAULT_RENTAL_QUESTIONS: RentalQuestions = {
  core: {
    language: {
      key: "language",
      labelNl: "Taal",
      labelEn: "Language",
      helpNl: "Gewenste taal voor verdere communicatie.",
      helpEn: "Preferred language for further communication.",
      required: true,
    },
    responsible: {
      key: "responsible",
      labelNl: "Verantwoordelijke",
      labelEn: "Person in charge",
      helpNl:
        "Voor- en achternaam van de verantwoordelijke. Deze persoon moet op het moment van de aanvraag student zijn aan de Faculteit Ingenieurswetenschappen. Alumni vallen hier niet onder, met als enige uitzondering ereleden van VTK. De verantwoordelijke tekent het contract en wordt tijdens het hele evenement in het Theokot verwacht.",
      helpEn:
        "First and last name of the person in charge. They have to be a student at the Faculty of Engineering Science at the time of the request. Alumni do not count, with the only exception being honorary members of VTK. This person signs the contract and is expected to be present at Theokot during the entire event.",
      required: true,
    },
    phone: {
      key: "phone",
      labelNl: "Telefoonnummer",
      labelEn: "Phone number",
      helpNl: "Telefoonnummer van de verantwoordelijke.",
      helpEn: "Telephone number of the person in charge.",
      required: true,
    },
    email: {
      key: "email",
      labelNl: "E-mailadres",
      labelEn: "Email address",
      helpNl: "E-mailadres van de verantwoordelijke. Hier sturen we het antwoord naartoe.",
      helpEn: "Email address of the person in charge. This is where our answer goes.",
      required: true,
    },
    day: {
      key: "day",
      labelNl: "Dag",
      labelEn: "Day",
      helpNl:
        "Op welke dag wens je de zaal te gebruiken? Is de zaal die dag al aangevraagd, dan wordt je aanvraag geweigerd. De enige uitzondering daarop is een aanvraag van een post of werkgroep van VTK.",
      helpEn:
        "On which day would you like to use the room? If the room is already booked that day, your request will be denied. The only exception is a request from a post or work group of VTK.",
      required: true,
    },
    startTime: {
      key: "startTime",
      labelNl: "Startuur",
      labelEn: "Starting hour",
      helpNl: "Op weekdagen is de zaal ten vroegste beschikbaar vanaf 18u00.",
      helpEn: "On weekdays the room is available from 18:00 (6 PM) at the earliest.",
      required: true,
    },
    endTime: {
      key: "endTime",
      labelNl: "Einduur",
      labelEn: "Ending hour",
      helpNl: "Inclusief de tijd die je nodig hebt om de zaal te kuisen.",
      helpEn: "Including the time you need to properly clean the room afterwards.",
      required: true,
    },
    purpose: {
      key: "purpose",
      labelNl: "Aard van de activiteit",
      labelEn: "Type of activity",
      helpNl:
        "Waarvoor zal de zaal gebruikt worden (privéfeestje, receptie...)? Beschrijf het evenement in enkele woorden. Ben je lid van een praesidiumpost of werkgroep, begin je antwoord dan met je groep tussen vierkante haakjes, bijvoorbeeld \"[Theokot] Kaas- en wijnavond\". Het Theokot mag niet gebruikt worden voor openbare evenementen, noch voor activiteiten met winstgevende doeleinden; wordt er inkom gevraagd, dan mag dat enkel om de kosten te dekken. Dat geldt niet voor werkgroepen en posten van VTK.",
      helpEn:
        "What will the room be used for (private party, reception...)? Describe the event in a couple of words. If you are part of a praesidium post or work group, start your answer with the name of the group in square brackets, for example \"[Theokot] Cheese and wine night\". Theokot may not be used for public events, nor for profitable events; if admission is charged, it may only be to cover the costs. This does not apply to posts and work groups of VTK.",
      required: true,
    },
    attendees: {
      key: "attendees",
      labelNl: "Aantal aanwezigen",
      labelEn: "Number of people",
      helpNl: "Hoeveel mensen zullen aanwezig zijn?",
      helpEn: "How many people will be present?",
      required: true,
    },
    deposit: {
      key: "deposit",
      labelNl: "Waarborg",
      labelEn: "Deposit",
      helpNl:
        "Hoe wens je de waarborg te betalen, indien je aanvraag goedgekeurd wordt? Overschrijving: instructies volgen zodra je aanvraag goedgekeurd is. Cash: bij het ophalen van de sleutel. NVT: enkel voor posten en werkgroepen van VTK, die betalen geen waarborg.",
      helpEn:
        "How would you like to pay the deposit if your request is approved? Wire transfer: instructions follow once your request has been approved. Cash: when picking up the key. N/A: only for posts and work groups of VTK, they do not pay a deposit.",
      required: true,
    },
    remarks: {
      key: "remarks",
      labelNl: "Opmerkingen",
      labelEn: "Remarks",
      helpNl:
        "Schrijf hier alle relevante bijkomende informatie. Vermeld vanaf de eerste keer alles wat je wil doen en alles wat je denkt nodig te hebben, en geef gerust kadering mee over wie jullie zijn, wat het doel is van je evenement en wie je doelpubliek is. Beantwoord zeker ook, indien van toepassing: is je evenement openbaar en voldoe je aan de voorwaarden; wens je apparatuur van Theokot te gebruiken; wens je materiaal aan te vragen van VTK; ben je van plan op het pleintje buiten de zaal iets te doen; breng je zelf (elektronische) apparatuur mee? Dat laatste is heel belangrijk om op voorhand te vermelden, zodat wij richtlijnen kunnen meegeven over de stroomkringen.",
      helpEn:
        "Write down all relevant additional information here. Mention from the first time everything you want to do and everything you think you will need, and feel free to explain who you are, what the purpose of your event is and who your audience is. If applicable, also answer: is your event public and do you meet the requirements; would you like to use equipment from Theokot; would you like to request equipment from VTK; are you planning to use the terrain outside; are you bringing any (electronic) equipment of your own? That last one is very important to mention upfront, so that we can give you proper guidelines regarding the electrical circuits.",
      required: false,
    },
  },
  extra: [],
};

/** Leest de vragenlijst uit `Setting`; alles wat ontbreekt valt terug op de standaard. */
export function parseRentalQuestions(value: unknown): RentalQuestions {
  const stored = (value ?? {}) as Partial<{ core: unknown; extra: unknown }>;
  const storedCore = (stored.core ?? {}) as Record<string, unknown>;

  const core = {} as Record<CoreQuestionKey, CoreQuestion>;
  for (const key of CORE_QUESTIONS) {
    const fallback = DEFAULT_RENTAL_QUESTIONS.core[key];
    const raw = storedCore[key];
    const entry = raw && typeof raw === "object" ? (raw as Partial<CoreQuestion>) : {};
    core[key] = {
      key,
      labelNl: text(entry.labelNl, fallback.labelNl),
      labelEn: text(entry.labelEn, fallback.labelEn),
      // Een leeggemaakte hulptekst is een keuze, geen ontbrekende waarde: enkel
      // wanneer het veld helemaal niet bestaat vallen we terug op de standaard.
      helpNl: typeof entry.helpNl === "string" ? entry.helpNl : fallback.helpNl,
      helpEn: typeof entry.helpEn === "string" ? entry.helpEn : fallback.helpEn,
      required: REQUIRED_CORE_QUESTIONS.includes(key)
        ? true
        : typeof entry.required === "boolean"
          ? entry.required
          : fallback.required,
    };
  }

  const extra: ExtraQuestion[] = [];
  if (Array.isArray(stored.extra)) {
    for (const raw of stored.extra) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Partial<ExtraQuestion>;
      const id = toSingleLine(entry.id);
      const labelNl = toSingleLine(entry.labelNl);
      if (!id || !labelNl) continue;
      const type = (EXTRA_QUESTION_TYPES as readonly string[]).includes(entry.type ?? "")
        ? (entry.type as ExtraQuestionType)
        : "text";
      extra.push({
        id,
        type,
        labelNl,
        labelEn: toSingleLine(entry.labelEn) || labelNl,
        helpNl: typeof entry.helpNl === "string" ? entry.helpNl : "",
        helpEn: typeof entry.helpEn === "string" ? entry.helpEn : "",
        required: entry.required === true,
        options: Array.isArray(entry.options)
          ? entry.options
              .map((option) => {
                const o = (option ?? {}) as Partial<ExtraQuestionOption>;
                const label = toSingleLine(o.labelNl) || toSingleLine(o.value);
                if (!label) return null;
                return {
                  value: toSingleLine(o.value) || label,
                  labelNl: label,
                  labelEn: toSingleLine(o.labelEn) || label,
                };
              })
              .filter((option): option is ExtraQuestionOption => option !== null)
          : [],
      });
    }
  }

  return { core, extra };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

/** Het label of de hulptekst van een vraag in de taal van de bezoeker. */
export function questionLabel(question: QuestionText, nl: boolean): string {
  return nl ? question.labelNl : question.labelEn || question.labelNl;
}
export function questionHelp(question: QuestionText, nl: boolean): string {
  return nl ? question.helpNl : question.helpEn || question.helpNl;
}

// -----------------------------------------------------------------------------
// Het publieke aanvraagformulier
// -----------------------------------------------------------------------------

/** Bovengrenzen per veld. Ruim genoeg voor een echte aanvraag, krap voor een bot. */
export const RENTAL_LIMITS = {
  name: 120,
  /** De maximale lengte van een e-mailadres volgens RFC 5321. */
  email: 254,
  phone: 40,
  purpose: 400,
  /**
   * De opmerkingen zijn het veld waar het formulier zelf om vraagt alles kwijt
   * te kunnen. Vier duizend tekens is ruim een A4; wie meer nodig heeft, mailt
   * beter.
   */
  remarks: 4000,
  extraAnswer: 2000,
  /** Het Theokot zit niet vol met duizend mensen; hierboven is het een tikfout. */
  attendees: 500,
} as const;

/**
 * Hoeveel aanvragen één afzender per venster mag indienen. Krapper dan bij de
 * lesbezoeken: één organisatie vraagt de zaal niet acht keer na elkaar aan.
 */
export const RENTAL_RATE_LIMIT = { max: 4, windowMs: 15 * 60 * 1000 } as const;

/** Hoe ver vooruit je mag reserveren. Zonder bovengrens landt er ooit een aanvraag
 *  voor een academiejaar dat nog niet bestaat. */
export const RENTAL_MAX_LEAD_DAYS = 400;

export type RentalErrorCode =
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "EMAIL_REQUIRED"
  | "EMAIL_INVALID"
  | "EMAIL_TOO_LONG"
  | "PHONE_REQUIRED"
  | "PHONE_TOO_LONG"
  | "DATE_REQUIRED"
  | "DATE_INVALID"
  | "TIME_REQUIRED"
  | "TIME_ORDER"
  | "IN_PAST"
  | "TOO_SOON"
  | "TOO_FAR"
  | "PURPOSE_REQUIRED"
  | "PURPOSE_TOO_LONG"
  | "ATTENDEES_REQUIRED"
  | "ATTENDEES_INVALID"
  | "REMARKS_REQUIRED"
  | "REMARKS_TOO_LONG"
  | "DEPOSIT_REQUIRED"
  | "EXTRA_REQUIRED"
  | "EXTRA_TOO_LONG"
  | "CLOSED"
  | "RATE_LIMITED";

export type RentalRequest = {
  locale: "nl" | "en";
  responsibleName: string;
  phone: string;
  email: string;
  /** Wandklok, zoals `<input type="date">` en `type="time"` ze teruggeven. */
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendees: number | null;
  depositChoice: DepositChoice;
  remarks: string;
  extraAnswers: Record<string, string>;
};

export type RawRentalInput = {
  locale?: unknown;
  responsibleName?: unknown;
  phone?: unknown;
  email?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  purpose?: unknown;
  attendees?: unknown;
  deposit?: unknown;
  remarks?: unknown;
  extra?: Record<string, unknown>;
  /** Honeypot: staat verborgen in het formulier, dus een mens laat het leeg. */
  honeypot?: unknown;
};

export type RentalParseResult =
  | { status: "ok"; request: RentalRequest }
  /** Honeypot ingevuld: de aanroeper doet niets en meldt tóch succes. */
  | { status: "honeypot" }
  | { status: "error"; code: RentalErrorCode; field?: string };

/** "hh:mm" -> minuten sinds middernacht, of null. */
export function parseTimeField(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** "yyyy-mm-dd" -> jaar, maand, dag, of null wanneer die dag niet bestaat. */
export function parseDateField(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 31 februari bestaat niet; laat de kalender zelf oordelen.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * Controleert een ingediende aanvraag tegen de vragenlijst die op dat moment
 * geldt.
 *
 * Geeft fouten terug in plaats van ze te gooien: een leeg veld of een einduur
 * voor het startuur is verwachte invoer en hoort een rode toast te geven, geen
 * error boundary (zie CLAUDE.md).
 *
 * `startsAt`/`endsAt` komen als instants binnen zodat de tijdzone-omzetting bij
 * de aanroeper blijft; deze functie vergelijkt enkel.
 */
export function parseRentalRequest(
  raw: RawRentalInput,
  questions: RentalQuestions,
  options: { startsAt: Date | null; now?: Date; minLeadDays?: number },
): RentalParseResult {
  // Eerst de honeypot: een bot die enkel dat veld invult, mag geen enkele
  // foutmelding krijgen waaruit hij kan leren.
  if (toSingleLine(raw.honeypot) !== "") return { status: "honeypot" };

  const core = questions.core;

  const responsibleName = toSingleLine(raw.responsibleName);
  if (responsibleName === "") return { status: "error", code: "NAME_REQUIRED" };
  if (responsibleName.length > RENTAL_LIMITS.name) return { status: "error", code: "NAME_TOO_LONG" };

  const email = toSingleLine(raw.email);
  if (email === "") return { status: "error", code: "EMAIL_REQUIRED" };
  if (email.length > RENTAL_LIMITS.email) return { status: "error", code: "EMAIL_TOO_LONG" };
  if (!isValidEmail(email)) return { status: "error", code: "EMAIL_INVALID" };

  const phone = toSingleLine(raw.phone);
  if (core.phone.required && phone === "") return { status: "error", code: "PHONE_REQUIRED" };
  if (phone.length > RENTAL_LIMITS.phone) return { status: "error", code: "PHONE_TOO_LONG" };

  const date = toSingleLine(raw.date);
  const startTime = toSingleLine(raw.startTime);
  const endTime = toSingleLine(raw.endTime);
  if (date === "") return { status: "error", code: "DATE_REQUIRED" };
  if (!parseDateField(date)) return { status: "error", code: "DATE_INVALID" };
  if (startTime === "" || endTime === "") return { status: "error", code: "TIME_REQUIRED" };

  const startMinutes = parseTimeField(startTime);
  const endMinutes = parseTimeField(endTime);
  if (startMinutes === null || endMinutes === null) return { status: "error", code: "TIME_REQUIRED" };
  // Een verhuur die na middernacht eindigt is de regel en niet de uitzondering,
  // dus een einduur kleiner dan het startuur betekent "de volgende ochtend".
  // Enkel exact hetzelfde uur is onmogelijk.
  if (startMinutes === endMinutes) return { status: "error", code: "TIME_ORDER" };

  if (!options.startsAt) return { status: "error", code: "DATE_INVALID" };
  const now = options.now ?? new Date();
  const leadMs = options.startsAt.getTime() - now.getTime();
  if (leadMs < 0) return { status: "error", code: "IN_PAST" };
  const minLeadDays = Math.max(0, options.minLeadDays ?? 0);
  if (leadMs < minLeadDays * 86_400_000) return { status: "error", code: "TOO_SOON" };
  if (leadMs > RENTAL_MAX_LEAD_DAYS * 86_400_000) return { status: "error", code: "TOO_FAR" };

  const purpose = toSingleLine(raw.purpose);
  if (core.purpose.required && purpose === "") return { status: "error", code: "PURPOSE_REQUIRED" };
  if (purpose.length > RENTAL_LIMITS.purpose) return { status: "error", code: "PURPOSE_TOO_LONG" };

  const attendeesRaw = toSingleLine(raw.attendees);
  let attendees: number | null = null;
  if (attendeesRaw === "") {
    if (core.attendees.required) return { status: "error", code: "ATTENDEES_REQUIRED" };
  } else {
    const parsed = Number(attendeesRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > RENTAL_LIMITS.attendees) {
      return { status: "error", code: "ATTENDEES_INVALID" };
    }
    attendees = parsed;
  }

  const depositRaw = toSingleLine(raw.deposit).toUpperCase();
  const depositChoice = (DEPOSIT_CHOICES as readonly string[]).includes(depositRaw)
    ? (depositRaw as DepositChoice)
    : null;
  if (!depositChoice) {
    if (core.deposit.required) return { status: "error", code: "DEPOSIT_REQUIRED" };
  }

  const remarks = toMessageText(raw.remarks);
  if (core.remarks.required && remarks === "") return { status: "error", code: "REMARKS_REQUIRED" };
  if (remarks.length > RENTAL_LIMITS.remarks) return { status: "error", code: "REMARKS_TOO_LONG" };

  const extraAnswers: Record<string, string> = {};
  for (const question of questions.extra) {
    const value = toMessageText(raw.extra?.[question.id]);
    if (question.required && value === "") {
      return { status: "error", code: "EXTRA_REQUIRED", field: questionLabelKey(question) };
    }
    if (value.length > RENTAL_LIMITS.extraAnswer) {
      return { status: "error", code: "EXTRA_TOO_LONG", field: questionLabelKey(question) };
    }
    if (value !== "") extraAnswers[question.id] = value;
  }

  const locale = toSingleLine(raw.locale) === "en" ? "en" : "nl";

  return {
    status: "ok",
    request: {
      locale,
      responsibleName,
      phone,
      email,
      date,
      startTime,
      endTime,
      purpose,
      attendees,
      depositChoice: depositChoice ?? "NVT",
      remarks,
      extraAnswers,
    },
  };
}

function questionLabelKey(question: ExtraQuestion): string {
  return question.labelNl;
}

// -----------------------------------------------------------------------------
// Dubbelboekingen
// -----------------------------------------------------------------------------

export type RentalWindow = { id: string; startsAt: Date; endsAt: Date; status: RentalStatus };

/**
 * De aanvragen die met dit venster overlappen.
 *
 * Het formulier belooft dat een tweede aanvraag voor een bezette dag geweigerd
 * wordt, en dat is precies het soort belofte dat een mens vergeet na te kijken.
 * Daarom staat de botsing bij de aanvraag zelf in plaats van in een formule
 * ernaast. Wat geweigerd of geannuleerd is telt niet mee: die zaal is weer vrij.
 */
export function overlappingRentals(
  window: { startsAt: Date; endsAt: Date; id?: string },
  others: readonly RentalWindow[],
): RentalWindow[] {
  return others.filter(
    (other) =>
      other.id !== window.id &&
      blocksRoom(other.status) &&
      other.startsAt < window.endsAt &&
      window.startsAt < other.endsAt,
  );
}
