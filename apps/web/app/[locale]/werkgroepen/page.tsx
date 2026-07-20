import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";

export default async function WerkgroepenPage({
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
  const t = dict.werkgroepen;

  const year = parseWorkingYear(jaar);

  const [werkgroepen, distinctYears] = await Promise.all([
    prisma.group.findMany({
      where: { type: "WERKGROEP", active: true },
      orderBy: { orderInPraesidium: "asc" },
      include: {
        memberships: {
          where: { year },
          include: { user: true },
        },
      },
    }),
    prisma.groupMembership.findMany({
      where: { group: { type: "WERKGROEP" } },
      distinct: ["year"],
      select: { year: true },
    }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

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
                href={`${base}/werkgroepen?jaar=${y}`}
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

        {werkgroepen.length === 0 ? (
          <p className="text-[#5c667f]">{t.empty}</p>
        ) : (
          <div className="space-y-14">
            {werkgroepen.map((group) => {
              const description = pick(group.descriptionNl ?? "", group.descriptionEn ?? "", locale);
              const sorted = [...group.memberships].sort((a, b) => {
                if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
                return a.user.name.localeCompare(b.user.name, locale);
              });
              return (
                <section key={group.id}>
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-vtk-ink">
                      {pick(group.nameNl, group.nameEn, locale)}
                    </h2>
                    {group.website && (
                      <a
                        href={group.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-vtk-ink underline decoration-vtk-blue/40 underline-offset-4 hover:decoration-vtk-ink"
                      >
                        {t.website}
                      </a>
                    )}
                  </div>
                  {description && (
                    <div className="prose-vtk mb-6 max-w-[70ch] text-sm">
                      <Markdown>{description}</Markdown>
                    </div>
                  )}
                  {sorted.length === 0 ? (
                    <p className="text-sm text-[#5c667f]">{t.noMembers}</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {sorted.map((m) => {
                        const src = publicUrl(m.user.avatarKey);
                        return (
                          <li key={m.id} className="text-center">
                            <div className="mx-auto h-28 w-28 overflow-hidden rounded-[20px] border border-vtk-blue/10 bg-vtk-blue-soft">
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
                                ? t.lead
                                : pick(m.titleNl ?? "", m.titleEn ?? "", locale) || t.member}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
