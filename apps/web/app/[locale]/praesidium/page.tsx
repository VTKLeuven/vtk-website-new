import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";

export default async function PraesidiumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const groups = await prisma.group.findMany({
    orderBy: { orderInPraesidium: "asc" },
    include: {
      memberships: {
        include: { user: true },
      },
    },
  });

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · KU Leuven</div>
          <h1 className="vtk-page-title">{dict.praesidium.title}</h1>
        </div>
      </header>
      <div className="vtk-page-shell space-y-14">
      {groups
        .filter((g) => g.memberships.length > 0)
        .map((group) => {
          const sorted = [...group.memberships].sort((a, b) => {
            if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
            return a.user.name.localeCompare(b.user.name);
          });
          return (
            <section key={group.id}>
              <h2 className="mb-5 text-2xl font-semibold tracking-tight text-vtk-ink">
                {pick(group.nameNl, group.nameEn, locale)}
              </h2>
              <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {sorted.map((m) => {
                  const src = publicUrl(m.user.avatarKey);
                  return (
                    <li key={m.id} className="text-center">
                      <div className="mx-auto h-28 w-28 overflow-hidden rounded-[20px] border border-vtk-blue/10 bg-[#f2f0e9]">
                        {src ? (
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
    </div>
  );
}
