/**
 * Exports the editorial content of a running site to JSON fixtures in
 * `packages/db/prisma/fixtures/`, which the seed then uses to fill a local
 * database that resembles the real site.
 *
 * Running it:
 *
 *   FIXTURES_SOURCE_DATABASE_URL="postgresql://..." npm run fixtures:export
 *   FIXTURES_SOURCE_DATABASE_URL="postgresql://..." make fixtures
 *
 * ## Deliberately not pg_dump
 *
 * This database carries member data (name, email, r-number, study programme),
 * orders and payments, door logs, scan logs and mailing lists. `Setting` also
 * holds live secrets: `s3.config` (object storage), `sentry.config`,
 * `door.config`, `brevo.lists`. And `OauthClient.clientSecret` is stored in
 * plaintext; VTK is an SSO provider, so that is the secret of every connected
 * application at once.
 *
 * A dump of that on the laptop of everyone who joins for a semester is not a
 * convenience, it is an incident. This script therefore exports per table, from
 * a fixed list, and only tables that hold public website content.
 *
 * ## Adding something
 *
 * Add a block to `main()` and a type in `packages/db/src/fixtures.ts`. Two rules
 * hold without exception:
 *
 *  - **No personal data.** If you are unsure whether a column leads back to a
 *    person, it does not belong here. `Poc.email` is fine: that is the
 *    functional mailbox of a permanent education committee, not a personal
 *    address.
 *  - **Key on the natural key**, not on the `cuid`. See the explanation in
 *    `fixtures.ts`.
 *
 * For `Setting` an explicit per-key allowlist applies; the rest of that table is
 * suspect by definition.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { FIXTURE_DIR } from "../packages/db/src/fixtures";

/**
 * The only `Setting` keys allowed through: editorial homepage content.
 *
 * An allowlist and not a denylist. With a denylist the next configuration key
 * anyone adds leaks along automatically, and you find out once it is too late.
 */
const SETTING_ALLOWLIST = [
  "home.career",
  "home.aftermovies",
  "home.openingHours.theokot",
  "home.openingHours.cursusdienst",
  "media.aftermovies",
  "media.magazines",
  "site.linkPage",
];

/**
 * Keys that may never go in, not even if someone adds them to the allowlist by
 * accident. Purely a safety net: the allowlist does the real work, this makes
 * the script fail hard if that list is ever edited wrongly.
 */
const SETTING_DENYLIST = [/^s3\./, /^sentry\./, /^door\./, /^brevo\./, /^fakscanner\./];

/** "Eiffage Construction Belux" -> "eiffage-construction-belux". */
export function partnerSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function write(name: string, rows: unknown[]): void {
  const file = join(FIXTURE_DIR, `${name}.json`);
  // An empty table produces no file at all. The loader already treats an empty
  // array as "no fixture" and falls back to the constants, so writing `[]` would
  // commit two bytes that mean nothing and read like a failed export. Any stale
  // file from a previous run is removed, otherwise a table that has since been
  // emptied would keep seeding yesterday's rows.
  if (rows.length === 0) {
    rmSync(file, { force: true });
    console.log(`     -  ${name}.json (empty, not written)`);
    return;
  }
  // Stable formatting: two spaces and a trailing newline, so an export that
  // changes nothing also produces no diff.
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log(`  ${String(rows.length).padStart(4)}  ${name}.json`);
}

/** Drop `null` and `undefined`, so the JSON only shows what is actually set. */
function compact<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
}

async function main() {
  const url = process.env.FIXTURES_SOURCE_DATABASE_URL;
  if (!url) {
    console.error(
      [
        "FIXTURES_SOURCE_DATABASE_URL is missing.",
        "",
        "Point it explicitly at the database you want to export from:",
        "",
        '  FIXTURES_SOURCE_DATABASE_URL="postgresql://user:pass@host:5432/vtk" make fixtures',
        "",
        "Deliberately not DATABASE_URL: an export without arguments would then",
        "export your own local database and capture exactly the stale content",
        "these fixtures are meant to get rid of.",
      ].join("\n"),
    );
    process.exit(1);
  }

  for (const key of SETTING_ALLOWLIST) {
    if (SETTING_DENYLIST.some((re) => re.test(key))) {
      throw new Error(
        `Setting "${key}" is on the allowlist but carries configuration or secrets. Take it off.`,
      );
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  mkdirSync(FIXTURE_DIR, { recursive: true });

  console.log("Exporting to packages/db/prisma/fixtures/\n");

  try {
    const tabs = await prisma.headerTab.findMany({
      orderBy: { order: "asc" },
      include: { links: { orderBy: { order: "asc" } } },
    });
    write(
      "headerTabs",
      tabs.map((tab) =>
        compact({
          code: tab.code,
          slug: tab.slug,
          labelNl: tab.labelNl,
          labelEn: tab.labelEn,
          order: tab.order,
          visible: tab.visible,
          externalUrl: tab.externalUrl,
          introNl: tab.introNl,
          introEn: tab.introEn,
          homeBodyNl: tab.homeBodyNl,
          homeBodyEn: tab.homeBodyEn,
          ctaLabelNl: tab.ctaLabelNl,
          ctaLabelEn: tab.ctaLabelEn,
          ctaUrl: tab.ctaUrl,
          // Deliberately no `imageKey`. The real photos live in the production
          // bucket and are pictures of identifiable students, which this public
          // repository is no place for. Locally the card then falls back to the
          // striped pattern, which is the designed way of showing "no photo
          // here" and is simply true: there is none.
          links: tab.links.map((link) => ({
            labelNl: link.labelNl,
            labelEn: link.labelEn,
            url: link.url,
            order: link.order,
          })),
        }),
      ),
    );

    const pages = await prisma.page.findMany({
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      include: { headerTab: { select: { code: true } } },
    });
    write(
      "pages",
      pages.map((page) =>
        compact({
          slug: page.slug,
          headerTabCode: page.headerTab?.code ?? null,
          visibleInHeader: page.visibleInHeader,
          visibleOnCategoryPage: page.visibleOnCategoryPage,
          titleNl: page.titleNl,
          titleEn: page.titleEn,
          ctaLabelNl: page.ctaLabelNl,
          ctaLabelEn: page.ctaLabelEn,
          ctaUrl: page.ctaUrl,
          needsYearlyEdit: page.needsYearlyEdit,
          // Draft or published matters: a page that is not live on the real site
          // should not be live locally either.
          publishedAt: page.publishedAt?.toISOString() ?? null,
          order: page.order,
          // Deliberately absent, and this is the important part: `contentMd*`,
          // `contentJson*` and `excerpt*`. Those are written by members and name
          // real people; see the explanation on `PageFixture`. Also absent:
          // `createdById` and `contentEditedAt` (who did what, when), `assets`
          // (downloads in production object storage a laptop cannot read),
          // `editorRoles` (access control, not content) and the search vectors
          // (a database trigger maintains those).
        }),
      ),
    );

    const categories = await prisma.calendarCategory.findMany({ orderBy: { order: "asc" } });
    write(
      "calendarCategories",
      categories.map((c) =>
        compact({
          slug: c.slug,
          nameNl: c.nameNl,
          nameEn: c.nameEn,
          descriptionNl: c.descriptionNl,
          descriptionEn: c.descriptionEn,
          colour: c.colour,
          order: c.order,
          audience: c.audience,
          showOnCalendarPage: c.showOnCalendarPage,
        }),
      ),
    );

    const pocs = await prisma.poc.findMany({ orderBy: { order: "asc" } });
    write(
      "pocs",
      pocs.map((p) =>
        compact({
          slug: p.slug,
          nameNl: p.nameNl,
          nameEn: p.nameEn,
          // The functional mailbox of the POC. The representatives themselves
          // (`PocRepresentative`) are people, so they do not come along.
          email: p.email,
          descriptionNl: p.descriptionNl,
          descriptionEn: p.descriptionEn,
          order: p.order,
          studyProgrammes: p.studyProgrammes,
        }),
      ),
    );

    const partners = await prisma.partner.findMany({ orderBy: { order: "asc" } });
    write(
      "partners",
      partners.map((p) =>
        compact({
          name: p.name,
          // Not the real key: that is a random `logos/<hash>.png` in the
          // production bucket, which no laptop can read. A deterministic local
          // key instead, so a developer who wants logos can upload them once
          // under a predictable name; until then the strip falls back to the
          // partner's name as text, which is the designed behaviour.
          logoKey: `partners/seed/${partnerSlug(p.name)}.svg`,
          url: p.url,
          order: p.order,
          active: p.active,
        }),
      ),
    );

    const settings = await prisma.setting.findMany({
      where: { key: { in: SETTING_ALLOWLIST } },
      orderBy: { key: "asc" },
    });
    const leaked = settings.filter((s) => SETTING_DENYLIST.some((re) => re.test(s.key)));
    if (leaked.length > 0) {
      throw new Error(`Refusing: ${leaked.map((s) => s.key).join(", ")} carries secrets.`);
    }
    write(
      "settings",
      settings.map((s) => ({ key: s.key, value: s.value })),
    );

    console.log(
      [
        "",
        "Done. Read the diff before you commit: this should hold public website",
        "content only, no names, addresses or keys.",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
