/**
 * Pure Brevo-mapping: welke lijsten en attributen een lid krijgt. Geen prisma,
 * geen HTTP; dit is de testbare kern die `sync.ts` orchestreert.
 *
 * De lijst-lidmaatschapsregels hier zijn de JS-tegenhanger van `listWhere()` in
 * `lib/mailinglists.ts` (de CSV-export). Ze MOETEN gelijk blijven, anders lopen de
 * Brevo-sync en de handmatige export uiteen. `test/brevoSync.test.ts` bewaakt dat.
 */
import type { MailCategory, StudyProgramme, StudyYear } from "@prisma/client";
import { nameParts } from "@vtk/auth";
import { CAREER_SEGMENTS, inCareerSegment, type CareerSegment } from "@/lib/careerLists";
import { MAIL_CATEGORIES, STUDY_PROGRAMMES, STUDY_YEARS } from "@/lib/profile";

/**
 * De synthetische "alle studenten"-lijst. Zelfde waarde als `ALL_STUDENTS` in
 * `lib/mailinglists.ts`; hier bewust los herhaald zodat deze pure module niet de
 * server-only (prisma) mailinglists-module hoeft te importeren.
 */
export const ALL_STUDENTS_KEY = "ALLE_STUDENTEN" as const;

/**
 * De sleutel van een Career-deellijst, bv. `CAREER:jaar:2de-bachelor` of
 * `CAREER:richting:civil:masters`. Het deel na de dubbele punt is de `key` van
 * een {@link CareerSegment}.
 *
 * De **algemene** Career-lijst heeft geen zo'n sleutel: dat is de gewone
 * categoriesleutel `CAREER` (de bestaande `VTK - Career`-lijst), net zoals
 * `career-algemeen.csv` in de ZIP de volledige groep is. Zo blijven de bestaande
 * lijst, haar ID en haar uitschrijvingen ongemoeid, en komen de delen ernaast.
 */
export type CareerListKey = `CAREER:${string}`;

/** Een door de site beheerde Brevo-lijst: "alle studenten", een opt-in-categorie of een Career-deel. */
export type BrevoListKey = MailCategory | typeof ALL_STUDENTS_KEY | CareerListKey;

/** De Brevo-sleutel van één Career-deel. */
export function careerListKey(segment: CareerSegment): CareerListKey {
  return `CAREER:${segment.key}`;
}

/** Elk Career-deel met zijn Brevo-sleutel, in de volgorde van {@link CAREER_SEGMENTS}. */
export const CAREER_LIST_SEGMENTS: { key: CareerListKey; segment: CareerSegment }[] =
  CAREER_SEGMENTS.map((segment) => ({ key: careerListKey(segment), segment }));

/**
 * Alle lijsten die de site in Brevo beheert, in vaste volgorde: "alle
 * studenten", de acht categorieën, en daarna de Career-deellijsten.
 */
export const BREVO_LIST_KEYS: BrevoListKey[] = [
  ALL_STUDENTS_KEY,
  ...MAIL_CATEGORIES,
  ...CAREER_LIST_SEGMENTS.map((s) => s.key),
];

/** Is dit een Career-deellijst (en dus niet de algemene `CAREER`-lijst)? */
export function isCareerListKey(key: BrevoListKey): key is CareerListKey {
  return key.startsWith("CAREER:");
}

/** Is dit een opt-in-categorie waar het lid op /account een vinkje voor heeft? */
function isMailCategory(key: BrevoListKey): key is MailCategory {
  return (MAIL_CATEGORIES as readonly string[]).includes(key);
}

/** Attribuutnaam voor een studiejaar-boolean (`YEAR_BACHELOR_2`). */
export function yearAttr(year: StudyYear): string {
  return `YEAR_${year}`;
}

/** Attribuutnaam voor een richting-boolean (`PROG_CIVIL`). */
export function programmeAttr(programme: StudyProgramme): string {
  return `PROG_${programme}`;
}

/** De velden van een lid die de sync nodig heeft. */
export type SyncUserData = {
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  personalEmail: string | null;
  emailPreference: "UNIVERSITY" | "PERSONAL";
  active: boolean;
  isStudent: boolean;
  notAtFaculty: boolean;
  studyConfirmedYear: number | null;
  mailCategories: MailCategory[];
  mailUnsubscribedAt: Date | null;
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
};

/**
 * Basis-geschiktheid: enkel actieve leden die hun studie dit academiejaar
 * bevestigden, de status Student hebben en zich niet via een mail uitschreven. Faalt dit,
 * dan hoort het lid in géén enkele lijst en wordt het overal uit verwijderd.
 * Spiegelt de eerste vier filters van `listWhere()`.
 */
export function isEligible(user: SyncUserData, studyYear: number): boolean {
  return (
    user.active &&
    user.isStudent &&
    user.studyConfirmedYear === studyYear &&
    user.mailUnsubscribedAt === null
  );
}

/**
 * De lijsten waar een lid in hoort. "Alle studenten" krijgt elk geschikt lid; de
 * categorieën enkel wie ze aanvinkte; Career bovendien enkel faculteitsstudenten
 * (`notAtFaculty === false`), net als in `listWhere("CAREER")`.
 *
 * Wie in de algemene Career-lijst hoort, komt daarnaast in elk Career-deel dat
 * bij zijn studiejaren en richtingen past; dat zijn dezelfde delen als de CSV's
 * in de ZIP-export. Valt Career weg (niet aangevinkt, of `notAtFaculty`), dan
 * vallen de delen mee weg: ze zijn per definitie deelverzamelingen.
 */
export function desiredListKeys(user: SyncUserData, studyYear: number): BrevoListKey[] {
  if (!isEligible(user, studyYear)) return [];
  const keys: BrevoListKey[] = [ALL_STUDENTS_KEY];
  for (const category of user.mailCategories) {
    if (category === "CAREER" && user.notAtFaculty) continue;
    keys.push(category);
  }
  if (keys.includes("CAREER")) {
    for (const { key, segment } of CAREER_LIST_SEGMENTS) {
      if (inCareerSegment(segment, user)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Wat een uitschrijving in Brevo betekent voor de site.
 *
 * `global` is "geen enkele VTK-lijstmail meer". Twee dingen leiden daartoe: de
 * blacklist op het contact (de uitschrijflink onderaan elke campagne), en een
 * uitschrijving voor de lijst "Alle studenten". Die tweede heeft op de site geen
 * eigen vinkje; wie ze uitzet, zegt hetzelfde als wie zich blacklist.
 *
 * `categories` zijn de losse opt-ins die het lid uitzette. Die vinken we af in
 * `mailCategories`, zodat de site en Brevo hetzelfde zeggen en het lid het op
 * /account terugziet.
 */
export type BrevoUnsubscribe = { global: boolean; categories: MailCategory[] };

/**
 * Leest de uitschrijfstatus van een Brevo-contact terug naar sitebegrippen.
 *
 * Bewust **enkel** op expliciete uitschrijfvelden: dat een adres niet (meer) in
 * een lijst zit, telt hier niet mee. De import bij Brevo verloopt asynchroon, dus
 * een adres dat we net toevoegden kan een tel later nog ontbreken; die afwezigheid
 * als "uitgeschreven" lezen zou een lid uitschrijven omdat we het net inschreven.
 */
export function readUnsubscribe(
  contact: { emailBlacklisted: boolean; listUnsubscribed: number[] },
  keyByListId: Map<number, BrevoListKey>,
): BrevoUnsubscribe {
  if (contact.emailBlacklisted) return { global: true, categories: [] };

  const keys = contact.listUnsubscribed
    .map((id) => keyByListId.get(id))
    .filter((key): key is BrevoListKey => key !== undefined);

  if (keys.includes(ALL_STUDENTS_KEY)) return { global: true, categories: [] };

  // Enkel de categorieën komen hier door. Een uitschrijving voor één
  // Career-deellijst ("Career - Bouwkunde - 2de bachelor") is géén uitschrijving
  // voor Career: het lid wil de andere career-mails nog. De site heeft voor zo'n
  // deel geen vinkje, dus er valt in de DB niets af te vinken; die uitschrijving
  // blijft een feit in Brevo, en de sync respecteert ze per deel door dat adres
  // niet opnieuw aan die ene lijst toe te voegen (zie `sync.ts`).
  return { global: false, categories: keys.filter(isMailCategory) };
}

/**
 * De adressen die zich voor precies deze lijst uitschreven, genormaliseerd.
 *
 * Zo'n uitschrijving hangt bij Brevo aan het lidmaatschap, niet aan het contact:
 * loskoppelen wist ze (dat is precies wat `clearUnsubscribe` doet). De sync mag
 * er dus niet overheen walsen; ze laat het adres met rust in die ene lijst en
 * raakt de andere delen en de algemene lijst niet aan.
 */
export function unsubscribedEmails(
  contacts: readonly { email: string; listUnsubscribed: number[] }[],
  listId: number,
): Set<string> {
  const emails = new Set<string>();
  for (const contact of contacts) {
    if (contact.listUnsubscribed.includes(listId)) emails.add(normalizeEmail(contact.email));
  }
  return emails;
}

type EmailFields = Pick<SyncUserData, "email" | "personalEmail" | "emailPreference">;

/** Het voorkeursadres: persoonlijke mail wanneer gekozen én ingevuld, anders de login-mail. */
export function preferredEmail(user: EmailFields): string {
  return user.emailPreference === "PERSONAL" && user.personalEmail
    ? user.personalEmail
    : user.email;
}

/**
 * Het níét-gekozen adres, indien aanwezig en verschillend van het voorkeursadres.
 * Bij een real-time sync verwijderen we dit uit alle lijsten, zodat een gewisselde
 * mailvoorkeur geen dubbele inschrijving op het oude adres achterlaat.
 */
export function alternateEmail(user: EmailFields): string | null {
  const preferred = preferredEmail(user);
  const other = preferred === user.email ? user.personalEmail : user.email;
  return other && other !== preferred ? other : null;
}

/** Brevo-attributen voor een contact: naam + één boolean per studiejaar en richting. */
export function contactAttributes(user: SyncUserData): Record<string, string | boolean> {
  const parts = nameParts(user);
  const attributes: Record<string, string | boolean> = {
    FIRSTNAME: parts.firstName,
    LASTNAME: parts.lastName,
  };
  for (const year of STUDY_YEARS) attributes[yearAttr(year)] = user.studyYears.includes(year);
  for (const programme of STUDY_PROGRAMMES) {
    attributes[programmeAttr(programme)] = user.studyProgrammes.includes(programme);
  }
  return attributes;
}

/** Normaliseer een adres voor vergelijking (Brevo bewaart e-mail lowercased). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Welke adressen uit een lijst moeten: aanwezig in Brevo, maar niet (meer) gewenst. */
export function emailsToRemove(currentEmails: string[], desiredEmails: Iterable<string>): string[] {
  const keep = new Set([...desiredEmails].map(normalizeEmail));
  return currentEmails.filter((email) => !keep.has(normalizeEmail(email)));
}
