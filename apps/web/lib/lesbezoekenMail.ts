/**
 * De mails rond een lesbezoek: welke sjablonen er zijn, wat er in de plaats van
 * de placeholders komt, en de teksten waarmee we starten.
 *
 * Puur, dus testbaar zonder mailserver. Het versturen zelf staat in
 * `lib/lesbezoeken-server.ts`.
 *
 * Waarom sjablonen en geen vaste teksten in code: dit waren Word-documenten die
 * elk jaar bijgeschaafd werden ("dit document is ook een work in progress"). Wie
 * de lesbezoeken doet, moet de aanhef kunnen wijzigen zonder een deploy. Ze staan
 * in `Setting` onder `lesbezoeken.mail`, met de teksten hieronder als terugval.
 *
 * En waarom er tóch altijd een mens tussen zit: het scherm vult het sjabloon in
 * en toont het resultaat in een bewerkbaar veld voor je verstuurt. Een mailmerge
 * die rechtstreeks naar een professor vertrekt, stuurt bij een fout honderd keer
 * dezelfde fout.
 */

import { LESBEZOEK_NUDGE_LEAD_DAYS, type LesbezoekStatusCode } from "@/lib/lesbezoeken";

/**
 * Instellingen van de werking, beheerd in /admin/lesbezoeken.
 *
 * `signature` is wat er onder elke mail komt: dat is de naam van wie dit jaar de
 * lesbezoeken doet, en die wisselt elk werkingsjaar. `notifyEmail` is de mailbox
 * die een seintje krijgt bij een nieuwe aanvraag en die als antwoordadres op elke
 * uitgaande mail staat.
 *
 * Staat hier en niet in `lesbezoeken-server.ts` omdat het beheerscherm een client
 * component is: die mag het type kennen zonder de server-only module aan te raken.
 */
export type LesbezoekConfig = {
  signature: string;
  notifyEmail: string;
  /**
   * Hoeveel dagen voor het bezoek de werklijst roept dat de professor een
   * herinnering mag. Zie `LESBEZOEK_NUDGE_LEAD_DAYS` in `lib/lesbezoeken.ts`.
   */
  nudgeLeadDays: number;
};

export const DEFAULT_LESBEZOEK_CONFIG: LesbezoekConfig = {
  signature: "VTK Onderwijs\nlesbezoeken@vtk.be",
  notifyEmail: "lesbezoeken@vtk.be",
  nudgeLeadDays: LESBEZOEK_NUDGE_LEAD_DAYS,
};

/** De sleutels van de sjablonen. Union, zodat een typo een compile-error is. */
export const LESBEZOEK_TEMPLATE_KEYS = [
  "professorShortNl",
  "professorLongNl",
  "professorShortEn",
  "professorLongEn",
  "professorNudgeNl",
  "professorNudgeEn",
  "requesterApproved",
  "requesterDeclined",
  "requesterDigest",
] as const;

export type LesbezoekTemplateKey = (typeof LESBEZOEK_TEMPLATE_KEYS)[number];

export type LesbezoekTemplateCategory = "professor" | "nudge" | "requester" | "other";

export type LesbezoekTemplateItem = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: LesbezoekTemplateCategory;
  lang?: "nl" | "en";
  isDefault?: boolean;
};

export type MailTemplate = {
  name?: string;
  subject: string;
  body: string;
  category?: LesbezoekTemplateCategory;
  lang?: "nl" | "en";
  isDefault?: boolean;
};

export type LesbezoekTemplates = Record<LesbezoekTemplateKey, MailTemplate> & {
  items: LesbezoekTemplateItem[];
  [key: string]: MailTemplate | LesbezoekTemplateItem[] | undefined;
};

/**
 * De placeholders die een sjabloon kent. Wordt ook op het scherm getoond, zodat
 * wie een sjabloon bewerkt niet moet raden wat er bestaat.
 */
export const LESBEZOEK_PLACEHOLDERS = [
  "prof",
  "organisatie",
  "contactpersoon",
  "onderwerp",
  "vak",
  "doelgroep",
  "datum",
  "uur",
  "toelichting",
  "reden",
  "overzicht",
  "aantal",
  "ondertekening",
] as const;

export type LesbezoekPlaceholder = (typeof LESBEZOEK_PLACEHOLDERS)[number];

export type TemplateVars = Partial<Record<LesbezoekPlaceholder, string>>;

/**
 * Vult `{placeholder}` in. Een onbekende placeholder blijft staan in plaats van
 * te verdwijnen: zo ziet wie de mail nakijkt dat er een tikfout in het sjabloon
 * staat, terwijl een leeggemaakte plek onopgemerkt naar een professor vertrekt.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{([a-z]+)\}/gi, (match, name: string) => {
    const value = vars[name.toLowerCase() as LesbezoekPlaceholder];
    return value === undefined ? match : value;
  });
}

/**
 * Voorbeeldwaarden voor het mailvoorbeeld in het beheer.
 *
 * Een sjabloon bewerk je met `{placeholders}` in beeld, en dat is precies niet
 * wat de professor krijgt. Deze waarden vullen het voorbeeld zodat je de echte
 * zin leest; ze zijn herkenbaar verzonnen, want een voorbeeld met een bestaande
 * professor erin leest als een verstuurde mail.
 */
export function previewTemplateVars(locale: "nl" | "en", signature: string): TemplateVars {
  const nl = locale === "nl";
  return {
    prof: "Peeters",
    organisatie: nl ? "Voorbeeldvereniging" : "Example Society",
    contactpersoon: nl ? "Jonas Voorbeeld" : "Jonas Example",
    onderwerp: nl ? "Lesbezoek Revue" : "Class visit Revue",
    vak: nl ? "H01A0a Analyse" : "H01A0a Calculus",
    doelgroep: nl ? "2e Bach, Algemene richting, Groep A" : "2nd Bachelor, general, group A",
    datum: nl ? "maandag 6 oktober 2025" : "Monday 6 October 2025",
    uur: "11:30",
    toelichting: nl
      ? "We komen kort onze Revue aankondigen; de inschrijvingen sluiten binnen twee weken."
      : "We will briefly announce our Revue; registrations close in two weeks.",
    reden: nl ? "de professor gaf al een ander lesbezoek door op die dag" : "the lecturer already accepted another visit that day",
    overzicht: nl
      ? ["Goedgekeurd:", "- H01A0a Analyse (2e Bach) op maandag 6 oktober om 11:30"].join("\n")
      : ["Approved:", "- H01A0a Calculus (2nd Bach) on Monday 6 October at 11:30"].join("\n"),
    aantal: "3",
    ondertekening: signature,
  };
}

export function renderMailTemplate(template: MailTemplate, vars: TemplateVars): MailTemplate {
  return {
    name: template.name,
    subject: renderTemplate(template.subject, vars).replace(/\s+/g, " ").trim(),
    body: renderTemplate(template.body, vars),
    category: template.category,
    lang: template.lang,
    isDefault: template.isDefault,
  };
}

/**
 * Waar een sjabloon over gaat, in de vorm die zowel de server als het scherm bij
 * de hand heeft.
 *
 * `mailDate` en `mailTime` zijn al geformatteerd: het omzetten naar
 * Brussel-wandklok gebeurt op de server, zodat een laptop die op een andere
 * tijdzone staat geen ander uur in de mail zet dan wat er in de kalender stond.
 */
export type MailSubjectFacts = {
  teacherName: string | null;
  organisationName: string;
  requesterName: string | null;
  subject: string;
  course: string;
  audience: string;
  teacherNote: string;
  reviewNote: string | null;
  mailDate: { nl: string; en: string };
  mailTime: string;
};

/** De placeholderwaarden voor dit bezoek, in de taal waarin gemaild wordt. */
export function mailVarsFor(
  visit: MailSubjectFacts,
  locale: "nl" | "en",
  signature: string,
): TemplateVars {
  return {
    prof: visit.teacherName?.trim() || "",
    organisatie: visit.organisationName,
    // Zonder naam spreken we de organisatie aan; "Beste ," is erger dan formeel.
    contactpersoon: visit.requesterName?.trim() || visit.organisationName,
    onderwerp: visit.subject,
    vak: visit.course,
    doelgroep: visit.audience,
    datum: visit.mailDate[locale],
    uur: visit.mailTime,
    toelichting: visit.teacherNote,
    reden: visit.reviewNote?.trim() || "",
    ondertekening: signature,
  };
}

/**
 * Welk sjabloon een professor krijgt: kort of lang bezoek, Nederlands of Engels.
 * De vier teksten verschillen maar in een paar woorden, maar ze zijn wel elk
 * apart bewerkbaar; dat was in de map met Word-documenten ook zo.
 */
export function professorTemplateKey(
  longVisit: boolean,
  locale: "nl" | "en",
): LesbezoekTemplateKey {
  if (locale === "en") return longVisit ? "professorLongEn" : "professorShortEn";
  return longVisit ? "professorLongNl" : "professorShortNl";
}

export function nudgeTemplateKey(locale: "nl" | "en"): LesbezoekTemplateKey {
  return locale === "en" ? "professorNudgeEn" : "professorNudgeNl";
}

/** Het sjabloon dat een gebundelde terugkoppeling standaard gebruikt. */
export const REQUESTER_DIGEST_TEMPLATE_KEY: LesbezoekTemplateKey = "requesterDigest";

// -----------------------------------------------------------------------------
// De gebundelde terugkoppeling
// -----------------------------------------------------------------------------

/**
 * De koppen boven elke groep in `{overzicht}`.
 *
 * Bewust niet dezelfde labels als in het beheer: "Afgewezen door ons" is een
 * interne term, en de aanvrager leest liever wat er met zijn aanvraag gebeurde
 * dan wie het besliste. De volgorde is die van de lijst hieronder: eerst wat
 * doorgaat, dan wat nog loopt, dan wat niet doorgaat.
 */
export const DIGEST_GROUP_LABELS: Record<LesbezoekStatusCode, { nl: string; en: string }> = {
  APPROVED: { nl: "Goedgekeurd", en: "Approved" },
  ASKED: { nl: "Nog in behandeling bij de professor", en: "Still with the lecturer" },
  PENDING: { nl: "Nog na te kijken door VTK Onderwijs", en: "Still to be reviewed by VTK Education" },
  DECLINED: { nl: "Niet doorgegaan: de professor gaat niet akkoord", en: "Not going ahead: the lecturer declined" },
  REJECTED: { nl: "Niet doorgestuurd", en: "Not forwarded" },
  CANCELLED: { nl: "Ingetrokken", en: "Withdrawn" },
};

/** De volgorde waarin de groepen in de mail staan. */
const DIGEST_ORDER: readonly LesbezoekStatusCode[] = [
  "APPROVED",
  "ASKED",
  "PENDING",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
];

/** Wat er per lesbezoek in het overzicht komt. Al geformatteerd, zoals hierboven. */
export type DigestVisitFacts = {
  status: LesbezoekStatusCode;
  course: string;
  audience: string;
  mailDate: { nl: string; en: string };
  mailTime: string;
  reviewNote: string | null;
};

/**
 * De tekst achter `{overzicht}`: één regel per lesbezoek, gegroepeerd per
 * uitkomst.
 *
 * Dit is waarom de bundel bestaat. Een organisatie die twintig lesbezoeken
 * aanvraagt, kreeg vroeger twintig losse mails, en die vertellen elk apart niet
 * wat het geheel doet. Hier staat in één blok wat doorgaat, wat nog loopt en wat
 * niet doorgaat; de reden bij een geweigerd bezoek staat eronder, want zonder die
 * reden is "niet doorgegaan" enkel een mededeling.
 */
export function buildRequesterDigest(
  visits: readonly DigestVisitFacts[],
  locale: "nl" | "en" = "nl",
): string {
  const nl = locale === "nl";
  const blocks: string[] = [];

  for (const status of DIGEST_ORDER) {
    const inGroup = visits.filter((visit) => visit.status === status);
    if (inGroup.length === 0) continue;

    const lines = [`${DIGEST_GROUP_LABELS[status][locale]}:`];
    for (const visit of inGroup) {
      const when = nl
        ? `${visit.mailDate.nl} om ${visit.mailTime}`
        : `${visit.mailDate.en} at ${visit.mailTime}`;
      lines.push(`- ${visit.course} (${visit.audience}) ${nl ? "op" : "on"} ${when}`);
      const note = visit.reviewNote?.trim();
      // De reden hoort onder het bezoek waar ze over gaat, ingesprongen: op één
      // regel erachter loopt ze in de volgende aanvraag over.
      if (note) lines.push(`  ${note.replace(/\n+/g, " ")}`);
    }
    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

/**
 * De placeholderwaarden voor een gebundelde mail.
 *
 * `{vak}`, `{datum}` en `{uur}` slaan hier op niets: de mail gaat over meerdere
 * bezoeken tegelijk. Ze blijven daarom leeg in plaats van het eerste bezoek te
 * kiezen, want een onderwerpregel die één van de twintig data noemt, is erger
 * dan een die er geen noemt.
 */
export function digestMailVars(
  input: {
    organisationName: string;
    requesterName: string | null;
    visits: readonly DigestVisitFacts[];
  },
  locale: "nl" | "en",
  signature: string,
): TemplateVars {
  return {
    organisatie: input.organisationName,
    contactpersoon: input.requesterName?.trim() || input.organisationName,
    overzicht: buildRequesterDigest(input.visits, locale),
    aantal: String(input.visits.length),
    ondertekening: signature,
    prof: "",
    onderwerp: "",
    vak: "",
    doelgroep: "",
    datum: "",
    uur: "",
    toelichting: "",
    reden: "",
  };
}

const SIGNATURE = "{ondertekening}";

export const DEFAULT_LESBEZOEK_TEMPLATE_NAMES: Record<LesbezoekTemplateKey, { nl: string; en: string }> = {
  professorShortNl: { nl: "Docent · kort bezoek · NL", en: "Lecturer · short visit · NL" },
  professorLongNl: { nl: "Docent · lang bezoek · NL", en: "Lecturer · long visit · NL" },
  professorShortEn: { nl: "Docent · kort bezoek · EN", en: "Lecturer · short visit · EN" },
  professorLongEn: { nl: "Docent · lang bezoek · EN", en: "Lecturer · long visit · EN" },
  professorNudgeNl: { nl: "Herinnering docent · NL", en: "Reminder lecturer · NL" },
  professorNudgeEn: { nl: "Herinnering docent · EN", en: "Reminder lecturer · EN" },
  requesterApproved: { nl: "Aanvrager · goedgekeurd", en: "Requester · approved" },
  requesterDeclined: { nl: "Aanvrager · niet doorgegaan", en: "Requester · did not happen" },
  requesterDigest: { nl: "Aanvrager · overzicht (bundel)", en: "Requester · overview (bundle)" },
};

/**
 * De basisteksten van de standaardsjablonen.
 */
export const DEFAULT_LESBEZOEK_TEMPLATE_ITEMS: LesbezoekTemplateItem[] = [
  {
    id: "professorShortNl",
    name: "Docent · kort bezoek · NL",
    category: "professor",
    lang: "nl",
    isDefault: true,
    subject: "Aanvraag kort lesbezoek: {vak} op {datum}",
    body: [
      "Geachte professor {prof},",
      "",
      "Vanuit VTK Onderwijs informeer ik u betreffende de aanvraag van een lesbezoek.",
      "Zou het mogelijk zijn voor {organisatie} om een korte presentatie te geven tijdens het vak, {vak}, op {datum} om {uur}?",
      "",
      "Aanvullende informatie van de verzoeker van het lesbezoek:",
      "{toelichting}",
      "",
      "Alvast bedankt voor uw antwoord.",
      "Met vriendelijke groet,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "professorLongNl",
    name: "Docent · lang bezoek · NL",
    category: "professor",
    lang: "nl",
    isDefault: true,
    subject: "Aanvraag lesbezoek: {vak} op {datum}",
    body: [
      "Geachte professor {prof},",
      "",
      "Vanuit VTK Onderwijs informeer ik u betreffende de aanvraag van een lesbezoek.",
      "Zou het mogelijk zijn voor {organisatie} om een presentatie te geven tijdens het vak, {vak}, op {datum} om {uur}?",
      "",
      "Aanvullende informatie van de verzoeker van het lesbezoek:",
      "{toelichting}",
      "",
      "Alvast bedankt voor uw antwoord.",
      "Met vriendelijke groet,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "professorShortEn",
    name: "Docent · kort bezoek · EN",
    category: "professor",
    lang: "en",
    isDefault: true,
    subject: "Request for a short class visit: {vak} on {datum}",
    body: [
      "Dear Professor {prof},",
      "",
      "I am writing to inform you about a request for a class visit, which has been submitted to VTK Education.",
      "Would it be possible for {organisatie} to give a short presentation during the course, {vak}, on {datum} at {uur}?",
      "",
      "Additional information from the applicant of the class visit:",
      "{toelichting}",
      "",
      "Thank you in advance for your reply.",
      "Sincerely,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "professorLongEn",
    name: "Docent · lang bezoek · EN",
    category: "professor",
    lang: "en",
    isDefault: true,
    subject: "Request for a class visit: {vak} on {datum}",
    body: [
      "Dear Professor {prof},",
      "",
      "I am writing to inform you about a request for a class visit, which has been submitted to VTK Education.",
      "Would it be possible for {organisatie} to give a presentation during the course, {vak}, on {datum} at {uur}?",
      "",
      "Additional information from the applicant of the class visit:",
      "{toelichting}",
      "",
      "Please let me know if this is possible.",
      "",
      "Thank you in advance for your reply.",
      "Sincerely,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "professorNudgeNl",
    name: "Herinnering docent · NL",
    category: "nudge",
    lang: "nl",
    isDefault: true,
    subject: "Opvolging aanvraag lesbezoek: {vak} op {datum}",
    body: [
      "Geachte professor {prof},",
      "",
      "Onlangs stuurde ik u deze aanvraag voor een lesbezoek van {organisatie} tijdens {vak} op {datum} om {uur}. Omdat dit moment dichterbij komt, wou ik even opvolgen of dit voor u mogelijk zou zijn.",
      "Alvast bedankt voor uw tijd en moeite.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "professorNudgeEn",
    name: "Herinnering docent · EN",
    category: "nudge",
    lang: "en",
    isDefault: true,
    subject: "Follow-up on the class visit request: {vak} on {datum}",
    body: [
      "Dear Professor {prof},",
      "",
      "I recently sent you a request for a class visit by {organisatie} during {vak} on {datum} at {uur}. As the date is approaching, I wanted to follow up and ask whether this would be possible for you.",
      "Thank you in advance for your time.",
      "",
      "Sincerely,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "requesterApproved",
    name: "Aanvrager · goedgekeurd",
    category: "requester",
    lang: "nl",
    isDefault: true,
    subject: "Lesbezoek goedgekeurd: {vak} op {datum}",
    body: [
      "Beste {contactpersoon},",
      "",
      "Goed nieuws: het lesbezoek voor {organisatie} tijdens {vak} ({doelgroep}) op {datum} om {uur} is goedgekeurd door de professor.",
      "{reden}",
      "",
      "Er wordt uiteraard verwacht dat iemand van jullie organisatie aanwezig is. Ga op het voorziene moment het lokaal binnen, zo weet de lesgever dat jullie er zijn.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "requesterDigest",
    name: "Aanvrager · overzicht (bundel)",
    category: "requester",
    lang: "nl",
    isDefault: true,
    subject: "Overzicht van jullie lesbezoeken ({aantal})",
    body: [
      "Beste {contactpersoon},",
      "",
      "Hierbij een overzicht van de lesbezoeken die {organisatie} aanvroeg.",
      "",
      "{overzicht}",
      "",
      "Bij een goedgekeurd lesbezoek wordt verwacht dat iemand van jullie organisatie aanwezig is. Ga op het voorziene moment het lokaal binnen, zo weet de lesgever dat jullie er zijn.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
  {
    id: "requesterDeclined",
    name: "Aanvrager · niet doorgegaan",
    category: "requester",
    lang: "nl",
    isDefault: true,
    subject: "Lesbezoek niet doorgegaan: {vak} op {datum}",
    body: [
      "Beste {contactpersoon},",
      "",
      "Helaas moet ik u melden dat het volgende lesbezoek voor {organisatie} niet kan doorgaan:",
      "{onderwerp} — {vak} ({doelgroep}) op {datum} om {uur}",
      "",
      "Dit is omdat {reden}",
      "",
      "Indien jullie deze doelgroep bij een andere les willen bereiken, dien dan best een aanvraag in voor een ander moment.",
      "",
      "Met vriendelijke groeten,",
      SIGNATURE,
    ].join("\n"),
  },
];

const DEFAULT_MAP = DEFAULT_LESBEZOEK_TEMPLATE_ITEMS.reduce(
  (acc, item) => {
    acc[item.id as LesbezoekTemplateKey] = {
      name: item.name,
      subject: item.subject,
      body: item.body,
      category: item.category,
      lang: item.lang,
      isDefault: item.isDefault,
    };
    return acc;
  },
  {} as Record<LesbezoekTemplateKey, MailTemplate>,
);

export const DEFAULT_LESBEZOEK_TEMPLATES: LesbezoekTemplates = {
  items: DEFAULT_LESBEZOEK_TEMPLATE_ITEMS,
  ...DEFAULT_MAP,
};

/**
 * Leest wat er in `Setting` staat en vult aan met de standaardteksten. Een
 * sjabloon dat leeg of stuk in de database staat, valt terug op de standaardtekst.
 * Ondersteunt zowel de nieuwe lijststructuur als de legacy dictionary-structuur.
 */
export function parseLesbezoekTemplates(value: unknown): LesbezoekTemplates {
  const result: LesbezoekTemplates = {
    ...DEFAULT_MAP,
    items: [],
  };

  // 1. Array-structuur (nieuw)
  const isObject = value !== null && typeof value === "object";
  const objectItems = isObject && "items" in value && Array.isArray((value as { items: unknown }).items)
    ? (value as { items: unknown[] }).items
    : null;

  if (Array.isArray(value) || objectItems !== null) {
    const rawList: unknown[] = Array.isArray(value) ? value : (objectItems ?? []);
    const items: LesbezoekTemplateItem[] = [];

    for (const raw of rawList) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Partial<LesbezoekTemplateItem>;
      const id = String(entry.id || "").trim();
      if (!id) continue;

      const fallback = DEFAULT_MAP[id as LesbezoekTemplateKey];
      const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : fallback?.name ?? id;
      const subject =
        typeof entry.subject === "string" && entry.subject.trim()
          ? entry.subject
          : fallback?.subject ?? "";
      const body =
        typeof entry.body === "string" && entry.body.trim()
          ? entry.body
          : fallback?.body ?? "";

      const item: LesbezoekTemplateItem = {
        id,
        name,
        subject,
        body,
        category: entry.category ?? fallback?.category ?? "other",
        lang: entry.lang ?? fallback?.lang ?? "nl",
        isDefault: Boolean(entry.isDefault || fallback),
      };

      items.push(item);
      result[id] = item;
    }

    // Zorg dat ontbrekende standaardsjablonen als fallback aanwezig blijven op het result object
    for (const def of DEFAULT_LESBEZOEK_TEMPLATE_ITEMS) {
      if (!result[def.id]) {
        result[def.id] = def;
      }
    }

    result.items = items.length > 0 ? items : DEFAULT_LESBEZOEK_TEMPLATE_ITEMS;
    return result;
  }

  // 2. Object / Record-structuur (legacy)
  const stored = (value ?? {}) as Record<string, unknown>;
  const items: LesbezoekTemplateItem[] = [];

  for (const def of DEFAULT_LESBEZOEK_TEMPLATE_ITEMS) {
    const entry = stored[def.id];
    let subject = def.subject;
    let body = def.body;
    let name = def.name;

    if (entry && typeof entry === "object") {
      const p = entry as Partial<MailTemplate>;
      if (typeof p.subject === "string" && p.subject.trim()) subject = p.subject;
      if (typeof p.body === "string" && p.body.trim()) body = p.body;
      if (typeof p.name === "string" && p.name.trim()) name = p.name.trim();
    }

    const item: LesbezoekTemplateItem = {
      id: def.id,
      name,
      subject,
      body,
      category: def.category,
      lang: def.lang,
      isDefault: true,
    };
    items.push(item);
    result[def.id] = item;
  }

  // Eventuele extra custom keys uit legacy store
  for (const [key, entry] of Object.entries(stored)) {
    if ((LESBEZOEK_TEMPLATE_KEYS as readonly string[]).includes(key) || !entry || typeof entry !== "object") {
      continue;
    }
    const p = entry as Partial<MailTemplate>;
    const item: LesbezoekTemplateItem = {
      id: key,
      name: (typeof p.name === "string" && p.name.trim()) || key,
      subject: typeof p.subject === "string" ? p.subject : "",
      body: typeof p.body === "string" ? p.body : "",
      category: p.category ?? "other",
      lang: p.lang ?? "nl",
      isDefault: false,
    };
    items.push(item);
    result[key] = item;
  }

  result.items = items;
  return result;
}
