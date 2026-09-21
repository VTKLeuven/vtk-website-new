import { headers } from "next/headers";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { AnnouncementCard } from "@/components/site/AnnouncementCard";
import { Markdown } from "@/components/ui/Markdown";
import { announcementFits } from "@/lib/announcements";
import { getCachedAnnouncement } from "@/lib/cachedContent";

/**
 * De aankondiging, voor elke pagina van de site.
 *
 * Ze hangt in de layout en niet meer in de homepage: wie via Google of een
 * gedeelde link op een gewone pagina binnenkomt, zag een afgelasting anders
 * nooit. Of ze hier ook echt verschijnt hangt af van het bereik dat in het
 * beheer gekozen is; `announcementFits` beslist dat op basis van het pad.
 *
 * Het pad komt uit de `x-pathname`-header die `proxy.ts` zet, dezelfde bron als
 * de statistieken in `app/layout.tsx` gebruiken.
 *
 * De aankondiging zelf komt uit de gedeelde cache (lib/cachedContent.ts). Ze
 * hangt in de layout en werd dus op élke pagina van de site opnieuw opgevraagd,
 * terwijl het antwoord voor iedereen gelijk is. Publiceren of intrekken duwt de
 * tag meteen om, zodat een afgelasting niet op de TTL moet wachten.
 */
export async function SiteAnnouncement({ locale }: { locale: Locale }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const announcement = await getCachedAnnouncement();
  if (!announcement || !announcementFits(announcement.scope, pathname)) return null;

  const dict = getDictionary(locale);
  const ctaLabel =
    announcement.ctaLabelNl || announcement.ctaLabelEn
      ? pick(announcement.ctaLabelNl ?? "", announcement.ctaLabelEn ?? "", locale)
      : null;

  return (
    <AnnouncementCard
      id={announcement.id}
      title={pick(announcement.titleNl, announcement.titleEn, locale)}
      kicker={dict.announcement.kicker}
      dateLabel={postedOn(announcement.startsAt ?? announcement.createdAt, locale)}
      closeLabel={dict.common.close}
      readMoreLabel={dict.announcement.readMore}
      readLessLabel={dict.announcement.readLess}
      ctaLabel={ctaLabel}
      ctaUrl={announcement.ctaUrl}
    >
      {/* De markdown wordt hier op de server gerenderd; de kaart zelf is client,
          want wegklikken onthouden gebeurt in localStorage. */}
      <Markdown>{pick(announcement.bodyNl, announcement.bodyEn, locale)}</Markdown>
    </AnnouncementCard>
  );
}

/**
 * Sinds wanneer het bericht er staat: het begin van het venster, of de
 * aanmaakdatum als het meteen zichtbaar was. "Maandag 21 september".
 *
 * `new Date(...)` en niet de waarde zelf: uit de cache komt een datum als
 * string terug (zie lib/cachedContent.ts). Een ingang uit de cache van vóór
 * deze velden er waren, heeft er geen; dan valt de regel weg in plaats van te
 * crashen op een ongeldige datum.
 */
function postedOn(value: Date | string | null | undefined, locale: Locale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const label = date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
