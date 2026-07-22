import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";

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

  // Werkingsjaren voor de tabjes. Anders dan werkgroepen mag /praesidium bewust
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
  const tabs = [...yearSet].sort((a, b) => b - a);

  // Standaardjaar: het huidige werkingsjaar wanneer dat ingevuld is, anders het
  // nieuwste jaar met data (zodat een pas geïmporteerde historiek meteen zichtbaar
  // is en de pagina niet leeg opent).
  const newestWithData = distinctYears.length ? Math.max(...distinctYears) : current;
  const requested = Number(jaar);
  const year = Number.isInteger(requested) && yearSet.has(requested) ? requested : newestWithData;

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

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{t.kicker}</div>
          <h1 className="vtk-page-title">{t.title}</h1>
        </div>
      </header>
      <div className="vtk-page-shell space-y-10">
        {/* Werkingsjaar-tabjes */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((y) => {
            const active = y === year;
            return (
              <Link
                key={y}
                href={`${base}/praesidium?jaar=${y}`}
                className={
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "border-vtk-ink bg-vtk-ink text-white"
                    : "border-vtk-blue/20 bg-white text-vtk-ink hover:bg-vtk-blue-soft/50")
                }
              >
                {formatWorkingYear(y)}
              </Link>
            );
          })}
        </div>

        {withMembers.length === 0 ? (
          <p className="text-[#5c667f]">{t.empty}</p>
        ) : (
          <div className="space-y-14">
            {withMembers.map((group) => {
              const sorted = [...group.memberships].sort((a, b) => {
                // Groepscoördinator (LEAD) eerst, dan de door de import/beheer
                // ingestelde displayOrder, dan alfabetisch op naam.
                if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
                if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
                return a.user.name.localeCompare(b.user.name, locale);
              });
              return (
                <section key={group.id}>
                  <div className="mb-5 flex items-baseline gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-vtk-ink">
                      {pick(group.nameNl, group.nameEn, locale)}
                    </h2>
                    <span className="rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-vtk-blue-muted">
                      {sorted.length}
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {sorted.map((m) => {
                      const src = publicUrl(m.user.avatarKey);
                      const isCoordinator = m.role === "LEAD";
                      // Titel (bv. Praeses) en het groepscoördinator-schap staan los
                      // van elkaar: iemand kan allebei zijn. De titel is de subtitel,
                      // het coördinatorschap een aparte gele pin + accentrand.
                      const title = pick(m.titleNl ?? "", m.titleEn ?? "", locale);
                      return (
                        <li key={m.id}>
                          <div
                            className={
                              "flex h-full flex-col items-center rounded-2xl border border-vtk-blue/10 bg-white p-4 text-center transition duration-200 hover:-translate-y-0.5 hover:border-vtk-blue/20 hover:shadow-[0_10px_30px_-16px_rgba(14,26,54,0.45)] " +
                              (isCoordinator ? "shadow-[inset_3px_0_0_var(--color-vtk-yellow)]" : "")
                            }
                          >
                            <div className="h-24 w-24 overflow-hidden rounded-xl bg-vtk-blue-soft ring-1 ring-vtk-blue/10">
                              {src ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={src} alt={m.user.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full w-full place-items-center text-3xl font-semibold text-vtk-blue-muted">
                                  {m.user.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="mt-3 text-sm font-semibold leading-tight text-vtk-ink">
                              {m.user.name}
                            </div>
                            {title && (
                              <div className="mt-1 text-xs font-medium text-vtk-blue">{title}</div>
                            )}
                            {isCoordinator && (
                              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-vtk-yellow px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                                <span className="h-1.5 w-1.5 rounded-full bg-vtk-ink/70" aria-hidden />
                                {t.coordinator}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
