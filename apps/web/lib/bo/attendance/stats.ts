import { nameKey, proposeMatch, type RosterPerson } from "@/lib/praesidiumShifts/names";
import type { AttendanceStatus, MinutesEntry } from "./parse";

/*
 * De aanwezigheden op het Bestuursorgaan, uitgerekend uit de verslagen
 * (/admin/apps/aanwezigheden). Puur: de server laadt de verslagen en het
 * praesidium (`server.ts`), dit rekent.
 *
 * Wie welke gebruiker is, bepalen we hier en niet bij het lezen: een naam uit
 * het verslag wordt met `proposeMatch` aan het praesidium van dat werkingsjaar
 * gekoppeld, zoals bij de shiftenlijsten. Wie niet in het praesidium zit (een
 * naam met een tikfout, iemand die halverwege stopte), blijft een persoon op
 * naam, zodat niets wegvalt.
 *
 * De aanwezigheidsgraad is aanwezig gedeeld door aanwezig, verontschuldigd en
 * afwezig samen. Een BO waarin iemand niet op de lijst stond (nog geen lid,
 * niet ingekleurd), telt voor die persoon niet mee.
 */

export type Cell = AttendanceStatus | "UNKNOWN" | null;

export type MeetingInput = {
  id: string;
  label: string;
  date: Date | null;
  /** De regel onder "VERSLAG", als die er is. */
  title: string | null;
  minutesUrl: string | null;
  entries: MinutesEntry[];
};

export type Counts = { present: number; excused: number; absent: number; unknown: number };

export type MeetingStats = MeetingInput &
  Counts & {
    /** Aanwezig op wie een status had; null als niemand ingekleurd was. */
    rate: number | null;
    /** Per status de sleutels van de personen (`PersonStats.key`). */
    people: Record<AttendanceStatus | "UNKNOWN", string[]>;
  };

export type PersonStats = Counts & {
  /** De userId, of `naam:<sleutel>` voor wie niet in het praesidium staat. */
  key: string;
  userId: string | null;
  name: string;
  posts: string[];
  /** Per vergadering (in de volgorde van `meetings`): de status, of null als de naam er niet stond. */
  cells: Cell[];
  /** Hoeveel verslagen de naam vermeldden. */
  listed: number;
  rate: number | null;
  /** Aanwezig of verontschuldigd: wie liet weten dat hij niet kon. */
  reportedRate: number | null;
  /** Hoeveel BO's na elkaar aanwezig, tot de laatste waarop de naam stond. */
  presentStreak: number;
  longestPresentStreak: number;
  /** Hoeveel BO's na elkaar afwezig zonder verontschuldiging, tot de laatste. */
  absentStreak: number;
  longestAbsentStreak: number;
  /** De laatste BO waarop iemand afwezig of verontschuldigd was (index in `meetings`). */
  lastMissed: number | null;
  /** De aanwezigheid over de laatste vijf BO's met een status; null bij minder dan vijf. */
  recentRate: number | null;
};

export type PostStats = { post: string; members: number; present: number; decided: number; absent: number; rate: number | null };

export type AttendanceOverview = {
  meetings: MeetingStats[];
  people: PersonStats[];
  posts: PostStats[];
  /** Gemiddelde van de aanwezigheidsgraad per BO. */
  averageRate: number | null;
  /** Wie drie keer of meer onverwittigd afwezig was, of de laatste twee BO's na elkaar. */
  followUp: PersonStats[];
  /** Namen die niet aan het praesidium te koppelen waren. */
  unmatched: PersonStats[];
};

/** Zoveel BO's telt "recent". */
export const RECENT_MEETINGS = 5;

export function rateOf(counts: Pick<Counts, "present" | "excused" | "absent">): number | null {
  const decided = counts.present + counts.excused + counts.absent;
  return decided > 0 ? counts.present / decided : null;
}

/** Een praesidiumlid van het werkingsjaar, met zijn posten in de volgorde van /praesidium. */
export type RosterInput = RosterPerson & { posts: string[] };

export function buildAttendance(input: readonly MeetingInput[], roster: readonly RosterInput[]): AttendanceOverview {
  const meetings = [...input].sort(compareMeetings);
  const rosterList = [...roster];
  const byUser = new Map(rosterList.map((person) => [person.userId, person]));

  const keyOf = new Map<string, { key: string; userId: string | null }>();
  const resolve = (name: string) => {
    const nk = nameKey(name);
    let hit = keyOf.get(nk);
    if (!hit) {
      const proposal = proposeMatch(nk, rosterList, new Map());
      hit =
        proposal.status === "MATCHED" && proposal.userId
          ? { key: proposal.userId, userId: proposal.userId }
          : { key: `naam:${nk}`, userId: null };
      keyOf.set(nk, hit);
    }
    return hit;
  };

  const people = new Map<string, PersonStats>();
  const meetingStats: MeetingStats[] = meetings.map((meeting, index) => {
    const counts: Counts = { present: 0, excused: 0, absent: 0, unknown: 0 };
    const grouped: MeetingStats["people"] = { PRESENT: [], EXCUSED: [], ABSENT: [], UNKNOWN: [] };
    for (const entry of meeting.entries) {
      const { key, userId } = resolve(entry.name);
      let person = people.get(key);
      if (!person) {
        const rosterPerson = userId ? byUser.get(userId) : undefined;
        person = {
          key,
          userId,
          name: rosterPerson?.name ?? entry.name,
          posts: rosterPerson?.posts ?? [],
          cells: meetings.map(() => null),
          listed: 0,
          present: 0,
          excused: 0,
          absent: 0,
          unknown: 0,
          rate: null,
          reportedRate: null,
          presentStreak: 0,
          longestPresentStreak: 0,
          absentStreak: 0,
          longestAbsentStreak: 0,
          lastMissed: null,
          recentRate: null,
        };
        people.set(key, person);
      }
      // Twee schrijfwijzen van dezelfde persoon in één verslag: de eerste telt.
      if (person.cells[index] !== null) continue;
      const cell: Cell = entry.status ?? "UNKNOWN";
      person.cells[index] = cell;
      person.listed += 1;
      const field = cell === "PRESENT" ? "present" : cell === "EXCUSED" ? "excused" : cell === "ABSENT" ? "absent" : "unknown";
      person[field] += 1;
      counts[field] += 1;
      grouped[cell].push(key);
    }
    return { ...meeting, ...counts, rate: rateOf(counts), people: grouped };
  });

  for (const person of people.values()) finishPerson(person);

  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const rates = meetingStats.map((m) => m.rate).filter((r): r is number => r !== null);
  const averageRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  const postMap = new Map<string, PostStats>();
  for (const person of list) {
    for (const post of person.posts) {
      const stats = postMap.get(post) ?? { post, members: 0, present: 0, decided: 0, absent: 0, rate: null };
      stats.members += 1;
      stats.present += person.present;
      stats.absent += person.absent;
      stats.decided += person.present + person.excused + person.absent;
      postMap.set(post, stats);
    }
  }
  // De volgorde van /praesidium, zoals de posten bij elk lid staan.
  const postOrder = new Map<string, number>();
  for (const person of rosterList) for (const post of person.posts) if (!postOrder.has(post)) postOrder.set(post, postOrder.size);
  const posts = [...postMap.values()]
    .map((p) => ({ ...p, rate: p.decided > 0 ? p.present / p.decided : null }))
    .sort((a, b) => (postOrder.get(a.post) ?? 999) - (postOrder.get(b.post) ?? 999));

  const followUp = list
    .filter((p) => p.absent >= 3 || p.absentStreak >= 2)
    .sort((a, b) => b.absentStreak - a.absentStreak || b.absent - a.absent || a.name.localeCompare(b.name, "nl"));

  return {
    meetings: meetingStats,
    people: list,
    posts,
    averageRate,
    followUp,
    unmatched: list.filter((p) => !p.userId),
  };
}

function finishPerson(person: PersonStats): void {
  person.rate = rateOf(person);
  const decided = person.present + person.excused + person.absent;
  person.reportedRate = decided > 0 ? (person.present + person.excused) / decided : null;

  let present = 0;
  let absent = 0;
  const statuses: AttendanceStatus[] = [];
  person.cells.forEach((cell, index) => {
    if (cell === null || cell === "UNKNOWN") return;
    statuses.push(cell);
    present = cell === "PRESENT" ? present + 1 : 0;
    absent = cell === "ABSENT" ? absent + 1 : 0;
    person.longestPresentStreak = Math.max(person.longestPresentStreak, present);
    person.longestAbsentStreak = Math.max(person.longestAbsentStreak, absent);
    if (cell !== "PRESENT") person.lastMissed = index;
  });
  person.presentStreak = present;
  person.absentStreak = absent;

  if (statuses.length >= RECENT_MEETINGS) {
    const recent = statuses.slice(-RECENT_MEETINGS);
    person.recentRate = recent.filter((s) => s === "PRESENT").length / recent.length;
  }
}

/** Op datum, en zonder datum op nummer; een vergadering zonder beide achteraan. */
function compareMeetings(a: MeetingInput, b: MeetingInput): number {
  const at = a.date?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.date?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.label.localeCompare(b.label, "nl", { numeric: true });
}

/** De rangschikking van een persoon op aanwezigheid (1 = best), onder wie een graad heeft. */
export function rankOf(people: readonly PersonStats[], key: string): { rank: number; of: number } | null {
  const ranked = people.filter((p) => p.rate !== null && p.userId).sort((a, b) => b.rate! - a.rate!);
  const self = ranked.find((p) => p.key === key);
  if (!self) return null;
  // Gelijke graad, gelijke plaats.
  return { rank: ranked.filter((p) => p.rate! > self.rate!).length + 1, of: ranked.length };
}

/** Wat veranderde tegenover de vorige BO: wie wegbleef na aanwezig te zijn, en wie terugkwam. */
export function changesSince(
  meetings: readonly MeetingStats[],
  people: readonly PersonStats[],
  index: number,
): { dropped: PersonStats[]; returned: PersonStats[] } | null {
  if (index <= 0) return null;
  const dropped: PersonStats[] = [];
  const returned: PersonStats[] = [];
  for (const person of people) {
    const now = person.cells[index];
    const before = person.cells[index - 1];
    if (!now || !before || now === "UNKNOWN" || before === "UNKNOWN") continue;
    if (before === "PRESENT" && now !== "PRESENT") dropped.push(person);
    if (before !== "PRESENT" && now === "PRESENT") returned.push(person);
  }
  return { dropped, returned };
}

/** Een sleutel voor in een URL: de userId, of de naam voor wie niet te koppelen was. */
export function personSlug(key: string): string {
  return encodeURIComponent(key);
}
