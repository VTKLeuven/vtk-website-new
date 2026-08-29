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

/** Aantal jaren dat los in de jaarbalk staat; de rest zit achter "Archief". */
const YEARS_IN_BAR = 5;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("pocs", "/pocs", locale);
}

function displayPocName(name: string): string {
  return name.replace(/^POC\s+/i, "").trim();
}

export default async function PocsPage({
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
  const t = getDictionary(locale).pocs;

  const distinctYears = (
    await prisma.pocRepresentative.findMany({
      distinct: ["year"],
      select: { year: true },
    })
  ).map((r) => r.year);

  const current = currentWorkingYear();
  const yearSet = new Set<number>([...distinctYears, current]);
  const allYears = [...yearSet].sort((a, b) => b - a);

  const newestWithData = distinctYears.length ? Math.max(...distinctYears) : current;
  const requested = Number(jaar);
  const year = Number.isInteger(requested) && yearSet.has(requested) ? requested : newestWithData;

  const { bar: barYears, archive: archiveYears } = splitYearBar(allYears, year, YEARS_IN_BAR);
  const oldestArchived = archiveYears.at(-1);

  const allPocs = await prisma.poc.findMany({
    orderBy: { order: "asc" },
    include: {
      representatives: {
        where: { year, user: { deletedAt: null } },
        orderBy: { order: "asc" },
        include: { user: true },
      },
    },
  });

  // POC's zonder vertegenwoordigers in dit werkingsjaar worden verborgen
  const withMembers = allPocs
    .filter((poc) => poc.representatives.length > 0)
    .sort((a, b) => {
      const nameA = displayPocName(pick(a.nameNl, a.nameEn, locale));
      const nameB = displayPocName(pick(b.nameNl, b.nameEn, locale));
      return nameA.localeCompare(nameB, locale);
    });

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

      {/* De jaarbalk staat in een eigen schil zonder onderpadding */}
      <div className="vtk-page-shell vtk-roster-shell">
        <div className="vtk-roster-years">
          <span className="vtk-roster-years-label">{t.year}</span>
          {barYears.map((y) => (
            <Link
              key={y}
              href={`${base}/pocs?jaar=${y}`}
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
                  <Link key={y} href={`${base}/pocs?jaar=${y}`}>
                    {formatWorkingYear(y)}
                  </Link>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {withMembers.length === 0 ? (
        <div className="vtk-page-shell">
          <p className="vtk-muted">{t.noRepresentatives}</p>
        </div>
      ) : (
        <section className="vtk-wall">
          <div className="vtk-wall-inner">
            {/* Quick jump navigatie naar de verschillende POC's */}
            <nav className="vtk-wall-jump" aria-label={t.pocs}>
              <span className="vtk-wall-jump-label">{t.pocs}</span>
              {withMembers.map((poc) => {
                const name = displayPocName(pick(poc.nameNl, poc.nameEn, locale));
                return (
                  <a key={poc.id} href={`#poc-${poc.slug}`}>
                    {name}
                  </a>
                );
              })}
            </nav>

            {withMembers.map((poc) => {
              const sorted = [...poc.representatives].sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.user.name.localeCompare(b.user.name, locale);
              });
              const name = displayPocName(pick(poc.nameNl, poc.nameEn, locale));
              return (
                <div key={poc.id} id={`poc-${poc.slug}`} className="vtk-wall-row">
                  <div className="vtk-wall-label">
                    <div className="vtk-wall-label-inner">
                      <h2>{name}</h2>
                      {poc.email ? (
                        <a className="vtk-wall-email" href={`mailto:${poc.email}`}>
                          {poc.email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <ul className="vtk-wall-faces">
                    {sorted.map((rep) => {
                      const src = publicUrl(rep.user.avatarKey);
                      return (
                        <li key={rep.id} className="vtk-roster-cell">
                          <div className={"vtk-roster-photo" + (src ? "" : " is-blank")}>
                            {src ? (
                              <Image
                                src={src}
                                alt={rep.user.name}
                                width={192}
                                height={192}
                              />
                            ) : (
                              <div className="vtk-roster-initial" aria-hidden>
                                {rep.user.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="vtk-roster-name">{rep.user.name}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
