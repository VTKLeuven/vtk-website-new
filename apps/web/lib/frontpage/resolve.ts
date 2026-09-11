import "server-only";
import { prisma } from "@vtk/db";
import { readFieldValues, type FieldValues } from "./fields";
import {
  DEFAULT_FRONTPAGE_ID,
  getFrontpageModule,
  type FrontpageModule,
} from "./registry";

export type ResolvedFrontpage = {
  module: FrontpageModule;
  values: FieldValues;
  /**
   * De hero-titel zoals die vóór de slogans in `Frontpage.values` stond.
   *
   * Die velden zijn uit de registry gehaald, dus `values` bevat ze niet meer,
   * maar een site die er ooit een eigen titel in typte mag die niet zomaar zien
   * verdwijnen. `resolveSlogans` gebruikt dit enkel wanneer er geen enkele
   * slogan overblijft, wat in de praktijk betekent: zolang de instelling
   * `home.slogans` niet bestaat. Vanaf de eerste keer opslaan in
   * /admin/slogans wordt hier niet meer naar gekeken.
   */
  legacyHero: { nl: string; en?: string } | null;
};

/** Dezelfde samenstelling als de migratie in lib/slogans.ts, op de ruwe JSON. */
export function legacyHeroFrom(values: unknown): { nl: string; en?: string } | null {
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const obj = values as Record<string, unknown>;
  const text = (key: string) => (typeof obj[key] === "string" ? (obj[key] as string).trim() : "");
  const compose = (title: string, accent: string, tail: string) => {
    const head = accent ? `${title ? `${title} ` : ""}*${accent}*` : title;
    if (!head) return tail;
    if (!tail) return title && accent ? `${title}\n*${accent}*` : head;
    return `${head}\n${tail}`;
  };
  const nl = compose(text("titleNl"), text("accentNl"), text("tailNl"));
  const en = compose(text("titleEn"), text("accentEn"), text("tailEn"));
  if (!nl && !en) return null;
  return { nl: nl || en, en: en || undefined };
}

export type FrontpageStatus = "live" | "scheduled" | "expired" | "off";

/**
 * Where a configured front page stands, purely derived from its own fields.
 * Whether it is actually on screen also depends on the others; see
 * `resolveFrontpage`.
 */
export function frontpageStatus(
  row: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): FrontpageStatus {
  if (!row.active) return "off";
  if (row.endsAt && row.endsAt < now) return "expired";
  if (row.startsAt && row.startsAt > now) return "scheduled";
  return "live";
}

/**
 * Which front page the homepage should render, and with which field values.
 *
 * An event front page takes over while it is active and inside its window. With
 * several eligible at once the one that started most recently wins; there is only
 * one front page, so "show both" does not exist. Outside every window the default
 * is used, which is why it can never be switched off.
 *
 * A row pointing at a layout that is no longer in the registry is ignored rather
 * than fatal: deleting a component should not take the homepage down with it.
 */
/** The bare minimum `pickActiveTakeover` needs, so the admin can pass its rows too. */
export type FrontpageRow = {
  layout: string;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  createdAt: Date;
};

/**
 * Which takeover is on screen, or `null` when the default is.
 *
 * The one place that decides this. It used to be decided twice, once here for
 * the homepage and once in the admin to draw the "on the site right now" badge,
 * and the two disagreed: this side ordered in the database, where Postgres puts
 * NULL *first* on `ORDER BY ... DESC`, so a front page switched on by hand with
 * no window beat a scheduled one; the admin mapped that same NULL to 0 and
 * sorted it last. The homepage then showed one page while the admin pointed at
 * another. Two implementations of one rule is the actual bug; this function is
 * the fix.
 *
 * The tie-break is `startsAt ?? createdAt`, not `updatedAt`: editing a field
 * should never quietly change which front page wins. A row with no window is
 * therefore ranked by when it was made, which puts it below anything actively
 * scheduled for today.
 */
export function pickActiveTakeover<T extends FrontpageRow>(rows: T[], now: Date): T | null {
  const live = rows.filter(
    (row) =>
      row.layout !== DEFAULT_FRONTPAGE_ID &&
      getFrontpageModule(row.layout) !== null &&
      frontpageStatus(row, now) === "live",
  );
  if (live.length === 0) return null;
  return live
    .slice()
    .sort(
      (a, b) =>
        (b.startsAt ?? b.createdAt).getTime() - (a.startsAt ?? a.createdAt).getTime(),
    )[0];
}

export async function resolveFrontpage(now = new Date()): Promise<ResolvedFrontpage> {
  const rows = await prisma.frontpage.findMany();

  const takeover = pickActiveTakeover(rows, now);

  const chosen = takeover ?? rows.find((row) => row.layout === DEFAULT_FRONTPAGE_ID);
  const layoutModule =
    (chosen && getFrontpageModule(chosen.layout)) ?? getFrontpageModule(DEFAULT_FRONTPAGE_ID)!;

  // De oude hero-tekst hoort bij de standaardpagina, ook wanneer een campagne de
  // hero overneemt: die heeft haar eigen titelvelden en roteert niet.
  const defaultRow = rows.find((row) => row.layout === DEFAULT_FRONTPAGE_ID);

  return {
    module: layoutModule,
    values: chosen ? readFieldValues(chosen.values, layoutModule.fields) : {},
    legacyHero: legacyHeroFrom(defaultRow?.values),
  };
}
