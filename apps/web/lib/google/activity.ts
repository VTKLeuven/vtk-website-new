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
 * mee als daar, hoe diep ook, iemand actief in zit (`24urenloop` → `sport` →
 * `sport_2627`), of als ze naar dit werkingsjaar heet (`sport_2627`). Al de
 * rest (een oud-lid, een adres dat de site niet kent) is niet actief.
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
  /**
   * Een andere groep van de kring: actief als er, hoe diep ook, iemand actief
   * in zit, of als ze naar dit werkingsjaar heet (`thisYear`). `lastYear` zoals
   * bij een oud-lid, over alle niveaus.
   */
  | { kind: "group"; active: boolean; thisYear: boolean; lastYear: number | null }
  | { kind: "unknown" };

export type ActivityYears = {
  /** `currentWorkingYear()`. */
  workingYear: number;
  /** `studyConfirmationYear()`: dezelfde grens als de mailinglijsten. */
  studyYear: number;
};

/**
 * Heet deze groep naar dit of volgend werkingsjaar (`sport_2627@vtk.be`,
 * `activiteiten_2728@vtk.be`)? Dan is ze per definitie van de huidige ploeg,
 * ook wanneer haar leden nog geen gekoppeld account hebben.
 */
export function namedForCurrentYear(email: string, workingYear: number): boolean {
  const local = email.split("@")[0] ?? "";
  const suffix = (y: number) => `${String(y % 100).padStart(2, "0")}${String((y + 1) % 100).padStart(2, "0")}`;
  return [workingYear, workingYear + 1].some((y) => new RegExp(`(^|[_.-])${suffix(y)}$`).test(local));
}

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
  /** Adressen die de site niet kent: geen lid, geen groep van de kring. */
  unknown: number;
  /**
   * De groep heet zelf naar dit of volgend werkingsjaar (`sport_2627`). Zo'n
   * groep valt nooit onder "niemand meer actief", ook zonder gekende leden.
   */
  thisYear: boolean;
  /**
   * Het jongste jaar waarin een lid nog actief was, wanneer niemand het nu is.
   * `null` wanneer de site geen enkel lid kent.
   */
  lastYear: number | null;
};

export function groupActivity(statuses: MemberStatus[]): GroupActivity {
  let active = 0;
  let unknown = 0;
  let lastYear: number | null = null;
  for (const status of statuses) {
    if (isActiveStatus(status)) active++;
    if (status.kind === "unknown") unknown++;
    const year = status.kind === "former" || status.kind === "group" ? status.lastYear : null;
    if (year !== null) lastYear = lastYear === null ? year : Math.max(lastYear, year);
  }
  return { total: statuses.length, active, unknown, lastYear, thisYear: false };
}

/**
 * Per groep de status van elk lid, en per groep een samenvatting.
 *
 * Een lid dat zelf een groep van de kring is, telt over alle niveaus heen:
 * `24urenloop@vtk.be` bevat `sport@vtk.be`, dat `sport_2627@vtk.be` bevat, waar
 * de ploeg van dit jaar in zit. Een kring (a in b in a) breekt af en telt dan
 * als niet actief langs die weg.
 */
export function classifyGroups(
  groups: { id: string; email: string; emails: string[] }[],
  people: Map<string, ActivityPerson>,
  years: ActivityYears,
): Map<string, { statuses: MemberStatus[]; activity: GroupActivity }> {
  const byAddress = new Map(groups.map((g) => [g.email, g]));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const memo = new Map<string, { active: boolean; lastYear: number | null }>();

  function groupState(id: string, visiting: Set<string>): { active: boolean; lastYear: number | null } {
    const known = memo.get(id);
    if (known) return known;
    const group = byId.get(id);
    if (!group || visiting.has(id)) return { active: false, lastYear: null };
    visiting.add(id);
    let active = namedForCurrentYear(group.email, years.workingYear);
    let lastYear: number | null = null;
    for (const email of group.emails) {
      const status = memberStatus(email, visiting);
      if (isActiveStatus(status)) active = true;
      const year = status.kind === "former" || status.kind === "group" ? status.lastYear : null;
      if (year !== null) lastYear = lastYear === null ? year : Math.max(lastYear, year);
    }
    visiting.delete(id);
    const state = { active, lastYear };
    memo.set(id, state);
    return state;
  }

  function memberStatus(email: string, visiting: Set<string>): MemberStatus {
    const person = people.get(email);
    if (person) return personStatus(person, years);
    const nested = byAddress.get(email);
    if (nested) {
      const state = groupState(nested.id, visiting);
      return {
        kind: "group",
        active: state.active,
        thisYear: namedForCurrentYear(nested.email, years.workingYear),
        lastYear: state.active ? null : state.lastYear,
      };
    }
    return { kind: "unknown" };
  }

  const out = new Map<string, { statuses: MemberStatus[]; activity: GroupActivity }>();
  for (const group of groups) {
    const statuses = group.emails.map((email) => memberStatus(email, new Set([group.id])));
    out.set(group.id, {
      statuses,
      activity: { ...groupActivity(statuses), thisYear: namedForCurrentYear(group.email, years.workingYear) },
    });
  }
  return out;
}
