import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";

export default async function InfoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";
  const nl = locale === "nl";

  const tab = await prisma.headerTab.findUnique({
    where: { code: "AANBOD" },
    include: {
      pages: {
        where: { visibleInHeader: true, publishedAt: { not: null } },
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
      },
    },
  });

  if (!tab || !tab.visible) notFound();

  const fallbackCards = [
    {
      href: `${base}/theokot`,
      titleNl: "Theokot",
      titleEn: "Theokot",
      excerptNl: "Broodjes, koffie en snelle campuslunch in de VTK-kelder.",
      excerptEn: "Sandwiches, coffee and quick campus lunch in the VTK basement.",
    },
    {
      href: `${base}/cursusdienst`,
      titleNl: "Cursusdienst",
      titleEn: "Course Shop",
      excerptNl: "Cursussen, syllabi en tweedehandsboeken aan studententarief.",
      excerptEn: "Courses, syllabi and second-hand books at student prices.",
    },
    {
      href: `${base}/shift`,
      titleNl: "Shiften",
      titleEn: "Shifts",
      excerptNl: "Help mee achter de schermen en schrijf je in voor shiften.",
      excerptEn: "Help behind the scenes and sign up for shifts.",
    },
  ];

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · {dict.pages.overview}</div>
          <h1 className="vtk-page-title">
            Info <em>{nl ? "voor studenten" : "for students"}</em>
          </h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Praktische diensten, campusvoorzieningen en tools die je semester vlotter maken."
              : "Practical services, campus facilities and tools that make your semester smoother."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <ul className="vtk-card-grid">
          {tab.pages.length > 0
            ? tab.pages.map((page) => (
                <li key={page.id}>
                  <Link href={`${base}/${tab.slug}/${page.slug}`}>
                    <Card className="vtk-card h-full">
                      <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
                        {pick(page.titleNl, page.titleEn, locale)}
                      </h2>
                      {(page.excerptNl || page.excerptEn) && (
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#34405e]">
                          {pick(page.excerptNl ?? "", page.excerptEn ?? "", locale)}
                        </p>
                      )}
                      <span className="mt-4 inline-block text-sm font-medium text-vtk-ink">
                        {dict.home.readMore} →
                      </span>
                    </Card>
                  </Link>
                </li>
              ))
            : fallbackCards.map((card) => (
                <li key={card.href}>
                  <Link href={card.href}>
                    <Card className="vtk-card h-full">
                      <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
                        {pick(card.titleNl, card.titleEn, locale)}
                      </h2>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#34405e]">
                        {pick(card.excerptNl, card.excerptEn, locale)}
                      </p>
                      <span className="mt-4 inline-block text-sm font-medium text-vtk-ink">
                        {dict.home.readMore} →
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
        </ul>
      </div>
    </div>
  );
}
