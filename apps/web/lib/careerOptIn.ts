import { getDictionary, type Locale } from "@vtk/i18n";
import type { MailCategoryValue, StudyProgrammeValue, StudyYearValue } from "@/lib/profile";
import type { CareerOptInLabels } from "@/components/profile/CareerOptIn";

/**
 * De losse Career-vraag op de jaarlijkse studiebevestiging.
 *
 * Career is voor de kring de belangrijkste lijst (bedrijven betalen voor dat
 * bereik), en het bevestigingsscherm is het enige moment waarop élke student
 * langskomt. Daarom staat die ene categorie daar apart, terwijl de volledige
 * lijst met categorieën op /account en in de onboarding blijft staan: acht
 * vinkjes op de gate zouden van een bevestiging een formulier maken.
 *
 * Het blijft één vinkje voor dezelfde `MailCategory.CAREER`, niet een tweede
 * soort toestemming: wie het hier aanduidt, ziet het op /account gewoon
 * aangevinkt staan en zet het daar ook weer uit.
 *
 * Bewust puur (geen prisma): zo is te testen wie de vraag krijgt en wat er
 * staat, en dat is de helft van deze feature.
 */

export const CAREER_CATEGORY = "CAREER" satisfies MailCategoryValue;

/** De naam van het vinkje in het formulier, gedeeld door scherm en action. */
export const CAREER_OPT_IN_FIELD = "careerOptIn";

/**
 * Waar een lopende opt-in vandaan komt. Spiegelt `CareerOptInSource` in de
 * Prisma-schema; de admin telt erop (zie `lib/careerStats.ts`).
 */
export const CAREER_OPT_IN_SOURCES = ["ONBOARDING", "ACCOUNT", "STUDY_CONFIRMATION"] as const;
export type CareerOptInSourceValue = (typeof CAREER_OPT_IN_SOURCES)[number];

export type CareerOptInState = {
  mailCategories: readonly string[];
  /** Zette het lid via de uitschrijflink in een mail álle lijstmail uit? */
  mailUnsubscribedAt: Date | null;
  /** Studeert het lid buiten de faculteit Ingenieurswetenschappen? */
  notAtFaculty: boolean;
  /** De richtingen die het lid aanduidde. Leeg = niet één van de onze. */
  studyProgrammes: readonly string[];
  /** De studiejaren die het lid aanduidde; enkel eerste bachelor = geen vraag. */
  studyYears: readonly string[];
};

/** Het eerste bachelorjaar; zie `shouldAskCareerOptIn`. */
const FIRST_BACHELOR = "BACHELOR_1";

/**
 * De "richting" van wie nog niet gekozen heeft. Geen richting waar een bedrijf
 * naar zoekt, dus ze komt niet in de titel; zie `careerChoiceLabels`.
 */
const COMMON_BACHELOR = "COMMON_BACHELOR";

/**
 * Of we het dit jaar nog vragen.
 *
 * Vijf keer nee, en telkens om dezelfde reden: een vinkje dat niets toevoegt,
 * hoort niet op een scherm dat je maar één keer ziet.
 *
 * - **Al aangeduid**, in welk jaar dan ook: `mailCategories` is een voorkeur en
 *   geen jaarlijkse keuze, dus die staat er al. Opnieuw vragen zou het vinkje
 *   leeg tonen aan iemand die al ja zei, en dat leest als "je stond er niet in".
 * - **Uitgeschreven via een mail** (`mailUnsubscribedAt`): dat blokkeert élke
 *   lijstmail, dus dit vinkje zou een belofte doen die de sync niet nakomt.
 *   Terugkomen doet het lid zelf, met de opt-in op /account.
 * - **Geen richting van ons aangeduid**: Career draait om studenten van deze
 *   faculteit, en de lijst is opgesplitst per richting. Zonder richting past het
 *   lid in geen enkel deel, dus levert de aanduiding niets op.
 * - **Niet aan de faculteit** (`notAtFaculty`): die leden vallen sowieso uit de
 *   Career-lijst (zie `desiredListKeys`), wat ze ook aanduidden.
 * - **Enkel eerste bachelor**: daar zijn de career-activiteiten niet op gericht,
 *   en de lijst heeft er ook geen deel voor (zie `CAREER_YEAR_GROUPS`, waar het
 *   eerste jaar enkel via "alle bachelors" meetelt). Ze zitten bovendien
 *   allemaal in de Algemene Bachelor, dus er valt niet eens een richting te
 *   noemen. Vanaf de tweede bachelor krijgt iedereen de vraag wel.
 */
export function shouldAskCareerOptIn(user: CareerOptInState): boolean {
  if (user.mailCategories.includes(CAREER_CATEGORY)) return false;
  if (user.mailUnsubscribedAt !== null) return false;
  if (user.studyProgrammes.length === 0) return false;
  if (user.notAtFaculty) return false;
  // Een leeg jaar sluit niets uit: dan weten we het niet, en de algemene
  // Career-lijst past nog altijd.
  if (user.studyYears.length > 0 && user.studyYears.every((year) => year === FIRST_BACHELOR)) {
    return false;
  }
  return true;
}

/**
 * De categorieën ná een aanduiding, of `null` wanneer er niets te schrijven is.
 *
 * Voegt enkel toe en verwijdert nooit: het vinkje is een opt-in, dus een leeg
 * gelaten vakje betekent "nu niet" en niet "schrijf me uit". Uitschrijven doe je
 * op /account, waar alle categorieën staan en je ziet wat je uitzet.
 */
export function withCareerCategory<T extends string>(
  categories: readonly T[],
): (T | typeof CAREER_CATEGORY)[] | null {
  if (categories.includes(CAREER_CATEGORY as T)) return null;
  return [...categories, CAREER_CATEGORY];
}

/**
 * Wat er aan `User.careerOptInAt` / `careerOptInSource` moet veranderen wanneer
 * de categorieën van `before` naar `after` gaan.
 *
 * Enkel de overgangen tellen. Wie Career aanzet, krijgt het moment en de
 * herkomst; wie het uitzet, verliest ze weer, want anders telt de admin
 * herkomsten van mensen die al lang niet meer op de lijst staan. Verandert er
 * aan Career niets, dan schrijven we niets: een profielopslag mag de herkomst
 * van vorig jaar niet stilletjes op vandaag zetten.
 *
 * Geeft `null` terug als er niets te schrijven valt, zodat een call site het
 * gewoon in zijn `data` kan spreiden.
 */
export function careerOptInUpdate(
  before: readonly string[],
  after: readonly string[],
  source: CareerOptInSourceValue,
  now: Date = new Date(),
): { careerOptInAt: Date | null; careerOptInSource: CareerOptInSourceValue | null } | null {
  const had = before.includes(CAREER_CATEGORY);
  const has = after.includes(CAREER_CATEGORY);
  if (had === has) return null;
  return has
    ? { careerOptInAt: now, careerOptInSource: source }
    : { careerOptInAt: null, careerOptInSource: null };
}

/**
 * De teksten van het blok, met de richting van het lid in de titel.
 *
 * "Bedrijven zoeken 2de masters Energie" is moeilijker over te slaan dan
 * "blijf op de hoogte", en het is waar: de Career-lijst is echt opgesplitst per
 * studiejaar en per richting (zie `lib/careerLists.ts`).
 *
 * Bij meer dan één richting noemen we er gewoon één. "Studenten van jouw
 * richtingen" is precies de vage zin die dit blok moest vervangen, en wie twee
 * richtingen aanduidde, herkent zich in allebei. **Algemene Bachelor valt daarbij
 * af** zolang er een echte richting naast staat: daar zoekt geen enkel bedrijf
 * op. Blijft er geen richting over, dan draagt het studiejaar de titel
 * ("Bedrijven zoeken 2de bachelors"), en pas zonder allebei valt het terug op
 * de algemene zin.
 */
export function careerChoiceLabels(
  locale: Locale,
  user: { studyYears: readonly string[]; studyProgrammes: readonly string[] },
): CareerOptInLabels {
  const dict = getDictionary(locale);
  const t = dict.confirmStudy;
  const nl = locale === "nl";

  const years = dict.onboarding.years as Record<string, string>;
  const programmes = dict.onboarding.programmes as Record<string, string>;
  // De eerste echte richting; Algemene Bachelor enkel wanneer er niets anders
  // staat, en dan nog liever het studiejaar hieronder.
  const named = user.studyProgrammes.filter((code) => code !== COMMON_BACHELOR);
  const programme = named.length > 0 ? programmes[named[0] as StudyProgrammeValue] : null;
  const year =
    user.studyYears.length === 1 ? years[user.studyYears[0] as StudyYearValue] : null;

  let audience: string;
  if (programme && year) {
    audience = nl ? `${year}s ${programme}` : `${year} students in ${programme}`;
  } else if (programme) {
    audience = nl ? `studenten ${programme}` : `students in ${programme}`;
  } else if (year) {
    audience = nl ? `${year}s` : `${year} students`;
  } else {
    audience = nl ? "studenten van jouw richtingen" : "students in your programmes";
  }

  return {
    kicker: t.careerKicker,
    heading: t.careerHeading.replace("{audience}", audience),
    option: t.careerOption,
    hint: t.careerHint,
    lead: t.careerLead,
  };
}
