import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { IconLink, RowActions } from "@/components/ui/IconButton";
import { ExternalLinkIcon, PencilIcon } from "@/components/ui/icons";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";
import { reviewFirstWindow } from "@/lib/reviewFirstPaging";
import { PagesToolbar } from "./PagesToolbar";

const PAGE_SIZE = 25;

/** "review" = na te kijken bovenaan, dan alfabetisch. Dat is de standaard. */
type SortKey = "review" | "name" | "edited";
const SORT_KEYS: SortKey[] = ["review", "name", "edited"];

/**
 * Paginabeheer voor bewerkers: de pagina's waarvan de gebruiker de inhoud mag
 * bewerken (via een paginarol, of allemaal met pages.editAll/superadmin).
 * Jaarlijks na te kijken pagina's die dit werkingsjaar nog niet bewerkt zijn,
 * staan bovenaan met een gele markering. Structuur en metadata (slug, categorie,
 * rollen, publicatie) beheer je in /admin/inhoud.
 *
 * Zoeken en pagineren gebeuren in de DB: we halen per keer maar PAGE_SIZE rijen
 * op, maar `?q=` doorzoekt wel álle pagina's waar de gebruiker aan mag.
 */
export default async function AdminPages({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const { locale: localeParam } = await params;
  const sp = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireAnyPermission(["pages.edit", "pages.editAll"]);
  const canEditAll = hasPermission(session, "pages.editAll");

  const q = (sp.q ?? "").trim();
  const sortKey: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "review";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const rawPage = Math.max(1, Number(sp.page) || 1);

  // Toegang: zonder pages.editAll enkel de pagina's met een rol die de gebruiker
  // dit werkingsjaar draagt. Lege roleIds matcht niets, en dat klopt: een pagina
  // zonder bewerkrollen is vergrendeld (zie docs/design-decisions.md).
  const access: Prisma.PageWhereInput = canEditAll
    ? {}
    : { editorRoles: { some: { roleId: { in: session.roleIds } } } };

  const like = { contains: q, mode: "insensitive" } as const;
  const search: Prisma.PageWhereInput = q
    ? {
        OR: [
          { titleNl: like },
          { titleEn: like },
          { slug: like },
          { headerTab: { is: { OR: [{ labelNl: like }, { labelEn: like }] } } },
          { editorRoles: { some: { role: { OR: [{ nameNl: like }, { nameEn: like }] } } } },
        ],
      }
    : {};

  const where: Prisma.PageWhereInput = { AND: [access, search] };

  // "Na te kijken" is een berekende toestand (jaarlijks-vinkje + niet bewerkt
  // sinds de 15-juli-cutover), geen kolom. Zelfde regel als needsYearlyReview().
  const cutoff = workingYearStart(currentWorkingYear());
  const reviewOnly: Prisma.PageWhereInput = {
    needsYearlyEdit: true,
    OR: [{ contentEditedAt: null }, { contentEditedAt: { lt: cutoff } }],
  };

  const [total, reviewTotal] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.count({ where: { AND: [where, reviewOnly] } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(rawPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  // Enkel de kolommen die de tabel toont. De markdown-inhoud zelf blijft bewust
  // ongelezen: die is groot en de lijst toont ze niet. contentMdEn/contentJsonEn
  // zijn de uitzondering; zonder die velden weten we niet of er een EN-versie is.
  const select = {
    id: true,
    slug: true,
    titleNl: true,
    titleEn: true,
    publishedAt: true,
    needsYearlyEdit: true,
    contentEditedAt: true,
    contentMdEn: true,
    contentJsonEn: true,
    headerTab: { select: { labelNl: true, labelEn: true } },
  } satisfies Prisma.PageSelect;

  type Row = Prisma.PageGetPayload<{ select: typeof select }>;

  // Sorteren op titleNl, ook in EN: Postgres kan niet op COALESCE(titleEn,
  // titleNl) ordenen via Prisma, en de meeste pagina's hebben geen aparte
  // EN-titel. Alfabetisch op NL is dan de bruikbaarste benadering.
  let rows: Row[];
  if (sortKey === "review") {
    // ORDER BY <berekende conditie> kan Prisma niet. Daarom twee queries: eerst
    // het blok "na te kijken", dan de rest; samen vormen ze één doorlopende
    // lijst waar de paginatie gewoon doorheen schuift (zie reviewFirstPaging).
    const w = reviewFirstWindow(offset, PAGE_SIZE, reviewTotal);
    const [reviewRows, restRows] = await Promise.all([
      w.reviewTake > 0
        ? prisma.page.findMany({
            where: { AND: [where, reviewOnly] },
            orderBy: { titleNl: "asc" },
            skip: w.reviewSkip,
            take: w.reviewTake,
            select,
          })
        : Promise.resolve([]),
      w.restTake > 0
        ? prisma.page.findMany({
            where: { AND: [where, { NOT: reviewOnly }] },
            orderBy: { titleNl: "asc" },
            skip: w.restSkip,
            take: w.restTake,
            select,
          })
        : Promise.resolve([]),
    ]);
    rows = [...reviewRows, ...restRows];
  } else {
    const orderBy: Prisma.PageOrderByWithRelationInput =
      sortKey === "edited"
        ? { contentEditedAt: { sort: dir, nulls: "last" } }
        : { titleNl: dir };
    rows = await prisma.page.findMany({ where, orderBy, skip: offset, take: PAGE_SIZE, select });
  }

  // Datum server-side formatteren: dan tonen server en client exact hetzelfde
  // (geen hydration-verschil door tijdzone of ICU-versie).
  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });

  const buildParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", sortKey);
    params.set("dir", dir);
    return params;
  };
  const sortHref = (key: SortKey) => {
    const params = buildParams();
    params.set("sort", key);
    params.set("dir", sortKey === key && dir === "asc" ? "desc" : "asc");
    return `${base}/admin/paginas?${params.toString()}`;
  };
  const pageHref = (p: number) => {
    const params = buildParams();
    params.set("page", String(p));
    return `${base}/admin/paginas?${params.toString()}`;
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Pagina's" : "Pages"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "De inhoud van deze pagina's mag jij bewerken. Slug, categorie en publicatie beheer je via Inhoud."
            : "You can edit the content of these pages. Slug, category and publication are managed via Content."}
        </p>
      </div>

      {reviewTotal > 0 && (
        <p className="rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-4 py-3 text-sm text-[#34405e]">
          {nl
            ? `${reviewTotal} pagina${reviewTotal === 1 ? "" : "'s"} met jaarlijkse info ${reviewTotal === 1 ? "is" : "zijn"} dit werkingsjaar nog niet nagekeken.`
            : `${reviewTotal} page${reviewTotal === 1 ? "" : "s"} with yearly info ${reviewTotal === 1 ? "has" : "have"} not been reviewed yet this working year.`}
        </p>
      )}

      <PagesToolbar locale={locale} initialQuery={q} />

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortableTh
                href={sortHref("name")}
                label={nl ? "Pagina" : "Page"}
                active={sortKey === "name"}
                dir={dir}
              />
              <th>{nl ? "Categorie" : "Category"}</th>
              <th>{nl ? "Talen" : "Languages"}</th>
              <th>Status</th>
              <SortableTh
                href={sortHref("edited")}
                label={nl ? "Laatst bewerkt" : "Last edited"}
                active={sortKey === "edited"}
                dir={dir}
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const title = nl ? p.titleNl : (p.titleEn ?? p.titleNl);
              const category = p.headerTab ? (nl ? p.headerTab.labelNl : p.headerTab.labelEn) : null;
              const published = p.publishedAt !== null;
              const needsReview =
                p.needsYearlyEdit && (p.contentEditedAt === null || p.contentEditedAt < cutoff);
              const editedLabel = p.contentEditedAt ? dateFormat.format(p.contentEditedAt) : null;
              const hasEnglish = Boolean(p.contentMdEn ?? p.contentJsonEn);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      {needsReview && (
                        <span
                          title={
                            nl
                              ? "Dit werkingsjaar nog niet nagekeken"
                              : "Not reviewed yet this working year"
                          }
                          className="size-2 shrink-0 rounded-full bg-vtk-yellow ring-2 ring-vtk-yellow/30"
                        />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`${base}/admin/paginas/${p.id}`}
                          className="font-medium text-vtk-ink hover:underline"
                        >
                          {title}
                        </Link>
                        <div className="truncate font-mono text-[11px] text-[#5c667f]">/{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-[#34405e]">
                    {category ?? <span className="text-[#5c667f]">{nl ? "los" : "unlinked"}</span>}
                  </td>
                  <td className="text-sm text-[#34405e]">{hasEnglish ? "NL + EN" : "NL"}</td>
                  <td>
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        published
                          ? "bg-vtk-yellow/20 text-vtk-ink"
                          : "border border-vtk-blue/15 text-[#5c667f]",
                      ].join(" ")}
                    >
                      {published ? (nl ? "Gepubliceerd" : "Published") : nl ? "Concept" : "Draft"}
                    </span>
                  </td>
                  <td className="text-sm text-[#34405e]">
                    {needsReview ? (
                      <span className="font-medium text-vtk-ink">
                        {nl ? "Na te kijken" : "Needs review"}
                        {editedLabel ? ` · ${editedLabel}` : ""}
                      </span>
                    ) : (
                      (editedLabel ?? "—")
                    )}
                  </td>
                  <td>
                    <RowActions>
                      {published && (
                        <IconLink
                          href={`${base}/p/${p.slug}`}
                          target="_blank"
                          label={nl ? "Bekijk pagina" : "View page"}
                          srLabel={`${nl ? "Bekijk pagina" : "View page"}: ${title}`}
                        >
                          <ExternalLinkIcon />
                        </IconLink>
                      )}
                      <IconLink
                        href={`${base}/admin/paginas/${p.id}`}
                        label={nl ? "Bewerken" : "Edit"}
                        srLabel={`${nl ? "Bewerken" : "Edit"}: ${title}`}
                      >
                        <PencilIcon />
                      </IconLink>
                    </RowActions>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#5c667f]">
                  {q
                    ? nl
                      ? "Geen pagina's gevonden."
                      : "No pages found."
                    : nl
                      ? "Er zijn nog geen pagina's aan jouw rollen toegewezen."
                      : "No pages have been assigned to your roles yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#5c667f]">
        <span>
          {total === 0
            ? nl
              ? "0 pagina's"
              : "0 pages"
            : nl
              ? `${from}–${to} van ${total} pagina's`
              : `${from}–${to} of ${total} pages`}
        </span>
        <div className="flex items-center gap-2">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
            {nl ? "Vorige" : "Previous"}
          </PageLink>
          <span className="tabular-nums">
            {nl ? `Pagina ${page} van ${totalPages}` : `Page ${page} of ${totalPages}`}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
            {nl ? "Volgende" : "Next"}
          </PageLink>
        </div>
      </div>
    </div>
  );
}

function SortableTh({
  href,
  label,
  active,
  dir,
}: {
  href: string;
  label: string;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href} className="inline-flex items-center gap-1">
        <span>{label}</span>
        <Caret active={active} dir={dir} />
      </Link>
    </th>
  );
}

function Caret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={active ? "text-vtk-ink" : "text-zinc-300"}
    >
      {active && dir === "desc" ? <polyline points="6 9 12 15 18 9" /> : <polyline points="18 15 12 9 6 15" />}
    </svg>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-full border border-vtk-blue/10 px-3 py-1 text-zinc-300">{children}</span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-full border border-vtk-blue/20 px-3 py-1 text-vtk-ink hover:bg-vtk-blue-soft/50"
    >
      {children}
    </Link>
  );
}
