import { headers } from "next/headers";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { AnnouncementModal } from "@/components/site/AnnouncementModal";
import { Markdown } from "@/components/ui/Markdown";
import { announcementFits, getCurrentAnnouncement } from "@/lib/announcements";

/**
 * Het aankondigingsvenster, voor elke pagina van de site.
 *
 * Het hangt in de layout en niet meer in de homepage: wie via Google of een
 * gedeelde link op een gewone pagina binnenkomt, zag een afgelasting anders
 * nooit. Of ze hier ook echt verschijnt hangt af van het bereik dat in het
 * beheer gekozen is; `announcementFits` beslist dat op basis van het pad.
 *
 * Het pad komt uit de `x-pathname`-header die `proxy.ts` zet, dezelfde bron als
 * de statistieken in `app/layout.tsx` gebruiken. Deze layout is toch al
 * dynamisch (de header leest de sessie), dus dit kost één query, geen
 * caching-omslag.
 */
export async function SiteAnnouncement({ locale }: { locale: Locale }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const announcement = await getCurrentAnnouncement();
  if (!announcement || !announcementFits(announcement.scope, pathname)) return null;

  const dict = getDictionary(locale);
  const ctaLabel =
    announcement.ctaLabelNl || announcement.ctaLabelEn
      ? pick(announcement.ctaLabelNl ?? "", announcement.ctaLabelEn ?? "", locale)
      : null;

  return (
    <AnnouncementModal
      id={announcement.id}
      title={pick(announcement.titleNl, announcement.titleEn, locale)}
      closeLabel={dict.common.close}
      ctaLabel={ctaLabel}
      ctaUrl={announcement.ctaUrl}
    >
      {/* De markdown wordt hier op de server gerenderd; de modal zelf is client,
          want wegklikken onthouden gebeurt in localStorage. */}
      <Markdown>{pick(announcement.bodyNl, announcement.bodyEn, locale)}</Markdown>
    </AnnouncementModal>
  );
}
