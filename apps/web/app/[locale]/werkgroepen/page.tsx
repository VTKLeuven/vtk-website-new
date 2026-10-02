import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import Image from "next/image";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import "@/app/design/vtk-werkgroepen.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("werkgroepen", "/werkgroepen", locale);
}

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
  type Membership = (typeof werkgroepen)[number]["memberships"][number];

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">{t.kicker}</div>
          <h1 className="vtk-page-title">{t.title}</h1>
        </div>
      </header>
      <div className="vtk-page-shell">
        <div className="vtk-roster-years">
          <span className="vtk-roster-years-label">{t.year}</span>
          {tabs.map((y) => (
            <Link
              key={y}
              href={`${base}/werkgroepen?jaar=${y}`}
              className="vtk-roster-year"
              aria-current={y === year ? "page" : undefined}
            >
              {formatWorkingYear(y)}
            </Link>
          ))}
        </div>

        {werkgroepen.length === 0 ? (
          <p className="vtk-muted mt-8">{t.empty}</p>
        ) : (
          <>
            {/* Gewone ankers en geen <Link>: dit springt binnen dezelfde pagina. */}
            <nav className="vtk-wall-jump vtk-werkgroep-jump" aria-label={t.title}>
              <span className="vtk-wall-jump-label">{t.title}</span>
              {werkgroepen.map((group) => (
                <a key={group.id} href={`#werkgroep-${group.slug}`}>
                  {pick(group.nameNl, group.nameEn, locale)}
                </a>
              ))}
            </nav>

            <div className="mt-6">
              {werkgroepen.map((group) => {
                const name = pick(group.nameNl, group.nameEn, locale);
                const description = pick(group.descriptionNl ?? "", group.descriptionEn ?? "", locale);
                const byName = (a: Membership, b: Membership) =>
                  a.user.name.localeCompare(b.user.name, locale);
                // De kern en de leden staan elk in hun eigen blok: de leden
                // beginnen altijd op een nieuwe regel onder de kern.
                const leads = group.memberships.filter((m) => m.role === "LEAD").sort(byName);
                const members = group.memberships.filter((m) => m.role !== "LEAD").sort(byName);
                const headingId = `werkgroep-${group.slug}-naam`;
                return (
                  <section
                    key={group.id}
                    id={`werkgroep-${group.slug}`}
                    className="vtk-werkgroep"
                    aria-labelledby={headingId}
                  >
                    <div className="vtk-werkgroep-text">
                      <div className="vtk-werkgroep-head">
                        <h2 id={headingId}>{name}</h2>
                        {group.website && (
                          <a
                            href={group.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="vtk-werkgroep-site"
                          >
                            {t.website}
                          </a>
                        )}
                      </div>
                      {description && (
                        <div className="prose-vtk">
                          <Markdown locale={locale}>{description}</Markdown>
                        </div>
                      )}
                    </div>

                    <aside className="vtk-werkgroep-team" aria-label={t.team.replace("{name}", name)}>
                      {leads.length === 0 && members.length === 0 && (
                        <p className="vtk-muted text-sm">{t.noMembers}</p>
                      )}
                      {leads.length > 0 && (
                        <div>
                          {/* De verantwoordelijke heet zoals de werkgroep het
                              koos (meestal G3 of G4); dat staat in de admin. */}
                          <h3 className="vtk-werkgroep-label">
                            {group.leadLabel} <span>{leads.length}</span>
                          </h3>
                          <ul className="vtk-werkgroep-leads">
                            {leads.map((m) => {
                              const src = publicUrl(m.user.avatarKey);
                              const title = pick(m.titleNl ?? "", m.titleEn ?? "", locale);
                              return (
                                <li key={m.id}>
                                  <span className="vtk-werkgroep-face">
                                    {src ? (
                                      // 58px op het scherm; next/image snijdt de
                                      // profielfoto op maat, dubbel voor retina.
                                      <Image src={src} alt="" width={116} height={116} />
                                    ) : (
                                      <span aria-hidden>{m.user.name.slice(0, 1).toUpperCase()}</span>
                                    )}
                                  </span>
                                  <span className="vtk-werkgroep-who">
                                    <span className="vtk-werkgroep-name">{m.user.name}</span>
                                    <span className="vtk-werkgroep-role">{group.leadLabel}</span>
                                    {title && <span className="vtk-werkgroep-role">{title}</span>}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {members.length > 0 && (
                        <div>
                          <h3 className="vtk-werkgroep-label">
                            {t.members} <span>{members.length}</span>
                          </h3>
                          <ul className="vtk-werkgroep-members">
                            {members.map((m) => {
                              const src = publicUrl(m.user.avatarKey);
                              const title = pick(m.titleNl ?? "", m.titleEn ?? "", locale);
                              return (
                                <li key={m.id}>
                                  <span className={"vtk-werkgroep-mini" + (src ? "" : " is-blank")}>
                                    {src ? (
                                      <Image src={src} alt="" width={48} height={48} />
                                    ) : (
                                      <span aria-hidden>{m.user.name.slice(0, 1).toUpperCase()}</span>
                                    )}
                                  </span>
                                  <span className="vtk-werkgroep-who">
                                    <span className="vtk-werkgroep-name">{m.user.name}</span>
                                    {title && <span className="vtk-werkgroep-role">{title}</span>}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </aside>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
