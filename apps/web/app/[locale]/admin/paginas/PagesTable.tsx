"use client";

import Link from "next/link";
import type { Locale } from "@vtk/i18n";
import { IconLink, RowActions } from "@/components/ui/IconButton";
import { ExternalLinkIcon, PencilIcon } from "@/components/ui/icons";
import { SearchBar, SortHeader, useTableControls } from "../admin-table";

export type PageRow = {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  hasEnglish: boolean;
  published: boolean;
  needsYearlyEdit: boolean;
  /** Jaarlijks na te kijken én dit werkingsjaar nog niet bewerkt. */
  needsReview: boolean;
  contentEditedAt: string | null;
  /** Server-side geformatteerd, zodat server en client hetzelfde renderen. */
  contentEditedLabel: string | null;
  roleNames: string[];
};

/**
 * Overzicht van de pagina's die de gebruiker mag bewerken. Jaarlijks na te
 * kijken pagina's die dit werkingsjaar nog niet bewerkt zijn, komen binnen met
 * een gele markering en staan bovenaan (tot de gebruiker zelf sorteert).
 */
export function PagesTable({ locale, rows }: { locale: Locale; rows: PageRow[] }) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const { query, setQuery, sort, toggleSort, filtered } = useTableControls(rows, {
    searchOf: (r) =>
      [r.title, r.slug, r.category ?? "", ...r.roleNames].join(" ").toLowerCase(),
    nameOf: (r) => r.title,
    countOf: (r) => (r.contentEditedAt ? Date.parse(r.contentEditedAt) : 0),
    locale,
  });

  const reviewCount = rows.filter((r) => r.needsReview).length;

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

      {reviewCount > 0 && (
        <p className="rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-4 py-3 text-sm text-[#34405e]">
          {nl
            ? `${reviewCount} pagina${reviewCount === 1 ? "" : "'s"} met jaarlijkse info ${reviewCount === 1 ? "is" : "zijn"} dit werkingsjaar nog niet nagekeken.`
            : `${reviewCount} page${reviewCount === 1 ? "" : "s"} with yearly info ${reviewCount === 1 ? "has" : "have"} not been reviewed yet this working year.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={nl ? "Zoek op titel, slug of categorie" : "Search by title, slug or category"}
          ariaLabel={nl ? "Pagina's zoeken" : "Search pages"}
        />
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortHeader
                label={nl ? "Pagina" : "Page"}
                active={sort?.key === "name" ? sort.dir : null}
                onClick={() => toggleSort("name")}
              />
              <th>{nl ? "Categorie" : "Category"}</th>
              <th>{nl ? "Talen" : "Languages"}</th>
              <th>Status</th>
              <SortHeader
                label={nl ? "Laatst bewerkt" : "Last edited"}
                active={sort?.key === "count" ? sort.dir : null}
                onClick={() => toggleSort("count")}
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((page) => (
              <tr key={page.id}>
                <td>
                  <div className="flex items-center gap-2">
                    {page.needsReview && (
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
                        href={`${base}/admin/paginas/${page.id}`}
                        className="font-medium text-vtk-ink hover:underline"
                      >
                        {page.title}
                      </Link>
                      <div className="truncate font-mono text-[11px] text-[#5c667f]">/{page.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="text-sm text-[#34405e]">
                  {page.category ?? <span className="text-[#5c667f]">{nl ? "los" : "unlinked"}</span>}
                </td>
                <td className="text-sm text-[#34405e]">{page.hasEnglish ? "NL + EN" : "NL"}</td>
                <td>
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      page.published
                        ? "bg-vtk-yellow/20 text-vtk-ink"
                        : "border border-vtk-blue/15 text-[#5c667f]",
                    ].join(" ")}
                  >
                    {page.published ? (nl ? "Gepubliceerd" : "Published") : nl ? "Concept" : "Draft"}
                  </span>
                </td>
                <td className="text-sm text-[#34405e]">
                  {page.needsReview ? (
                    <span className="font-medium text-vtk-ink">
                      {nl ? "Na te kijken" : "Needs review"}
                      {page.contentEditedLabel ? ` · ${page.contentEditedLabel}` : ""}
                    </span>
                  ) : (
                    (page.contentEditedLabel ?? "—")
                  )}
                </td>
                <td>
                  <RowActions>
                    {page.published && (
                      <IconLink
                        href={`${base}/p/${page.slug}`}
                        target="_blank"
                        label={nl ? "Bekijk pagina" : "View page"}
                        srLabel={`${nl ? "Bekijk pagina" : "View page"}: ${page.title}`}
                      >
                        <ExternalLinkIcon />
                      </IconLink>
                    )}
                    <IconLink
                      href={`${base}/admin/paginas/${page.id}`}
                      label={nl ? "Bewerken" : "Edit"}
                      srLabel={`${nl ? "Bewerken" : "Edit"}: ${page.title}`}
                    >
                      <PencilIcon />
                    </IconLink>
                  </RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#5c667f]">
          {query
            ? nl
              ? "Geen pagina's gevonden."
              : "No pages found."
            : nl
              ? "Er zijn nog geen pagina's aan jouw rollen toegewezen."
              : "No pages have been assigned to your roles yet."}
        </p>
      )}
    </div>
  );
}
