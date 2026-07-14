import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";

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
  const dict = getDictionary(locale);

  const year = parseWorkingYear(jaar);

  const [groups, distinctYears] = await Promise.all([
    prisma.group.findMany({
      orderBy: { orderInPraesidium: "asc" },
      include: {
        memberships: {
          where: { year },
          include: { user: true },
        },
      },
    }),
    prisma.groupMembership.findMany({ distinct: ["year"], select: { year: true } }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));
  const withMembers = groups.filter((g) => g.memberships.length > 0);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · KU Leuven</div>
          <h1 className="vtk-page-title">{dict.praesidium.title}</h1>
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
          <p className="text-[#5c667f]">
            {nl
              ? "Voor dit werkingsjaar zijn er nog geen posten ingevuld."
              : "No posts have been filled in for this working year yet."}
          </p>
        ) : (
          <div className="space-y-14">
            {withMembers.map((group) => {
              const sorted = [...group.memberships].sort((a, b) => {
                if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
                return a.user.name.localeCompare(b.user.name, locale);
              });
              return (
                <section key={group.id}>
                  <h2 className="mb-5 text-2xl font-semibold tracking-tight text-vtk-ink">
                    {pick(group.nameNl, group.nameEn, locale)}
                  </h2>
                  <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {sorted.map((m) => {
                      const src = publicUrl(m.user.avatarKey);
                      return (
                        <li key={m.id} className="text-center">
                          <div className="mx-auto h-28 w-28 overflow-hidden rounded-[20px] border border-vtk-blue/10 bg-[#f2f0e9]">
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={src} alt={m.user.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-3xl font-semibold text-[#5c667f]">
                                {m.user.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-sm font-medium">{m.user.name}</div>
                          <div className="text-xs text-[#5c667f]">
                            {m.role === "LEAD"
                              ? dict.praesidium.lead
                              : pick(m.titleNl ?? "", m.titleEn ?? "", locale) || dict.praesidium.member}
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
