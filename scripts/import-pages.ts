/**
 * Importeer de oude Litus-pagina's (na review) als CMS-pagina's in de nieuwe DB.
 *
 * Workflow:
 *   1. open scripts/review-litus-pages.html in de browser en laad
 *      scripts/litus_website_pages.json;
 *   2. kijk elke pagina na (titel, slug, categorie, bewerkrollen, inhoud,
 *      jaarlijks nakijken, of verwijder ze) en exporteer pages-import.json;
 *   3. importeer:
 *        npm run import:pages -- scripts/pages-import.json --dry-run
 *        npm run import:pages -- scripts/pages-import.json
 *
 * Wat het doet, per pagina in de JSON:
 *   - pagina's met `deleted: true` overslaan (in de review weggegooid);
 *   - BESTAAT de slug al in de DB, dan wordt de pagina volledig overgeslagen:
 *     bestaande data is nieuwer en wint altijd van de oude website;
 *   - anders een `Page` aanmaken met markdown als inhoud (contentJsonNl krijgt
 *     het lege legacy-tiptapdocument, net als nieuwe pagina's uit de editor),
 *     gekoppeld aan de headertab en met de gekozen bewerkrollen.
 *
 * Headertabs worden geresolved op code of slug; een tab die nog niet in de DB
 * staat maar wel in de statische HEADER_TABS-seed zit, wordt aangemaakt (zelfde
 * rijen als "importeer standaardtabs" in /admin/inhoud). Rollen worden
 * geresolved op code of naam (NL/EN); onbekende rollen worden overgeslagen met
 * een waarschuwing, er worden er GEEN aangemaakt (een rol draagt rechten, die
 * maak je bewust aan via /admin/roles).
 *
 * Idempotent: een herrun slaat alles wat al bestaat over en dupliceert niets.
 * Let op: dat betekent ook dat wijzigingen in de JSON na een eerste import niet
 * meer toegepast worden; bewerk dan gewoon via /admin/inhoud.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
import { prisma, HEADER_TABS } from "@vtk/db";

// ---------------------------------------------------------------------------
// JSON-formaat: de export van review-litus-pages.html.
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Leeg tiptap-document voor de verplichte legacy JSON-kolom; markdown is de
 *  bron van waarheid (zie createPageAction in apps/web/app/actions/pages.ts). */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const pageSchema = z.object({
  slug: z.string().regex(SLUG_REGEX),
  titleNl: z.string().min(1),
  titleEn: z.string().min(1).nullable().optional(),
  excerptNl: z.string().min(1).nullable().optional(),
  excerptEn: z.string().min(1).nullable().optional(),
  contentMdNl: z.string(),
  contentMdEn: z.string().nullable().optional(),
  /** Headertab-referentie: code of slug (bv. "AANBOD" of "info"). Null = los. */
  headerTab: z.string().nullable().optional(),
  visibleInHeader: z.boolean().default(true),
  /** True: publishedAt = importmoment. False: onzichtbaar concept. */
  published: z.boolean().default(true),
  needsYearlyEdit: z.boolean().default(false),
  order: z.number().int().default(0),
  /** Rol-referenties (code of naam) die de inhoud mogen bewerken. */
  editorRoles: z.array(z.string().min(1)).default([]),
  /** Reviewvelden uit de tool; hier alleen ter info. */
  status: z.enum(["todo", "ok"]).optional(),
  deleted: z.boolean().default(false),
  origSlug: z.string().optional(),
});

const fileSchema = z.object({
  generatedAt: z.string().optional(),
  pages: z.array(pageSchema).min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

function log(msg: string) {
  process.stdout.write(`[${new Date().toTimeString().slice(0, 8)}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Argumenten
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const inputPath = args.find((a) => !a.startsWith("--"));

// ---------------------------------------------------------------------------
// Headertab-resolutie (met aanmaak vanuit de statische seed)
// ---------------------------------------------------------------------------

async function buildTabResolver() {
  const tabs = await prisma.headerTab.findMany({ select: { id: true, code: true, slug: true } });
  log(`  ${tabs.length} bestaande headertab(s) geladen uit de DB`);
  const byKey = new Map<string, string>();
  for (const t of tabs) {
    byKey.set(norm(t.code), t.id);
    byKey.set(norm(t.slug), t.id);
  }
  const createdCodes = new Set<string>();

  async function resolve(ref: string): Promise<string | null> {
    const key = norm(ref);
    const existing = byKey.get(key);
    if (existing) return existing;

    // Niet in de DB: enkel aanmaken wanneer de statische seed de tab kent, met
    // exact de seedrijen (zoals importDefaultHeaderTabsAction in de app).
    const seed = HEADER_TABS.find((t) => norm(t.code) === key || norm(t.slug) === key);
    if (!seed) return null;

    let id = `(dry:${seed.code})`;
    if (!DRY_RUN) {
      const tab = await prisma.headerTab.upsert({
        where: { code: seed.code },
        create: {
          code: seed.code,
          slug: seed.slug,
          labelNl: seed.labelNl,
          labelEn: seed.labelEn,
          order: seed.order,
          visible: true,
          introNl: seed.introNl ?? null,
          introEn: seed.introEn ?? null,
          ctaLabelNl: seed.ctaLabelNl ?? null,
          ctaLabelEn: seed.ctaLabelEn ?? null,
          ctaUrl: seed.ctaUrl ?? null,
        },
        update: {},
        select: { id: true },
      });
      id = tab.id;
    }
    log(`  ${DRY_RUN ? "(dry) zou headertab aanmaken" : "+ headertab aangemaakt"}: ${seed.labelNl} (${seed.code})`);
    byKey.set(norm(seed.code), id);
    byKey.set(norm(seed.slug), id);
    createdCodes.add(seed.code);
    return id;
  }

  return { resolve, createdCodes };
}

// ---------------------------------------------------------------------------
// Rolresolutie (zonder aanmaak)
// ---------------------------------------------------------------------------

async function buildRoleResolver() {
  const roles = await prisma.role.findMany({ select: { id: true, code: true, nameNl: true, nameEn: true } });
  log(`  ${roles.length} bestaande rol(len) geladen uit de DB`);
  const byKey = new Map<string, string>();
  for (const r of roles) {
    for (const k of [r.code, r.nameNl, r.nameEn]) if (k) byKey.set(norm(k), r.id);
  }
  const unknown = new Set<string>();
  return {
    resolve(ref: string): string | null {
      const id = byKey.get(norm(ref));
      if (!id) unknown.add(ref);
      return id ?? null;
    },
    unknown,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!inputPath) {
    log("Gebruik: tsx scripts/import-pages.ts <pages-import.json> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  log(`${DRY_RUN ? "[DRY-RUN] " : ""}Start import uit ${inputPath}`);

  log("Stap 1/4: JSON inlezen en valideren...");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (err) {
    log(`Kon ${inputPath} niet lezen/parsen: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    log("JSON komt niet overeen met het verwachte formaat (export van review-litus-pages.html):");
    for (const issue of parsed.error.issues) {
      log(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const all = parsed.data.pages;
  const deletedCount = all.filter((p) => p.deleted).length;
  const pages = all.filter((p) => !p.deleted);

  // Dubbele slugs vroeg vangen: Page.slug is globaal uniek, de tweede create
  // zou klappen en de export hoort dit al tegen te houden.
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.slug)) dups.add(p.slug);
    seen.add(p.slug);
  }
  if (dups.size > 0) {
    log(`Dubbele slugs in de JSON: ${[...dups].join(", ")}`);
    log("Los dit op in de reviewtool (hernoem of verwijder) en exporteer opnieuw.");
    process.exitCode = 1;
    return;
  }

  const todo = pages.filter((p) => p.status && p.status !== "ok").length;
  log(`  ${pages.length} pagina('s) te importeren, ${deletedCount} als verwijderd gemarkeerd`);
  if (todo > 0) {
    log(`  Let op: ${todo} pagina('s) staan nog op 'todo' in de review; ze worden wel geimporteerd.`);
  }

  log("Stap 2/4: headertabs en rollen inladen...");
  const tabResolver = await buildTabResolver();
  const roleResolver = await buildRoleResolver();

  log(`Stap 3/4: ${pages.length} pagina('s) verwerken...`);
  let created = 0;
  let skippedExisting = 0;
  let unresolvedTabs = 0;
  const errors: string[] = [];
  const importStamp = new Date();

  let i = 0;
  for (const page of pages) {
    i++;
    try {
      // Bestaande data wint ALTIJD: staat de slug al in de DB (geseed, via de
      // GUI aangemaakt, of een eerdere run), dan blijft die rij onaangeroerd.
      const existing = await prisma.page.findUnique({
        where: { slug: page.slug },
        select: { id: true },
      });
      if (existing) {
        log(`  [${i}/${pages.length}] ~ ${page.slug}: bestaat al in de DB, overgeslagen (bestaande pagina wint)`);
        skippedExisting++;
        continue;
      }

      let headerTabId: string | null = null;
      if (page.headerTab) {
        headerTabId = await tabResolver.resolve(page.headerTab);
        if (!headerTabId) {
          log(`  ! ${page.slug}: headertab "${page.headerTab}" onbekend (niet in DB en niet in de seed); pagina komt los te staan`);
          unresolvedTabs++;
        }
      }

      const roleIds = [...new Set(page.editorRoles.map((r) => roleResolver.resolve(r)).filter((id): id is string => id !== null))];

      const contentMdEn = page.contentMdEn && page.contentMdEn.trim() !== "" ? page.contentMdEn : null;

      if (!DRY_RUN) {
        await prisma.page.create({
          data: {
            slug: page.slug,
            headerTabId,
            visibleInHeader: page.visibleInHeader,
            titleNl: page.titleNl,
            titleEn: page.titleEn ?? null,
            excerptNl: page.excerptNl ?? null,
            excerptEn: page.excerptEn ?? null,
            contentJsonNl: EMPTY_DOC,
            contentMdNl: page.contentMdNl,
            contentMdEn,
            needsYearlyEdit: page.needsYearlyEdit,
            // contentEditedAt blijft null: de inhoud is nog niet in de nieuwe
            // editor nagekeken, dus jaarlijks-nakijken-pagina's komen terecht
            // bovenaan het paginabeheer te staan.
            publishedAt: page.published ? importStamp : null,
            order: page.order,
            editorRoles: { create: roleIds.map((roleId) => ({ roleId })) },
          },
        });
      }
      log(`  [${i}/${pages.length}] ${DRY_RUN ? "(dry) zou aanmaken" : "+ aangemaakt"}: ${page.slug} (${page.titleNl})`);
      created++;
    } catch (err) {
      const msg = `${page.slug}: ${(err as Error).message}`;
      errors.push(msg);
      log(`  FOUT bij ${msg}`);
    }
  }

  log("Stap 4/4: klaar.");
  log("");
  log(`${DRY_RUN ? "[DRY-RUN] " : ""}Samenvatting:`);
  log(`  Pagina's aangemaakt:      ${created}`);
  log(`  Overgeslagen (bestond al): ${skippedExisting}`);
  log(`  Overgeslagen (verwijderd in review): ${deletedCount}`);
  log(
    `  Headertabs aangemaakt:    ${tabResolver.createdCodes.size}${tabResolver.createdCodes.size ? " (" + [...tabResolver.createdCodes].join(", ") + ")" : ""}`,
  );
  if (unresolvedTabs > 0) {
    log(`  Onbekende headertabs:     ${unresolvedTabs} pagina('s) losgekoppeld geimporteerd`);
  }
  if (roleResolver.unknown.size > 0) {
    log(`  Onbekende rollen (overgeslagen): ${[...roleResolver.unknown].join(", ")}`);
    log(`  Maak ze eerst aan via /admin/roles en ken ze daarna handmatig toe via /admin/inhoud.`);
  }
  if (errors.length > 0) {
    log(`  Fouten:                   ${errors.length}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    log(`Onverwachte fout: ${(err as Error).stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
