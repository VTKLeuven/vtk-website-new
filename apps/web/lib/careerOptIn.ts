import type { MailCategoryValue } from "@/lib/profile";

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
 * Bewust puur (geen prisma, geen i18n): zo is te testen wie de vraag krijgt en
 * wat er staat, en draait dezelfde regel in de browser. Het blok volgt daar live
 * wat het lid in stap 1 invult (zie `CareerOptIn`); de vertaalde teksten komen
 * uit `lib/careerOptInCopy.ts`.
 */

export const CAREER_CATEGORY = "CAREER" satisfies MailCategoryValue;

/** De naam van het vinkje in het formulier, gedeeld door scherm en action. */
export const CAREER_OPT_IN_FIELD = "careerOptIn";

/**
 * Een verborgen veld dat enkel meegaat wanneer het blok op het scherm stond.
 *
 * Zo weet de action of het lid de vraag echt gezien heeft, en dat is de noemer
 * van de conversie in /admin/mailinglijsten. Het blok zet zich uit (en neemt dit
 * veld mee) wanneer de antwoorden in stap 1 niet meer bij Career passen, en
 * zonder JavaScript volgt het stap 1 niet; afleiden uit het profiel alleen zou
 * die twee gevallen als "gevraagd" tellen.
 */
export const CAREER_OPT_IN_SHOWN_FIELD = "careerOptInShown";

/**
 * Waar een lopende opt-in vandaan komt. Spiegelt `CareerOptInSource` in de
 * Prisma-schema; de admin telt erop (zie `lib/careerStats.ts`).
 */
export const CAREER_OPT_IN_SOURCES = ["ONBOARDING", "ACCOUNT", "STUDY_CONFIRMATION"] as const;
export type CareerOptInSourceValue = (typeof CAREER_OPT_IN_SOURCES)[number];

/** De studievelden waar de vraag van afhangt; precies wat stap 1 van de bevestiging vraagt. */
export type CareerStudyState = {
  isStudent: boolean;
  /** Studeert het lid buiten de faculteit Ingenieurswetenschappen? */
  notAtFaculty: boolean;
  /** De richtingen die het lid aanduidde. Leeg = niet één van de onze. */
  studyProgrammes: readonly string[];
  /** De studiejaren die het lid aanduidde; enkel eerste bachelor = geen vraag. */
  studyYears: readonly string[];
};

export type CareerOptInState = CareerStudyState & {
  mailCategories: readonly string[];
  /** Zette het lid via de uitschrijflink in een mail álle lijstmail uit? */
  mailUnsubscribedAt: Date | null;
};

/** Het eerste bachelorjaar; zie `careerFitsStudy`. */
const FIRST_BACHELOR = "BACHELOR_1";

/**
 * De "richting" van wie nog niet gekozen heeft. Geen richting waar een bedrijf
 * naar zoekt, dus ze komt niet in de titel; zie `careerHeading`.
 */
const COMMON_BACHELOR = "COMMON_BACHELOR";

/**
 * Of we het dit jaar nog vragen.
 *
 * Vijf keer nee, en telkens om dezelfde reden: een vinkje dat niets toevoegt,
 * hoort niet op een scherm dat je maar één keer ziet. De eerste twee gaan over
 * het lid ({@link careerOptInOpen}), de rest over zijn studie
 * ({@link careerFitsStudy}).
 *
 * **Welke studie?** Die van dit jaar, dus wat het lid in stap 1 invult, en niet
 * wat er van vorig jaar in het profiel staat. Het scherm besliste dit vroeger op
 * het oude profiel, en dan kreeg precies de groep die er voor het eerst bij hoort
 * de vraag niet: wie vorig jaar eerste bachelor was, is nu tweede. De titel
 * noemde om dezelfde reden het studiejaar van vorig jaar.
 */
export function shouldAskCareerOptIn(user: CareerOptInState): boolean {
  return careerOptInOpen(user) && careerFitsStudy(user);
}

/**
 * Het deel van de regel dat niet in stap 1 staat, en dus op het scherm vastligt.
 *
 * - **Al aangeduid**, in welk jaar dan ook: `mailCategories` is een voorkeur en
 *   geen jaarlijkse keuze, dus die staat er al. Opnieuw vragen zou het vinkje
 *   leeg tonen aan iemand die al ja zei, en dat leest als "je stond er niet in".
 * - **Uitgeschreven via een mail** (`mailUnsubscribedAt`): dat blokkeert élke
 *   lijstmail, dus dit vinkje zou een belofte doen die de sync niet nakomt.
 *   Terugkomen doet het lid zelf, met de opt-in op /account.
 */
export function careerOptInOpen(
  user: Pick<CareerOptInState, "mailCategories" | "mailUnsubscribedAt">,
): boolean {
  if (user.mailCategories.includes(CAREER_CATEGORY)) return false;
  if (user.mailUnsubscribedAt !== null) return false;
  return true;
}

/**
 * Het deel van de regel dat meebeweegt met stap 1.
 *
 * - **Geen student** meer: dan bewaart de bevestiging geen richting en geen jaar.
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
export function careerFitsStudy(user: CareerStudyState): boolean {
  if (!user.isStudent) return false;
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
 * De teksten van het blok, al vertaald. De server stelt ze samen
 * (`careerOptInCopy`) en geeft ze als prop door, zodat de titel in de browser
 * kan meebewegen zonder de hele dictionary in de clientbundel.
 */
export type CareerOptInCopy = {
  /** De Nederlandse of de Engelse zinsbouw voor het publiek in de titel. */
  nl: boolean;
  kicker: string;
  lead: string;
  option: string;
  hint: string;
  /** "Bedrijven zoeken {audience}" */
  headingTemplate: string;
  years: Readonly<Record<string, string>>;
  programmes: Readonly<Record<string, string>>;
};

/**
 * De titel van het blok, met de richting van het lid erin.
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
export function careerHeading(
  copy: CareerOptInCopy,
  user: { studyYears: readonly string[]; studyProgrammes: readonly string[] },
): string {
  const { nl } = copy;
  // De eerste echte richting; Algemene Bachelor enkel wanneer er niets anders
  // staat, en dan nog liever het studiejaar hieronder.
  const named = user.studyProgrammes.filter((code) => code !== COMMON_BACHELOR);
  const programme = named.length > 0 ? (copy.programmes[named[0]] ?? null) : null;
  const year = user.studyYears.length === 1 ? (copy.years[user.studyYears[0]] ?? null) : null;

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

  return copy.headingTemplate.replace("{audience}", audience);
}
