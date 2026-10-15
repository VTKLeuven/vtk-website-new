import { statsOf, type Stats } from "./dossiers";
import type { XDoc, XDossier, XMeeting, XPost } from "./explorer";

/*
 * De lijstweergave van /admin/bestuursorgaan (`BoList.tsx`), zonder React:
 * filteren, zoeken en groeperen, met de cijfers per groep. Zoals in Odoo zijn
 * filters binnen dezelfde rij een "of": Resultaat open en Komt nog samen tonen
 * allebei.
 */

export const LIST_FILTERS = ["open", "komt", "af", "slechter", "boven"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];

export const LIST_GROUPS = ["post", "bo", "stand", "maand"] as const;
export type ListGroup = (typeof LIST_GROUPS)[number];

export function matchesFilters(d: XDossier, filters: readonly ListFilter[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q && !d.activity.toLowerCase().includes(q) && !d.postName.toLowerCase().includes(q)) return false;
  if (filters.length === 0) return true;
  return filters.some(
    (f) =>
      // Een resultaat zonder budget van vorig jaar is geen achterstand.
      (f === "open" && (d.status === "OPEN" || (d.status === "NO_BUDGET" && d.results[0]?.workingYear === d.year))) ||
      (f === "komt" && d.status === "UPCOMING") ||
      (f === "af" && d.status === "DONE") ||
      (f === "slechter" && (d.devCents ?? 0) < 0) ||
      (f === "boven" && d.overAllocation),
  );
}

export type DossierGroup = {
  key: string;
  label: string;
  dossiers: XDossier[];
  stats: Stats;
  /** Bij groeperen op post: de post, om haar formulier te openen. */
  postKey?: string;
};

const STATUS_ORDER = [
  ["OPEN", "Resultaat open", "Result missing"],
  ["UPCOMING", "Komt nog", "Upcoming"],
  ["DONE", "Resultaat binnen", "Result in"],
  ["NO_BUDGET", "Zonder budget", "Without a budget"],
] as const;

/** De laatste datum waarop een dossier langs een BO passeerde, om nieuwste eerst te zetten. */
export function lastMeetingDate(d: XDossier): string {
  return [...d.budgets, ...d.results].reduce((max, doc) => (doc.meetingDate && doc.meetingDate > max ? doc.meetingDate : max), "");
}

const newestFirst = (a: XDossier, b: XDossier) =>
  lastMeetingDate(b).localeCompare(lastMeetingDate(a)) || a.activity.localeCompare(b.activity, "nl");

export function groupDossiers(
  list: readonly XDossier[],
  group: Exclude<ListGroup, "bo">,
  posts: readonly XPost[],
  nl: boolean,
): DossierGroup[] {
  const make = (key: string, label: string, dossiers: XDossier[], postKey?: string): DossierGroup => ({
    key,
    label,
    dossiers: dossiers.sort(newestFirst),
    stats: statsOf(dossiers),
    ...(postKey ? { postKey } : {}),
  });

  if (group === "post") {
    return posts
      .map((p) => make(p.key, p.name, list.filter((d) => d.postKeys.includes(p.key)), p.key))
      .filter((g) => g.dossiers.length > 0);
  }
  if (group === "stand") {
    return STATUS_ORDER.map(([status, labelNl, labelEn]) =>
      make(status, nl ? labelNl : labelEn, list.filter((d) => d.status === status)),
    ).filter((g) => g.dossiers.length > 0);
  }
  // Per maand van de activiteit, oudste eerst; zonder datum achteraan.
  const month = (d: XDossier) => d.eventDate?.slice(0, 7) ?? "";
  const keys = [...new Set(list.map(month))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  return keys.map((key) => {
    const label = key
      ? new Date(`${key}-01T00:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
      : nl
        ? "Zonder datum"
        : "Without a date";
    return make(key || "geen", label.charAt(0).toUpperCase() + label.slice(1), list.filter((d) => month(d) === key));
  });
}

export type MeetingGroup = { meeting: XMeeting; rows: { doc: XDoc; dossier: XDossier }[] };

/** Groeperen op BO: de rijen zijn dan de bestanden, want één activiteit passeert meerdere BO's. */
export function groupByMeeting(list: readonly XDossier[], meetings: readonly XMeeting[]): MeetingGroup[] {
  const shown = new Map(list.map((d) => [d.key, d]));
  return meetings
    .map((meeting) => {
      const rows = [...meeting.budgets, ...meeting.results].flatMap(({ docId, dossierKey }) => {
        const dossier = shown.get(dossierKey);
        const doc = dossier && [...dossier.budgets, ...dossier.results].find((x) => x.id === docId);
        return dossier && doc ? [{ doc, dossier }] : [];
      });
      return { meeting, rows };
    })
    .filter((g) => g.rows.length > 0);
}
