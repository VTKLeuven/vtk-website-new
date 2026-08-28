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

import "@/app/design/vtk-home.css";

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

/**
 * Alle POC's, per werkingsjaar. Bewust dezelfde kaarten als de POC-band op de
 * homepage (`.poc-grid` / `.poccard` in vtk-home.css): een lid dat daar zijn
 * eigen POC ziet en hier doorklikt, hoort hetzelfde beeld te krijgen.
 */
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

  const pocs = await prisma.poc.findMany({
    orderBy: { order: "asc" },
    include: {
      representatives: {
        where: { year, user: { deletedAt: null } },
        orderBy: { order: "asc" },
        include: { user: true },
      },
    },
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

      <div className="vtk-page-shell">
        {pocs.length === 0 ? (
          <p className="text-[#5c667f]">{t.empty}</p>
        ) : (
          <div className="vtk-design">
            <div className="poc-grid" data-groups={Math.min(pocs.length, 2)}>
              {pocs.map((poc) => (
                <div className="poccard" key={poc.id}>
                  <div className="poccard-head">
                    <h3>{pick(poc.nameNl, poc.nameEn ?? poc.nameNl, locale)}</h3>
                    {poc.email ? (
                      <a className="poc-mail" href={`mailto:${poc.email}`}>
                        {poc.email}
                      </a>
                    ) : null}
                  </div>
                  {poc.representatives.length === 0 ? (
                    <p className="text-sm text-[#5c667f]">{t.noRepresentatives}</p>
                  ) : (
                    <ul className="poc-people">
                      {poc.representatives.map((rep) => {
                        const avatar = publicUrl(rep.user.avatarKey);
                        return (
                          <li key={rep.id}>
                            <span className="poc-face">
                              {avatar ? (
                                // .poc-face is 64x64 (vtk-home.css); die maat meegeven
                                // scheelt het verschil met de volledige profielfoto.
                                <Image src={avatar} alt="" width={64} height={64} />
                              ) : (
                                <span className="poc-initial" aria-hidden="true">
                                  {rep.user.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <span className="poc-name">{rep.user.name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
