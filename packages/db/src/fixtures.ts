import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Content fixtures: the editorial content of the dev site, as JSON in the repo.
 *
 * ## Why this exists
 *
 * The seed used to fill navigation, pages and partners from hand-written
 * constants in `src/groups.ts`. Those constants are create-only (a reseed must
 * not overwrite work done in the admin), so from day one they drift away from
 * what is actually on the site: admins rename a tab, remove one, reorder them.
 * After a while a fresh local database has a navigation that exists nowhere
 * else. That is not a theoretical risk; it once cost half an evening chasing a
 * "bug" in the site header that only existed locally, because local had eleven
 * tabs and the real site had nine.
 *
 * The fixtures are therefore **exported from the dev database**
 * (`npm run fixtures:export`, or `make fixtures`) and committed. They are JSON,
 * so they are readable in a diff: if a tab disappears from the navigation, you
 * see it in the pull request.
 *
 * ## What is not in them
 *
 * Content without personal data, and nothing else. No members, no orders, no
 * payments, no door logs, no tokens, no OAuth clients. See
 * `scripts/export-fixtures.ts`, which holds the full list and refuses to run if
 * a table were added that does not meet that bar.
 *
 * ## Missing?
 *
 * Then the seed falls back to the constants in `src/groups.ts`. A fresh clone
 * works without access to the dev database; you just get the navigation as it
 * was when those constants were written.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "..", "prisma", "fixtures");

/**
 * Relations are keyed on the natural key (`code`, `slug`), not on the `cuid`
 * from the dev database. Otherwise the fixtures could only be imported into an
 * empty database, they would collide on the unique slug as soon as a row already
 * exists with that slug but a different id, and the whole file would change in
 * the diff the moment someone recreates a row.
 */
export type HeaderTabFixture = {
  code: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  order: number;
  visible: boolean;
  externalUrl?: string | null;
  introNl?: string | null;
  introEn?: string | null;
  ctaLabelNl?: string | null;
  ctaLabelEn?: string | null;
  ctaUrl?: string | null;
  links: Array<{ labelNl: string; labelEn: string; url: string; order: number }>;
};

export type PartnerFixture = {
  name: string;
  logoKey: string;
  url?: string | null;
  order: number;
  active: boolean;
};

export type CalendarCategoryFixture = {
  slug: string;
  nameNl: string;
  nameEn: string;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
  colour: string;
  order: number;
  audience?: string | null;
  showOnCalendarPage: boolean;
};

export type PocFixture = {
  slug: string;
  nameNl: string;
  nameEn?: string | null;
  /** Functional mailbox of the POC (poc-xyz@vtk.be), never a personal address. */
  email?: string | null;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
  order: number;
  studyProgrammes: string[];
};

/**
 * A CMS page: the editable content under a category, such as /theokot or
 * /career-fair. This is the bulk of the actual website text.
 *
 * The category is stored as `headerTabCode`, the natural key of the `HeaderTab`,
 * rather than the `headerTabId` foreign key, for the same reason the other
 * fixtures avoid ids. The seed resolves it after the tabs are in place; a page
 * whose category is missing is skipped rather than silently landing outside the
 * navigation.
 */
export type PageFixture = {
  slug: string;
  /** Natural key of the category. Absent = a page without a category. */
  headerTabCode?: string | null;
  visibleInHeader: boolean;
  titleNl: string;
  titleEn?: string | null;
  /** Markdown is the source of truth for page content. */
  contentMdNl?: string | null;
  contentMdEn?: string | null;
  /**
   * Legacy tiptap document. Only exported for pages that were never saved in the
   * markdown editor, because for those it is still the only content there is;
   * otherwise it is dead weight that would double the size of every fixture.
   */
  contentJsonNl?: unknown;
  contentJsonEn?: unknown;
  excerptNl?: string | null;
  excerptEn?: string | null;
  ctaLabelNl?: string | null;
  ctaLabelEn?: string | null;
  ctaUrl?: string | null;
  needsYearlyEdit: boolean;
  /** ISO timestamp, or absent for a page that is still a draft. */
  publishedAt?: string | null;
  order: number;
};

export type SettingFixture = { key: string; value: unknown };

export type Fixtures = {
  headerTabs: HeaderTabFixture[];
  pages: PageFixture[];
  partners: PartnerFixture[];
  calendarCategories: CalendarCategoryFixture[];
  pocs: PocFixture[];
  settings: SettingFixture[];
};

/** One fixture file, or `null` when it is not there. */
function readFixture<T>(name: string): T[] | null {
  try {
    const raw = readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8");
    const parsed = JSON.parse(raw);
    // An empty file is not a fixture but a failed export, and the seed must not
    // quietly take that as an instruction to leave the whole navigation empty.
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as T[];
  } catch (err) {
    // ENOENT is the normal state in a fresh clone: no fixtures, so the seed uses
    // its constants. Every other error (broken JSON, no read permission) has to
    // fail loudly; continuing silently would ignore the fixtures and produce a
    // database nobody expects.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Fixture ${name}.json is unreadable: ${(err as Error).message}`);
  }
}

export function loadFixtures(): Partial<Fixtures> {
  return {
    headerTabs: readFixture<HeaderTabFixture>("headerTabs") ?? undefined,
    pages: readFixture<PageFixture>("pages") ?? undefined,
    partners: readFixture<PartnerFixture>("partners") ?? undefined,
    calendarCategories: readFixture<CalendarCategoryFixture>("calendarCategories") ?? undefined,
    pocs: readFixture<PocFixture>("pocs") ?? undefined,
    settings: readFixture<SettingFixture>("settings") ?? undefined,
  };
}

export { FIXTURE_DIR };
