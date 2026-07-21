import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { SaveForm } from "@/components/ui/SaveForm";
import { syncMailingListsAction } from "@/app/actions/mailinglists";
import { brevoEnabled } from "@/lib/brevo/client";
import {
  ALL_STUDENTS,
  MAILING_LISTS,
  isZipList,
  listWhere,
  type MailingListId,
} from "@/lib/mailinglists";

/**
 * Mailinglijst-tab: per categorie een download met de leden die ze aangevinkt
 * hebben. De aantallen tellen enkel actieve leden, net als de export zelf.
 *
 * Bovenaan staat de Brevo-sync: is die geconfigureerd, dan gaan de lijsten
 * automatisch naar Brevo (real-time + dagelijkse reconciliatie) en dient de
 * download enkel nog als backup. Zonder `BREVO_KEY` blijft alles bij het oude.
 */
export default async function AdminMailingLists({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("mailinglists.export");

  const t = getDictionary(locale).mailinglists;
  const categories = getDictionary(locale).onboarding.categories;
  const nl = locale === "nl";
  const syncOn = brevoEnabled();

  const counts = await Promise.all(
    MAILING_LISTS.map((id) => prisma.user.count({ where: listWhere(id) }))
  );

  const label = (id: MailingListId) =>
    id === ALL_STUDENTS ? t.allStudents : categories[id];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-vtk-ink">{t.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">{t.intro}</p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-vtk-ink">{t.syncTitle}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  syncOn ? "bg-emerald-100 text-emerald-800" : "bg-vtk-blue/10 text-[#5c667f]"
                }`}
              >
                {syncOn ? t.syncOn : t.syncOff}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#5c667f]">{syncOn ? t.syncIntroOn : t.syncIntroOff}</p>
          </div>

          {syncOn ? (
            <SaveForm
              action={syncMailingListsAction}
              submitLabel={t.syncButton}
              savingLabel={t.syncing}
              savedMessage={t.syncedToast}
              errorMessages={{
                BREVO_DISABLED: t.syncDisabledToast,
                BREVO_PARTIAL: t.syncPartialToast,
              }}
              fallbackErrorMessage={t.syncErrorToast}
            />
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <ul className="divide-y divide-vtk-blue/10">
          {MAILING_LISTS.map((id, i) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-vtk-ink">{label(id)}</p>
                <p className="text-xs text-[#5c667f]">
                  {counts[i]} {counts[i] === 1 ? t.member : t.members}
                  {id === ALL_STUDENTS ? ` · ${t.allStudentsHint}` : ""}
                  {isZipList(id) ? ` · ${t.careerHint}` : ""}
                </p>
              </div>
              {/* Een echte download: geen client-side navigatie, dus <a> en geen <Link>. */}
              <a
                href={`/api/admin/mailinglijsten/${id}?locale=${locale}`}
                download
                className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-vtk-ink bg-vtk-ink px-3 text-sm font-medium text-vtk-surface shadow-sm transition-colors hover:bg-vtk-navy"
              >
                {isZipList(id) ? t.downloadZip : t.downloadCsv}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-[#5c667f]">
        {nl
          ? "Kolommen: firstname, lastname, email. Dat mailadres is het voorkeursadres van het lid."
          : "Columns: firstname, lastname, email. That address is the member's preferred address."}
      </p>
    </div>
  );
}
