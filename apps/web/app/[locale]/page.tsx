import { HomeEditorial } from "@/components/editorial/HomeEditorial";
import { AnnouncementModal } from "@/components/site/AnnouncementModal";
import { Markdown } from "@/components/ui/Markdown";
import { getCurrentAnnouncement } from "@/lib/announcements";
import { hasLocale } from "@/lib/locale";
import { pick, type Locale } from "@vtk/i18n";
import { notFound } from "next/navigation";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  // Beheerd via /admin/aankondigingen. De markdown wordt hier gerenderd en als
  // children doorgegeven; de modal zelf is client (wegklikken onthouden).
  const announcement = await getCurrentAnnouncement();

  return (
    <>
      {announcement && (
        <AnnouncementModal
          id={announcement.id}
          title={pick(announcement.titleNl, announcement.titleEn, locale)}
          closeLabel={nl ? "Sluiten" : "Close"}
          ctaLabel={
            announcement.ctaLabelNl || announcement.ctaLabelEn
              ? pick(
                  announcement.ctaLabelNl ?? "",
                  announcement.ctaLabelEn ?? "",
                  locale,
                )
              : null
          }
          ctaUrl={announcement.ctaUrl}
        >
          <Markdown>{pick(announcement.bodyNl, announcement.bodyEn, locale)}</Markdown>
        </AnnouncementModal>
      )}
      <HomeEditorial locale={locale} />
    </>
  );
}
