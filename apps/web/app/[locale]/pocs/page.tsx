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
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <h1 className="text-4xl font-bold">{dict.pocs.title}</h1>
      {pocs.length === 0 ? (
        <p className="text-zinc-500">{dict.pocs.empty}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pocs.map((poc) => (
            <Card key={poc.id} className="p-6">
              <h2 className="text-xl font-semibold">{pick(poc.nameNl, poc.nameEn, locale)}</h2>
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-4">{poc.studyTrack}</p>
              {(poc.descriptionNl || poc.descriptionEn) && (
                <p className="mb-4 text-sm text-zinc-600">
                  {pick(poc.descriptionNl ?? "", poc.descriptionEn ?? "", locale)}
                </p>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {poc.representatives.map((r) => {
                  const src = publicUrl(r.user.avatarKey);
                  return (
                    <li key={r.id} className="text-center">
                      <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-zinc-200">
                        {src ? (
                          <img src={src} alt={r.user.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-lg font-semibold text-zinc-400">
                            {r.user.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium">{r.user.name}</div>
                      {(r.roleNl || r.roleEn) && (
                        <div className="text-xs text-zinc-500">
                          {pick(r.roleNl ?? "", r.roleEn ?? "", locale)}
                        </div>
                      )}
                      <a href={`mailto:${r.user.email}`} className="text-xs text-vtk-blue hover:underline">
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
  );
}
