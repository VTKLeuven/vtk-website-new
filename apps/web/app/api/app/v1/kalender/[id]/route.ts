import { pick } from "@vtk/i18n";

import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { loadCalendarEvent } from "@/lib/pageQueries";
import { getDefaultEventImage } from "@/lib/defaultEventImage";
import { getCurrentSession } from "@/lib/session";
import { appLocaleFrom, type AppCalendarEventDetail } from "@/lib/app-api/contract";
import { absoluteMediaUrl, absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén evenement, met alles wat de detailpagina op de site toont.
 *
 * Twee velden verdienen uitleg. `ticketSlug` staat er enkel wanneer de verkoop
 * effectief open is, en `formSlug` enkel wanneer het inschrijvingsformulier nu
 * openstaat: een knop die naar een gesloten verkoop leidt, is erger dan geen
 * knop. Die beoordeling gebeurt hier en niet in de app, zodat de app niet hoeft
 * te weten wat de statussen van een ticketevent betekenen.
 *
 * `interestedCount` is een teller en geen deelnemerslijst: er staan geen namen
 * bij en er hangt geen plaats aan. Het is er om te zien of er volk komt, en dat
 * is precies zoveel als een ster mag beloven.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const event = await loadCalendarEvent(id);
    if (!event || event.visibility !== "PUBLIC") return appNotFound(request, "Evenement niet gevonden.");

    // Een evenement zonder eigen foto krijgt de standaardfoto uit /admin/home,
    // net als op de site; anders opent de helft van de lijst op een grijs vlak.
    // `getDefaultEventImage` geeft al een pad terug (soms een bestand uit
    // `public/`), dus die gaat langs `absoluteUrl` en niet langs de media-helper.
    const imageUrl =
      absoluteMediaUrl(request, event.imageKey) ?? absoluteUrl(request, await getDefaultEventImage());

    const session = await getCurrentSession();
    const [interest, interestedCount] = await Promise.all([
      session
        ? prisma.calendarEventInterest.count({
            where: { userId: session.user.id, eventId: event.id },
          })
        : Promise.resolve(0),
      prisma.calendarEventInterest.count({ where: { eventId: event.id } }),
    ]);

    const now = new Date();
    const formOpen =
      event.form?.status === "PUBLISHED" &&
      (!event.form.opensAt || event.form.opensAt <= now) &&
      (!event.form.closesAt || event.form.closesAt > now);

    const payload: AppCalendarEventDetail = {
      id: event.id,
      title: pick(event.titleNl, event.titleEn, locale) ?? event.titleNl,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      location: event.location,
      imageUrl,
      groupName: pick(event.group.nameNl, event.group.nameEn, locale) ?? event.group.nameNl,
      groupSlug: event.group.slug,
      categories: event.categories.map(({ category }) => ({
        slug: category.slug,
        name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
        colour: category.colour,
        audience: category.audience,
      })),
      description: pick(event.descriptionNl, event.descriptionEn, locale) || null,
      url: event.url,
      ticketSlug: event.ticketEvent?.status === "PUBLISHED" ? event.ticketEvent.slug : null,
      formSlug: formOpen ? (event.form?.slug ?? null) : null,
      interested: interest > 0,
      interestedCount,
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
