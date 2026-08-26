import type { Locale } from "@vtk/i18n";
import { KalenderEditorialView } from "@/components/editorial/KalenderEditorialView";
import { calendarLabels, feedBaseUrlFor, listCalendarCategories } from "@/lib/calendar/categories";
import { viewerPrefersOwnAudiences } from "@/lib/calendar/audience";
import { getCurrentSession } from "@/lib/session";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-event.css";
import "@/app/design/vtk-kalender.css";

/**
 * Een categoriepagina is dezelfde kalender als /kalender, vastgezet op één
 * doelgroep: zelfde raster, zelfde legende, maar met een eigen titel, eigen
 * introtekst en vooral een eigen abonneerlink.
 */
export async function CategoryCalendar({ locale }: { locale: Locale }) {
  const [categories, prefersOwnAudiences, session] = await Promise.all([
    listCalendarCategories(),
    viewerPrefersOwnAudiences(),
    getCurrentSession(),
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
      />
    </div>
  );
}
