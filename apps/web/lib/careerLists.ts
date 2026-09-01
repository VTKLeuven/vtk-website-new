import type { StudyProgramme, StudyYear } from "@prisma/client";
import { getDictionary } from "@vtk/i18n";
import { STUDY_PROGRAMMES } from "@/lib/profile";

/**
 * De opsplitsing van de Career-mailinglijst, één keer beschreven.
 *
 * Career is niet één publiek: een bedrijfsmail voor de 2de bachelors bouwkunde
 * hoort niet bij een 1ste master chemie te komen. Vandaar de deellijsten:
 * dezelfde groep Career-opt-ins opgesplitst per studiejaar, en per richting nog
 * eens 2de bachelor / 3de bachelor / masters.
 *
 * Deze module is de **enige** definitie van die structuur. Twee kanten gebruiken
 * ze en mogen niet uit elkaar lopen:
 * - de ZIP-export in `lib/mailinglists.ts` (één CSV per deel);
 * - de Brevo-sync in `lib/brevo/` (één Brevo-lijst per deel).
 *
 * Bewust puur (geen prisma, geen server-only): `lib/brevo/contacts.ts` is de
 * testbare kern van de sync en importeert dit.
 */

const MASTER_YEARS: StudyYear[] = ["MASTER_1", "MASTER_2"];
const BACHELOR_YEARS: StudyYear[] = ["BACHELOR_1", "BACHELOR_2", "BACHELOR_3"];

/**
 * Een studiejaar-groep binnen Career: de bestandsnaam in de ZIP (`slug`), het
 * label dat in Brevo op de lijst komt, en de studiejaren die erin vallen.
 */
export type CareerYearGroup = { slug: string; label: string; years: StudyYear[] };

/**
 * Per studiejaar, over alle richtingen heen. Eerste bachelors krijgen geen eigen
 * groep (enkel via "alle bachelors"): daar zijn de career-activiteiten niet op
 * gericht.
 */
export const CAREER_YEAR_GROUPS: CareerYearGroup[] = [
  { slug: "2de-bachelor", label: "2de bachelor", years: ["BACHELOR_2"] },
  { slug: "3de-bachelor", label: "3de bachelor", years: ["BACHELOR_3"] },
  { slug: "alle-bachelors", label: "Alle bachelors", years: BACHELOR_YEARS },
  { slug: "1ste-master", label: "1ste master", years: ["MASTER_1"] },
  { slug: "2de-master", label: "2de master", years: ["MASTER_2"] },
  { slug: "alle-masters", label: "Alle masters", years: MASTER_YEARS },
];

/** Binnen één richting bestaan enkel deze drie groepen. */
export const CAREER_PROGRAMME_GROUPS: CareerYearGroup[] = [
  { slug: "2de-bachelor", label: "2de bachelor", years: ["BACHELOR_2"] },
  { slug: "3de-bachelor", label: "3de bachelor", years: ["BACHELOR_3"] },
  { slug: "masters", label: "Masters", years: MASTER_YEARS },
];

/**
 * Eén deel van de Career-lijst.
 *
 * De **algemene** Career-lijst (alle opt-ins samen) zit hier bewust níét in: dat
 * is de lijst zelf, niet een deel ervan. In de ZIP is dat `career-algemeen.csv`,
 * in Brevo de bestaande `VTK - Career`-lijst.
 */
export type CareerSegment = {
  /** Stabiele sleutel, bv. `jaar:2de-bachelor` of `richting:civil:masters`. */
  key: string;
  /** Wat er in Brevo op de lijstnaam komt, bv. "Bouwkunde - 2de bachelor". */
  label: string;
  /** De richting waartoe dit deel beperkt is, of `null` voor alle richtingen. */
  programme: StudyProgramme | null;
  /** Minstens één van deze studiejaren moet het lid hebben. */
  years: StudyYear[];
};

/**
 * Sleutelvorm van een richting: de enum-waarde, niet het label. Zo blijft de
 * sleutel (en dus de Brevo-lijst) dezelfde wanneer iemand ooit de vertaling van
 * een richting aanpast. De ZIP gebruikt wél het (vertaalde) label als mapnaam,
 * want die mappen worden door mensen bekeken.
 */
export function programmeSlug(programme: StudyProgramme): string {
  return programme.toLowerCase().replace(/_/g, "-");
}

/** Het Nederlandse label van een richting; de Brevo-lijstnamen zijn niet vertaald. */
function programmeLabel(programme: StudyProgramme): string {
  return getDictionary("nl").onboarding.programmes[programme];
}

/** Alle Career-deellijsten, in vaste volgorde: eerst per jaar, dan per richting. */
export const CAREER_SEGMENTS: CareerSegment[] = [
  ...CAREER_YEAR_GROUPS.map(
    (group): CareerSegment => ({
      key: `jaar:${group.slug}`,
      label: group.label,
      programme: null,
      years: group.years,
    }),
  ),
  ...STUDY_PROGRAMMES.flatMap((programme) =>
    CAREER_PROGRAMME_GROUPS.map(
      (group): CareerSegment => ({
        key: `richting:${programmeSlug(programme)}:${group.slug}`,
        label: `${programmeLabel(programme)} - ${group.label}`,
        programme,
        years: group.years,
      }),
    ),
  ),
];

/** De studievelden waarop een deellijst een lid selecteert. */
export type CareerMember = { studyYears: StudyYear[]; studyProgrammes: StudyProgramme[] };

/** Zit dit lid in minstens één van deze studiejaren? */
export function inYears(member: CareerMember, years: StudyYear[]): boolean {
  return member.studyYears.some((year) => years.includes(year));
}

/**
 * Hoort dit lid in dit deel? Enkel de studievelden tellen hier; of het lid
 * überhaupt Career aanvinkte (en aan de faculteit studeert) is een vraag die
 * hierboven al beantwoord is.
 *
 * Een lid met meerdere studiejaren of richtingen hoort in elk deel waar het bij
 * past; de delen overlappen dus bewust.
 */
export function inCareerSegment(segment: CareerSegment, member: CareerMember): boolean {
  if (segment.programme !== null && !member.studyProgrammes.includes(segment.programme)) {
    return false;
  }
  return inYears(member, segment.years);
}
