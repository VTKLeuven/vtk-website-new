import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
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
