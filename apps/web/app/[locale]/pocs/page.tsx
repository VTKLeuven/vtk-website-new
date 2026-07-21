import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";

import "@/app/design/vtk-home.css";

/**
 * Alle POC's. Bewust dezelfde kaarten als de POC-band op de homepage
 * (`.poc-grid` / `.poccard` in vtk-home.css): een lid dat daar zijn eigen POC
 * ziet en hier doorklikt, hoort hetzelfde beeld te krijgen.
 */
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
          <div className="vtk-design">
            <div className="poc-grid" data-groups={Math.min(pocs.length, 3)}>
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
                  <ul className="poc-people">
                    {poc.representatives.map((rep) => {
                      const avatar = publicUrl(rep.user.avatarKey);
                      return (
                        <li key={rep.id}>
                          <span className="poc-face">
                            {avatar ? (
                              // Avatars staan achter /api/media; die route streamt uit
                              // object storage en next/image hoeft er niet tussen.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={avatar} alt="" loading="lazy" />
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
