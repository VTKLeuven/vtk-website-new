import type { Locale } from "@vtk/i18n";
import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { calendarLabels, feedBaseUrlFor, listCalendarCategories } from "@/lib/calendar/categories";
import { viewerPrefersOwnAudiences } from "@/lib/calendar/audience";
import { loadOpeningCalendarEvents } from "@/lib/calendar/publicEvents";
import { getCurrentSession } from "@/lib/session";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-event.css";
import "@/app/design/vtk-kalender.css";
import "@/app/design/vtk-eventcard.css";

/**
 * Een categoriepagina is dezelfde kalender als /kalender, vastgezet op één
 * doelgroep: zelfde raster, zelfde legende, maar met een eigen titel, eigen
 * introtekst en vooral een eigen abonneerlink.
 */
export async function CategoryCalendar({ locale, slug }: { locale: Locale; slug: string }) {
  const categories = await listCalendarCategories();
  // Dezelfde afleiding als de kalender zelf maakt uit het pad: een categorie die
  // niet op de kalenderpagina staat, filtert daar niets. Wijkt dit af, dan geeft
  // de server andere evenementen mee dan de browser verwacht.
  const filter = categories.some((category) => category.slug === slug) ? slug : "all";
  const [prefersOwnAudiences, session, initialEvents] = await Promise.all([
    viewerPrefersOwnAudiences(),
    getCurrentSession(),
    loadOpeningCalendarEvents(filter),
  ]);
  const labels = calendarLabels(locale);

  return (
    <div className="vtk-design">
      <KalenderEditorialView
        locale={locale}
        labels={labels}
        categories={categories}
        feedBaseUrl={feedBaseUrlFor(locale)}
        defaultOnlyMyAudiences={prefersOwnAudiences}
        signedIn={Boolean(session)}
        initialEvents={initialEvents}
      />
    </div>
  );
}
