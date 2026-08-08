import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import Image from "next/image";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";

import "@/app/design/vtk-home.css";

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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
