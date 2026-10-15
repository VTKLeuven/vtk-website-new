import type { BoLine } from "./figures";
import type { BoOverview, Dossier, DocView, DossierStatus, MeetingView, PostSection, Stats } from "./dossiers";
import type { BoKind, MeetingKind } from "./names";

/*
 * Wat de verkenner op /admin/bestuursorgaan in de browser krijgt: het overzicht
 * van één werkingsjaar, met datums als tekst ("2026-11-04") zodat het van de
 * server naar een clientcomponent kan. Puur, en zonder imports die iets anders
 * dan types meebrengen: dit bestand belandt in de clientbundel.
 */

export type XDoc = Omit<DocView, "meetingDate"> & { meetingDate: string | null };

export type XDossier = Omit<Dossier, "eventDate" | "dateIgnored" | "lastSeen" | "budgets" | "results"> & {
  eventDate: string | null;
  dateIgnored: string | null;
  /** De namen van `postKeys`, in dezelfde volgorde, samen als "Cultuur + Onthaal". */
  postNames: string[];
  postName: string;
  budgets: XDoc[];
  results: XDoc[];
};

export type XPost = { key: string; groupId: string | null; name: string; section: PostSection; stats: Stats };

export type XMeeting = Omit<MeetingView, "date"> & { date: string | null };

export type ExplorerData = {
  year: number;
  /** Vandaag, als datum: de verkenner rekent er niet zelf mee, maar toont het. */
  today: string;
  posts: XPost[];
  dossiers: XDossier[];
  meetings: XMeeting[];
  global: Stats;
};

export type { BoKind, BoLine, DossierStatus, MeetingKind, PostSection, Stats };

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function toExplorerData(overview: BoOverview, year: number, today: Date): ExplorerData {
  const doc = (d: DocView): XDoc => ({ ...d, meetingDate: iso(d.meetingDate) });
  const names = new Map(overview.posts.map((p) => [p.key, p.name]));
  // Een dossier van twee posten staat in beide blokken, maar één keer in de lijst.
  const seen = new Set<string>();
  const dossiers: XDossier[] = [];
  for (const p of overview.posts) {
    for (const { eventDate, dateIgnored, lastSeen, budgets, results, ...rest } of p.dossiers) {
      void lastSeen; // enkel om op te sorteren; de volgorde zit al in de lijst
      if (seen.has(rest.key)) continue;
      seen.add(rest.key);
      const postNames = rest.postKeys.map((key) => names.get(key) ?? key);
      dossiers.push({
        ...rest,
        eventDate: iso(eventDate),
        dateIgnored: iso(dateIgnored),
        postNames,
        postName: postNames.join(" + "),
        budgets: budgets.map(doc),
        results: results.map(doc),
      });
    }
  }
  return {
    year,
    today: iso(today)!,
    posts: overview.posts.map((p) => ({ key: p.key, groupId: p.groupId, name: p.name, section: p.section, stats: p.stats })),
    dossiers,
    meetings: overview.meetings.map((m) => ({ ...m, date: iso(m.date) })),
    global: overview.global,
  };
}

/**
 * Het dossier achter `?activiteit=`. De sleutel bevat de posten, dus na "Post
 * wijzigen" (of een gedeelde link van voor die wijziging) bestaat ze niet meer;
 * dan dezelfde activiteit in hetzelfde jaar, zodat het detail open blijft.
 */
export function findDossier(dossiers: readonly XDossier[], key: string | null): XDossier | null {
  if (!key) return null;
  const exact = dossiers.find((d) => d.key === key);
  if (exact) return exact;
  const [year, , activity] = key.split("|");
  if (!activity) return null;
  return dossiers.find((d) => d.key.startsWith(`${year}|`) && d.key.endsWith(`|${activity}`)) ?? null;
}

/** De vakken van het overzicht, in hun volgorde: [vak, Nederlands, Engels]. */
export const SECTIONS: readonly [PostSection, string, string][] = [
  ["g5", "Groep 5", "Groep 5"],
  ["post", "Posten", "Posts"],
  ["werkgroep", "Werkgroepen", "Working groups"],
  ["extra", "Jaarwerkingen en overige", "Yearly events and other"],
  ["unknown", "Niet herkend", "Not recognised"],
];
