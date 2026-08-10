import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";

import "@/app/design/vtk-forms.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * De bevestigingspagina. Een eigen route en geen toast op het formulier: wie
 * net iets verstuurde, wil een scherm dat zegt dat het gelukt is, en die pagina
 * moet ook nog kloppen wanneer je ze deelt of ververst.
 */
export default async function FormThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ dubbel?: string; wachtlijst?: string }>;
}) {
  const [{ locale: localeParam, slug }, query] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const form = await prisma.form.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      thankYouNl: true,
      thankYouEn: true,
      allowEditAfterSubmit: true,
      allowMultipleSubmissions: true,
      confirmationEnabled: true,
    },
  });
  if (!form) notFound();

  const session = await getCurrentSession();
  const canEdit =
    form.allowEditAfterSubmit &&
    session &&
    (await prisma.formEntry.count({
      where: { formId: form.id, submittedById: session.user.id, status: "SUBMITTED" },
    })) > 0;

  const thanks =
    (locale === "en" ? form.thankYouEn ?? form.thankYouNl : form.thankYouNl) ??
    (nl
      ? "Bedankt, we hebben je inzending goed ontvangen."
      : "Thank you, we have received your entry.");

  return (
    <>
      <header className="vtk-page-head">
        <div className="vtk-page-head-inner">
          <h1 className="vtk-page-title">{nl ? "Verstuurd" : "Sent"}</h1>
          <p className="vtk-page-subtitle">{pick(form.titleNl, form.titleEn, locale)}</p>
        </div>
      </header>

      <main className="vtk-form-page">
        <div className="vtk-form-notice" data-tone="done">
          {query.wachtlijst ? (
            <p>
              <strong>
                {nl
                  ? "Je staat op de wachtlijst."
                  : "You are on the waiting list."}
              </strong>{" "}
              {nl
                ? "Het formulier zat vol op het moment dat je indiende. We nemen contact op zodra er een plaats vrijkomt."
                : "The form was full when you submitted. We will get in touch as soon as a spot frees up."}
            </p>
          ) : null}
          <p>{thanks}</p>
          {form.confirmationEnabled ? (
            <p>
              {nl
                ? "Je krijgt zo een bevestiging per mail."
                : "You will receive a confirmation by e-mail shortly."}
            </p>
          ) : null}
        </div>

        {query.dubbel ? (
          <div className="vtk-form-notice" data-tone="warning">
            <p>
              {nl
                ? "Er stond al een inzending met dit e-mailadres. We hebben deze er gewoon bij bewaard; laat het weten als dat niet de bedoeling was."
                : "There was already an entry with this e-mail address. We kept this one as well; let us know if that was not intended."}
            </p>
          </div>
        ) : null}

        <div className="vtk-form-actions">
          {canEdit ? (
            <Link className="vtk-form-login" href={`${base}/formulieren/${form.slug}`}>
              {nl ? "Mijn inzending bekijken of aanpassen" : "View or change my entry"}
            </Link>
          ) : null}
          <Link href={`${base}/formulieren`}>
            {nl ? "Naar alle formulieren" : "To all forms"}
          </Link>
        </div>
      </main>
    </>
  );
}
