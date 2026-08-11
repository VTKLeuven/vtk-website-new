import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { markdownToPlainText } from "@/lib/markdown";
import { daysUntilClose } from "@/lib/forms/publicForm";

import "@/app/design/vtk-forms.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "en" ? "Forms" : "Formulieren",
    robots: { index: false, follow: true },
  };
}

/**
 * Het overzicht van open formulieren. Enkel wat de beheerder als `listed`
 * markeerde: een sollicitatieformulier deel je gericht en hoort niet in een
 * publieke lijst, ook al is het bereikbaar met zijn link.
 */
export default async function FormsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const now = new Date();

  const forms = await prisma.form.findMany({
    where: {
      status: "PUBLISHED",
      listed: true,
      OR: [{ opensAt: null }, { opensAt: { lte: now } }],
      AND: [{ OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
      ...(locale === "en" ? { localeMode: { not: "NL_ONLY" } } : { localeMode: { not: "EN_ONLY" } }),
    },
    select: {
      slug: true,
      titleNl: true,
      titleEn: true,
      introNl: true,
      introEn: true,
      closesAt: true,
      audience: true,
    },
    orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <>
      <header className="vtk-page-head">
        <div className="vtk-page-head-inner">
          <h1 className="vtk-page-title">{nl ? "Formulieren" : "Forms"}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Inschrijvingen en bevragingen die nu openstaan."
              : "Sign-ups and surveys that are open right now."}
          </p>
        </div>
      </header>

      <main className="vtk-form-page">
        {forms.length === 0 ? (
          <p className="vtk-form-empty">
            {nl
              ? "Er staat op dit moment geen formulier open."
              : "No form is open at the moment."}
          </p>
        ) : (
          <ul className="vtk-form-index">
            {forms.map((form) => {
              const closingIn = daysUntilClose(form.closesAt, now);
              const intro = markdownToPlainText(
                (locale === "en" ? form.introEn ?? form.introNl : form.introNl) ?? ""
              );
              return (
                <li key={form.slug}>
                  <Link href={`${base}/formulieren/${form.slug}`}>
                    <h2>{pick(form.titleNl, form.titleEn, locale)}</h2>
                    {intro ? <p>{intro.slice(0, 180)}</p> : null}
                    <p className="vtk-form-index-meta">
                      {form.audience === "MEMBERS"
                        ? nl
                          ? "Enkel voor leden"
                          : "Members only"
                        : nl
                          ? "Voor iedereen"
                          : "Open to everyone"}
                      {closingIn !== null
                        ? nl
                          ? ` · sluit over ${closingIn} ${closingIn === 1 ? "dag" : "dagen"}`
                          : ` · closes in ${closingIn} ${closingIn === 1 ? "day" : "days"}`
                        : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
