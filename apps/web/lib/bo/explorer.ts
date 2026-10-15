import type { BoLine } from "./figures";
import type { BoOverview, Dossier, DocView, DossierStatus, MeetingView, Stats } from "./dossiers";
import type { BoKind, MeetingKind } from "./names";

/*
 * Wat de verkenner op /admin/bestuursorgaan in de browser krijgt: het overzicht
 * van één werkingsjaar, met datums als tekst ("2026-11-04") zodat het van de
 * server naar een clientcomponent kan. Puur, en zonder imports die iets anders
 * dan types meebrengen: dit bestand belandt in de clientbundel.
 */

export type XDoc = Omit<DocView, "meetingDate"> & { meetingDate: string | null };

export type XDossier = Omit<Dossier, "eventDate" | "lastSeen" | "budgets" | "results"> & {
  eventDate: string | null;
  postName: string;
  budgets: XDoc[];
  results: XDoc[];
};

export type XPost = { key: string; groupId: string | null; name: string; stats: Stats };

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

export type { BoKind, BoLine, DossierStatus, MeetingKind, Stats };

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function toExplorerData(overview: BoOverview, year: number, today: Date): ExplorerData {
  const doc = (d: DocView): XDoc => ({ ...d, meetingDate: iso(d.meetingDate) });
  return {
    year,
    today: iso(today)!,
    posts: overview.posts.map((p) => ({ key: p.key, groupId: p.groupId, name: p.name, stats: p.stats })),
    dossiers: overview.posts.flatMap((p) =>
      p.dossiers.map(({ eventDate, lastSeen, budgets, results, ...rest }) => {
        void lastSeen; // enkel om op te sorteren; de volgorde zit al in de lijst
        return { ...rest, eventDate: iso(eventDate), postName: p.name, budgets: budgets.map(doc), results: results.map(doc) };
      }),
    ),
    meetings: overview.meetings.map((m) => ({ ...m, date: iso(m.date) })),
    global: overview.global,
  };
}
