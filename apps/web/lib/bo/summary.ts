import { statsOf, type Stats } from "./dossiers";
import type { ExplorerData, PostSection, XDossier } from "./explorer";
import type { PostOption } from "./posts";

/*
 * Het overzicht per post onderaan /admin/bestuursorgaan: per post hoeveel
 * budgetten er al op een BO passeerden, hoeveel resultaten er binnen zijn en
 * het percentage, met bovenaan de totalen voor VTK en voor de werkgroepen. Zo
 * hield Groep 5 het vroeger bij in een rekenblad, en elke week gaat er een
 * schermafbeelding van op een slide. Puur, zodat het getest kan worden.
 */

export type SummaryRow = {
  key: string;
  name: string;
  /** Budgetten waarvan de BO al was (of schriftelijk goedgekeurd). */
  due: number;
  /** Daarvan met een resultaat (of zonder budget nodig). */
  done: number;
  missing: number;
  pct: number | null;
};

export type SummarySection = { section: PostSection; rows: SummaryRow[] };

export type Summary = {
  sections: SummarySection[];
  total: Stats;
  vtk: Stats;
  werkgroepen: Stats;
  /** De laatste BO die al plaatsvond, als "BO 9". */
  lastMeeting: string | null;
};

const ORDER: PostSection[] = ["g5", "post", "werkgroep", "jaarwerking", "extra", "unknown"];

export function buildSummary(data: ExplorerData, options: readonly PostOption[]): Summary {
  const blocks = new Map(data.posts.map((p) => [p.key, p]));
  const row = (key: string, name: string): SummaryRow => {
    const s = blocks.get(key)?.stats;
    return { key, name, due: s?.due ?? 0, done: s?.done ?? 0, missing: (s?.due ?? 0) - (s?.done ?? 0), pct: s?.pct ?? null };
  };

  // Elke post en elk vak, ook zonder budget: wie niets indiende, hoort ook op
  // de slide. Een vak voor uitzonderingen enkel als er iets in zit.
  const rows = new Map<PostSection, SummaryRow[]>();
  for (const option of options) {
    if (option.catchAll && !blocks.has(option.key)) continue;
    rows.set(option.section, [...(rows.get(option.section) ?? []), row(option.key, option.name)]);
  }
  // Een naam die de site niet kent, of een post die niet meer actief is.
  const known = new Set(options.map((o) => o.key));
  for (const block of data.posts) {
    if (known.has(block.key)) continue;
    rows.set(block.section, [...(rows.get(block.section) ?? []), row(block.key, block.name)]);
  }

  const sectionOf = new Map<string, PostSection>([
    ...options.map((o) => [o.key, o.section] as const),
    ...data.posts.map((p) => [p.key, p.section] as const),
  ]);
  const isWerkgroep = (d: XDossier) => d.postKeys.length > 0 && d.postKeys.every((k) => sectionOf.get(k) === "werkgroep");

  const past = data.meetings
    .filter((m) => m.date && m.date <= data.today)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1));

  return {
    sections: ORDER.filter((s) => rows.has(s)).map((section) => ({ section, rows: rows.get(section)! })),
    total: data.global,
    vtk: statsOf(data.dossiers.filter((d) => !isWerkgroep(d))),
    werkgroepen: statsOf(data.dossiers.filter(isWerkgroep)),
    lastMeeting: past[0]?.label ?? null,
  };
}
