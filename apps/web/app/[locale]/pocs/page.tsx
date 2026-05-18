import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { Card } from "@vtk/ui";

export default async function PocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);

  const pocs = await prisma.poc.findMany({
    orderBy: { order: "asc" },
    include: {
      representatives: {
        orderBy: { order: "asc" },
        include: { user: true },
      },
    },
  });

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Onderwijs</div>
          <h1 className="vtk-page-title">{dict.pocs.title}</h1>
        </div>
      </header>
      <div className="vtk-page-shell">
      {pocs.length === 0 ? (
        <p className="text-[#5c667f]">{dict.pocs.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {pocs.map((poc) => (
            <Card key={poc.id} className="p-6">
              <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">{pick(poc.nameNl, poc.nameEn, locale)}</h2>
              <p className="mb-4 text-xs uppercase tracking-[0.08em] text-[#5c667f]">{poc.studyTrack}</p>
              {(poc.descriptionNl || poc.descriptionEn) && (
                <p className="mb-4 text-sm leading-6 text-[#34405e]">
                  {pick(poc.descriptionNl ?? "", poc.descriptionEn ?? "", locale)}
                </p>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {poc.representatives.map((r) => {
                  const src = publicUrl(r.user.avatarKey);
                  return (
                    <li key={r.id} className="text-center">
                      <div className="mx-auto h-20 w-20 overflow-hidden rounded-[16px] border border-vtk-blue/10 bg-[#f2f0e9]">
                        {src ? (
                          <img src={src} alt={r.user.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-lg font-semibold text-[#5c667f]">
                            {r.user.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium">{r.user.name}</div>
                      {(r.roleNl || r.roleEn) && (
                        <div className="text-xs text-[#5c667f]">
                          {pick(r.roleNl ?? "", r.roleEn ?? "", locale)}
                        </div>
                      )}
                      <a href={`mailto:${r.user.email}`} className="text-xs text-vtk-ink hover:underline">
                        {r.user.email}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
