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
};

export const DEFAULT_LESBEZOEK_CONFIG: LesbezoekConfig = {
  signature: "VTK Onderwijs\nlesbezoeken@vtk.be",
  notifyEmail: "lesbezoeken@vtk.be",
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
