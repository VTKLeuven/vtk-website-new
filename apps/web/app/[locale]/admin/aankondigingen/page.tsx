import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { announcementStatus } from "@/lib/announcements";
import { AnnouncementsManager, type AnnouncementRow } from "./AnnouncementsManager";

/** "YYYY-MM-DDTHH:mm" voor een datetime-local-veld, in serverzone (Brussel). */
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function AdminAnnouncements({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("home.edit");

  const rows = await prisma.announcement.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const now = new Date();
  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const moment = (date: Date | null) => (date ? dateFormat.format(date) : null);

  const announcements: AnnouncementRow[] = rows.map((row) => {
    const from = moment(row.startsAt);
    const until = moment(row.endsAt);
    const windowLabel = nl
      ? from && until
        ? `${from} tot ${until}`
        : from
          ? `Vanaf ${from}`
          : until
            ? `Tot ${until}`
            : "Zonder einddatum"
      : from && until
        ? `${from} until ${until}`
        : from
          ? `From ${from}`
          : until
            ? `Until ${until}`
            : "No end date";

    return {
      id: row.id,
      titleNl: row.titleNl,
      titleEn: row.titleEn,
      bodyNl: row.bodyNl,
      bodyEn: row.bodyEn,
      ctaLabelNl: row.ctaLabelNl ?? "",
      ctaLabelEn: row.ctaLabelEn ?? "",
      ctaUrl: row.ctaUrl ?? "",
      startsAt: toLocalInput(row.startsAt),
      endsAt: toLocalInput(row.endsAt),
      active: row.active,
      status: announcementStatus(row, now),
      createdLabel: dateFormat.format(row.createdAt),
      windowLabel,
      authorName: row.createdBy?.name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Aankondigingen" : "Announcements"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Een bericht dat als venster op de homepage verschijnt. Bezoekers krijgen het één keer te zien; wie het wegklikt, ziet het niet opnieuw."
            : "A message that appears as a dialog on the homepage. Visitors see it once; anyone who dismisses it will not see it again."}
        </p>
      </header>

      <AnnouncementsManager locale={locale} announcements={announcements} />
    </div>
  );
}
