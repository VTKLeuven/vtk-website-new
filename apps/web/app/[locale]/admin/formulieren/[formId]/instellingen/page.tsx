import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import {
  FormSettingsForm,
  type FormSettingsValues,
} from "@/components/forms/admin/FormSettingsForm";
import { formatDate, toDatetimeLocal, type AdminLocale } from "@/components/forms/admin/format";

export default async function FormSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { form } = await requireFormCapability(formId, "MANAGE_FORM");

  // Evenementen van de eigenaarspost waar nog geen formulier aan hangt, plus het
  // eventueel al gekoppelde evenement zelf (anders verdwijnt het uit de lijst).
  const now = new Date();
  const calendarRows = await prisma.calendarEvent.findMany({
    where: {
      groupId: form.ownerGroupId,
      OR: [
        {
          form: null,
          start: {
            gte: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
            lte: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
          },
        },
        ...(form.calendarEventId ? [{ id: form.calendarEventId }] : []),
      ],
    },
    select: { id: true, titleNl: true, titleEn: true, start: true },
    orderBy: { start: "asc" },
    take: 200,
  });

  const values: FormSettingsValues = {
    id: form.id,
    slug: form.slug,
    titleNl: form.titleNl,
    titleEn: form.titleEn,
    introNl: form.introNl,
    introEn: form.introEn,
    status: form.status,
    audience: form.audience,
    listed: form.listed,
    localeMode: form.localeMode,
    unavailableNl: form.unavailableNl,
    unavailableEn: form.unavailableEn,
    opensAt: toDatetimeLocal(form.opensAt),
    closesAt: toDatetimeLocal(form.closesAt),
    maxEntries: form.maxEntries,
    allowWaitlist: form.allowWaitlist,
    stepBySections: form.stepBySections,
    allowMultipleSubmissions: form.allowMultipleSubmissions,
    allowEditAfterSubmit: form.allowEditAfterSubmit,
    allowDrafts: form.allowDrafts,
    confirmationEnabled: form.confirmationEnabled,
    confirmationSubjectNl: form.confirmationSubjectNl,
    confirmationSubjectEn: form.confirmationSubjectEn,
    confirmationBodyNl: form.confirmationBodyNl,
    confirmationBodyEn: form.confirmationBodyEn,
    confirmationIncludeAnswers: form.confirmationIncludeAnswers,
    confirmationIncludeIcs: form.confirmationIncludeIcs,
    notifyMode: form.notifyMode,
    notifyEmails: form.notifyEmails,
    thankYouNl: form.thankYouNl,
    thankYouEn: form.thankYouEn,
    requireConsent: form.requireConsent,
    consentTextNl: form.consentTextNl,
    consentTextEn: form.consentTextEn,
    retentionDays: form.retentionDays,
    calendarEventId: form.calendarEventId,
    hasCalendarEvent: Boolean(form.calendarEventId),
  };

  const calendarEvents = calendarRows.map((event) => ({
    id: event.id,
    label: `${locale === "en" && event.titleEn ? event.titleEn : event.titleNl} · ${formatDate(event.start, locale)}`,
  }));

  return (
    <div className="ticket-admin-page">
      <section className="ticket-admin-section" aria-labelledby="form-settings-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <Settings2 aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="form-settings-heading">
                {locale === "nl" ? "Instellingen" : "Settings"}
              </h2>
              <p>
                {locale === "nl"
                  ? "De vragen zelf staan onder Velden."
                  : "The questions themselves live under Fields."}
              </p>
            </div>
          </div>
        </div>
        <FormSettingsForm locale={locale} values={values} calendarEvents={calendarEvents} />
      </section>
    </div>
  );
}
