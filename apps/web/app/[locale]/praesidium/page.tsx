import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { currentWorkingYear, formatWorkingYear, splitYearBar } from "@/lib/workingYear";
import PraesidiumIndex from "./PraesidiumIndex";

/** Aantal jaren dat los in de jaarbalk staat; de rest zit achter "Archief". */
const YEARS_IN_BAR = 5;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("praesidium", "/praesidium", locale);
}

export default async function PraesidiumPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const t = getDictionary(locale).praesidium;

  // Werkingsjaren voor de jaarbalk. Anders dan werkgroepen mag /praesidium bewust
  // ook jaren van vóór FIRST_WORKING_YEAR tonen: de historiek (tot ~20 jaar terug)
  // wordt geïmporteerd als losse memberships met inactieve leden. Daarom bouwen we
  // de jarenlijst uit de data zelf i.p.v. workingYearTabs()/parseWorkingYear() te
  // gebruiken (die klemmen op FIRST_WORKING_YEAR en zouden alle historiek droppen).
  const distinctYears = (
    await prisma.groupMembership.findMany({
      where: { group: { type: "PRAESIDIUM" } },
      distinct: ["year"],
      select: { year: true },
    })
  ).map((r) => r.year);

  const current = currentWorkingYear();
  const yearSet = new Set<number>([...distinctYears, current]);
  const allYears = [...yearSet].sort((a, b) => b - a);

  // Standaardjaar: het huidige werkingsjaar wanneer dat ingevuld is, anders het
  // nieuwste jaar met data (zodat een pas geïmporteerde historiek meteen zichtbaar
  // is en de pagina niet leeg opent).
  const newestWithData = distinctYears.length ? Math.max(...distinctYears) : current;
  const requested = Number(jaar);
  const year = Number.isInteger(requested) && yearSet.has(requested) ? requested : newestWithData;

  const { bar: barYears, archive: archiveYears } = splitYearBar(allYears, year, YEARS_IN_BAR);
  const oldestArchived = archiveYears.at(-1);

  const groups = await prisma.group.findMany({
    where: { type: "PRAESIDIUM" },
    orderBy: { orderInPraesidium: "asc" },
    include: {
      // Inactieve (bv. afgestudeerde) leden horen op de praesidiumpagina thuis, dus
      // filteren we niet op user.active. Tombstones (geanonimiseerd na een
      // account-verwijdering) wél weglaten: deletedAt: null.
      memberships: {
        where: { year, user: { deletedAt: null } },
        include: { user: true },
      },
    },
  });

  const withMembers = groups
    .filter((g) => g.memberships.length > 0)
    // Posten alfabetisch op hun (gelokaliseerde) naam, niet op orderInPraesidium:
    // dat laatste zette Groep 5 bovenaan, wat op de publieke pagina niet gewenst is.
    .sort((a, b) =>
      pick(a.nameNl, a.nameEn, locale).localeCompare(pick(b.nameNl, b.nameEn, locale), locale),
    );

  const indexEntries = withMembers.map((g) => ({
    slug: g.slug,
    name: pick(g.nameNl, g.nameEn, locale),
    count: g.memberships.length,
  }));

  const memberCount = (n: number) =>
    n === 1 ? t.memberCountOne : t.memberCount.replace("{count}", String(n));

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{t.kicker}</div>
          <h1 className="vtk-page-title">{t.title}</h1>
        </div>
        <div className="page-head-meta">
          <div>{t.year}</div>
          <div>
            <b>{formatWorkingYear(year)}</b>
          </div>
        </div>
      </header>
      <div className="vtk-page-shell">
        <div className="vtk-roster-years">
          <span className="vtk-roster-years-label">{t.year}</span>
          {barYears.map((y) => (
            <Link
              key={y}
              href={`${base}/praesidium?jaar=${y}`}
              className="vtk-roster-year"
              aria-current={y === year ? "page" : undefined}
            >
              {formatWorkingYear(y)}
            </Link>
          ))}
          {oldestArchived !== undefined && (
            <details className="vtk-roster-archive">
              <summary>
                {t.archiveTo.replace("{year}", formatWorkingYear(oldestArchived))}
                <span className="vtk-roster-archive-chevron" aria-hidden>
                  ⌄
                </span>
              </summary>
              <div className="vtk-roster-archive-panel">
                {archiveYears.map((y) => (
                  <Link key={y} href={`${base}/praesidium?jaar=${y}`}>
                    {formatWorkingYear(y)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>

        {withMembers.length === 0 ? (
          <p className="vtk-muted">{t.empty}</p>
        ) : (
          <div className="vtk-roster">
            <PraesidiumIndex entries={indexEntries} title={t.posts} toggleLabel={t.jumpToPost} />
            <div>
              {withMembers.map((group) => {
                const sorted = [...group.memberships].sort((a, b) => {
                  // Groepscoördinator (LEAD) eerst, dan de door de import/beheer
                  // ingestelde displayOrder, dan alfabetisch op naam.
                  if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
                  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
                  return a.user.name.localeCompare(b.user.name, locale);
                });
                return (
                  <section key={group.id} id={`post-${group.slug}`} className="vtk-roster-post">
                    <div className="vtk-roster-post-head">
                      <h2>{pick(group.nameNl, group.nameEn, locale)}</h2>
                      <span className="vtk-roster-post-rule" aria-hidden />
                      <span className="vtk-roster-post-count">{memberCount(sorted.length)}</span>
                    </div>
                    <ul className="vtk-roster-grid">
                      {sorted.map((m) => {
                        const src = publicUrl(m.user.avatarKey);
                        const isCoordinator = m.role === "LEAD";
                        // Titel (bv. Praeses) en het groepscoördinator-schap staan los
                        // van elkaar: iemand kan allebei zijn. De titel staat onder de
                        // naam, het coördinatorschap is de gele vlag op de foto.
                        const title = pick(m.titleNl ?? "", m.titleEn ?? "", locale);
                        return (
                          <li
                            key={m.id}
                            className={"vtk-roster-cell" + (isCoordinator ? " is-lead" : "")}
                          >
                            <div className="vtk-roster-photo">
                              {src ? (
                                // De tegel is ongeveer 150px breed en vierkant; een
                                // profielfoto uit storage is dat zelden, dus laat
                                // next/image ze op maat snijden.
                                <Image src={src} alt={m.user.name} width={160} height={160} />
                              ) : (
                                <div className="vtk-roster-initial" aria-hidden>
                                  {m.user.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              {/* Kort op de vlag: "Groepscoördinator" is breder dan
                                  een tegel en zou onder `overflow: hidden` afgesneden
                                  worden. */}
                              {isCoordinator && (
                                <span className="vtk-roster-flag">{t.coordinatorShort}</span>
                              )}
                            </div>
                            <div className="vtk-roster-name">{m.user.name}</div>
                            {title && <div className="vtk-roster-title">{title}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
