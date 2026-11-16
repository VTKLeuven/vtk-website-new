/**
 * Zit er in een groepsadres nog iemand die nu bij de kring hoort?
 *
 * Voor het opruimen van /admin/groepsadressen: van de ruim zevenhonderd
 * overgenomen groepen is een groot deel van lang geleden (`fakbar_1415@vtk.be`),
 * en dat zie je niet aan het adres maar aan wie erin zit.
 *
 * Een adres is **actief** wanneer het van iemand is die dit werkingsjaar een
 * post, werkgroep of jaarwerking heeft (of in een lopende kiesploeg zit), of die
 * dit academiejaar zijn studie bevestigde. Een andere groep van de kring telt
 * mee als die zelf actieve leden heeft. Al de rest (een oud-lid, een adres dat
 * de site niet kent) is niet actief.
 *
 * Bewust enkel op gegevens van de site, niet op wanneer iemand in Google
 * aanmeldde: een oud-praesidiumlid dat zijn mailbox nog gebruikt, is daarom geen
 * reden om `cantus_1617@vtk.be` te houden.
 *
 * Geen `server-only`: puur, zie `test/mailGroupActivity.test.ts`.
 */

export type ActivityPerson = {
  name: string;
  /** Het jongste werkingsjaar met een post, werkgroep of jaarwerking. */
  lastPostYear: number | null;
  /** In een kiesploeg die nog niet overging (`Kiesploeg.active`). */
  inActiveKiesploeg: boolean;
  isStudent: boolean;
  studyConfirmedYear: number | null;
  /** `User.active`: een gedeactiveerd account is nooit actief. */
  active: boolean;
};

export type MemberStatus =
  | { kind: "post"; name: string }
  | { kind: "student"; name: string }
  /** Gekend op de site, maar nu niet actief; `lastYear` is het jongste jaar waarin wel. */
  | { kind: "former"; name: string; lastYear: number | null }
  /** Een andere groep van de kring; actief als die zelf actieve leden heeft. */
  | { kind: "group"; active: boolean }
  | { kind: "unknown" };

export type ActivityYears = {
  /** `currentWorkingYear()`. */
  workingYear: number;
  /** `studyConfirmationYear()`: dezelfde grens als de mailinglijsten. */
  studyYear: number;
};

export function isActiveStatus(status: MemberStatus): boolean {
  return (
    status.kind === "post" || status.kind === "student" || (status.kind === "group" && status.active)
  );
}

export function personStatus(person: ActivityPerson, years: ActivityYears): MemberStatus {
  if (person.active) {
    if (person.inActiveKiesploeg || (person.lastPostYear ?? -1) >= years.workingYear) {
      return { kind: "post", name: person.name };
    }
    if (person.isStudent && (person.studyConfirmedYear ?? -1) >= years.studyYear) {
      return { kind: "student", name: person.name };
    }
  }
  const studied = person.isStudent ? person.studyConfirmedYear : null;
  const candidates = [person.lastPostYear, studied].filter((y): y is number => y !== null);
  return {
    kind: "former",
    name: person.name,
    lastYear: candidates.length ? Math.max(...candidates) : null,
  };
}

export type GroupActivity = {
  total: number;
  active: number;
  /**
   * Het jongste jaar waarin een lid nog actief was, wanneer niemand het nu is.
   * `null` wanneer de site geen enkel lid kent.
   */
  lastYear: number | null;
};

export function groupActivity(statuses: MemberStatus[]): GroupActivity {
  let active = 0;
  let lastYear: number | null = null;
  for (const status of statuses) {
    if (isActiveStatus(status)) active++;
    if (status.kind === "former" && status.lastYear !== null) {
      lastYear = lastYear === null ? status.lastYear : Math.max(lastYear, status.lastYear);
    }
  }
  return { total: statuses.length, active, lastYear };
}

/**
 * Per groep de status van elk lid, en per groep een samenvatting.
 *
 * Een lid dat zelf een groep van de kring is (`groep5_1314@vtk.be` in
 * `communicatie_1314@vtk.be`), telt één niveau diep: actief wanneer die groep
 * rechtstreeks actieve leden heeft. Dieper kijken we niet; een keten van
 * archiefgroepen in archiefgroepen zegt niets meer over vandaag.
 */
export function classifyGroups(
  groups: { id: string; email: string; emails: string[] }[],
  people: Map<string, ActivityPerson>,
  years: ActivityYears,
): Map<string, { statuses: MemberStatus[]; activity: GroupActivity }> {
  const byAddress = new Map(groups.map((g) => [g.email, g.id]));

  // Eerste ronde: enkel personen, zodat een geneste groep iets heeft om op te steunen.
  const directActive = new Map<string, number>();
  for (const group of groups) {
    let active = 0;
    for (const email of group.emails) {
      const person = people.get(email);
      if (person && isActiveStatus(personStatus(person, years))) active++;
    }
    directActive.set(group.id, active);
  }

  const out = new Map<string, { statuses: MemberStatus[]; activity: GroupActivity }>();
  for (const group of groups) {
    const statuses = group.emails.map((email) => memberStatus(email));
    out.set(group.id, { statuses, activity: groupActivity(statuses) });
  }
  return out;

  function memberStatus(email: string): MemberStatus {
    const person = people.get(email);
    if (person) return personStatus(person, years);
    const nested = byAddress.get(email);
    if (nested !== undefined) return { kind: "group", active: (directActive.get(nested) ?? 0) > 0 };
    return { kind: "unknown" };
  }
}
