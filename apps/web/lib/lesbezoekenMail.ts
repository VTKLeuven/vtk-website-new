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

export type MailTemplate = { subject: string; body: string };
export type LesbezoekTemplates = Record<LesbezoekTemplateKey, MailTemplate>;

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
    subject: renderTemplate(template.subject, vars).replace(/\s+/g, " ").trim(),
    body: renderTemplate(template.body, vars),
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

/**
 * De teksten zoals ze in de map "Template mails" stonden, met de
 * `<<Veld>>`-merge-velden vervangen door onze placeholders. Bewust zo dicht
 * mogelijk bij het origineel: professoren kennen deze mail ondertussen, en een
 * herschreven aanhef is een verandering die niemand vroeg.
 */
export const DEFAULT_LESBEZOEK_TEMPLATES: LesbezoekTemplates = {
  professorShortNl: {
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
  professorLongNl: {
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
  professorShortEn: {
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
  professorLongEn: {
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
  professorNudgeNl: {
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
  professorNudgeEn: {
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
  requesterApproved: {
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
  requesterDeclined: {
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
};

/**
 * Leest wat er in `Setting` staat en vult aan met de standaardteksten. Een
 * sjabloon dat leeg of stuk in de database staat, valt terug op de tekst
 * hierboven in plaats van een lege mail te maken.
 */
export function parseLesbezoekTemplates(value: unknown): LesbezoekTemplates {
  const stored = (value ?? {}) as Record<string, unknown>;
  const result = {} as LesbezoekTemplates;

  for (const key of LESBEZOEK_TEMPLATE_KEYS) {
    const fallback = DEFAULT_LESBEZOEK_TEMPLATES[key];
    const entry = stored[key];
    if (!entry || typeof entry !== "object") {
      result[key] = fallback;
      continue;
    }
    const { subject, body } = entry as Partial<MailTemplate>;
    result[key] = {
      subject: typeof subject === "string" && subject.trim() ? subject : fallback.subject,
      body: typeof body === "string" && body.trim() ? body : fallback.body,
    };
  }

  return result;
}
