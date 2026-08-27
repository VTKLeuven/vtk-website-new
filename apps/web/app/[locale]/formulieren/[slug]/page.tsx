import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { FormBody } from "@/components/forms/public/FormBody";
import { loadPublicForm } from "@/lib/forms/publicForm";
import { buildFormSurface } from "@/lib/forms/surface";

import "@/app/design/vtk-forms.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(locale)) return {};
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { titleNl: true, titleEn: true, status: true },
  });
  if (!form) return {};
  return {
    title: pick(form.titleNl, form.titleEn, locale),
    // Een formulier is geen inhoud om te vinden in Google; het is een actie met
    // een deadline, en een verlopen formulier in de resultaten helpt niemand.
    robots: { index: false, follow: true },
  };
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam, slug }, prefill] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const form = await loadPublicForm(slug);
  if (!form) notFound();

  const surface = await buildFormSurface(form, locale, prefill);
  if (form.status === "DRAFT" && !surface.canPreview) notFound();
  if (form.status === "ARCHIVED") notFound();

  const title = pick(form.titleNl, form.titleEn, locale);

  return (
    <>
      <header className="vtk-page-head">
        <div className="vtk-page-head-inner">
          <p className="vtk-page-kicker">
            <Link href={`${base}/formulieren`}>{nl ? "Formulieren" : "Forms"}</Link>
          </p>
          <h1 className="vtk-page-title">{title}</h1>
          {form.calendarEvent ? (
            <p className="vtk-page-subtitle">
              {pick(form.calendarEvent.titleNl, form.calendarEvent.titleEn, locale)}
            </p>
          ) : null}
        </div>
      </header>

      <main className="vtk-form-page">
        <FormBody
          surface={surface}
          successHref={`${base}/formulieren/${slug}/bedankt`}
          privacyUrl={`${base}/privacy`}
          loginHref={`${base}/inloggen?next=${encodeURIComponent(`${base}/formulieren/${slug}`)}`}
          otherLocaleHref={`${nl ? "/en" : ""}/formulieren/${slug}`}
        />
      </main>
    </>
  );
}
