import { corsPreflight } from "@/lib/cors";
import { getPublishedTicketEventBySlug } from "@/lib/ticketing/queries";
import {
  appLocaleFrom,
  type AppTicketEventDetail,
  type AppTicketQuestionType,
} from "@/lib/app-api/contract";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén ticketevent, met de types en hun vragen.
 *
 * Wat de app hier krijgt is bewust hetzelfde als wat de webshop krijgt, uit
 * dezelfde functie. Het aantal dat nog vrij is (`available`) is een momentopname
 * en geen reservatie: pas bij het afrekenen wordt er echt geteld, binnen een
 * transactie. De app mag daar dus op rekenen om een knop uit te schakelen, maar
 * niet om te beloven dat er nog een ticket is.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const event = await getPublishedTicketEventBySlug(slug, locale);
    if (!event) return appNotFound(request, "Dit event bestaat niet of staat niet te koop.");

    const payload: AppTicketEventDetail = {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      ownerGroupName: event.ownerGroupName,
      maxTicketsPerOrder: event.maxTicketsPerOrder,
      currency: event.currency,
      contactEmail: event.contactEmail,
      termsUrl: event.termsUrl,
      requiresLogin: event.requiresLogin,
      ticketTypeCount: event.ticketTypes.length,
      fromPriceCents:
        event.ticketTypes.length > 0
          ? Math.min(...event.ticketTypes.map((type) => type.priceCents))
          : null,
      ticketTypes: event.ticketTypes.map((type) => ({
        id: type.id,
        name: type.name,
        description: type.description,
        priceCents: type.priceCents,
        available: type.available,
        minPerOrder: type.minPerOrder,
        maxPerOrder: type.maxPerOrder,
        questions: type.questions.map((question) => ({
          id: question.id,
          code: question.code,
          label: question.label,
          description: question.description,
          type: question.type as AppTicketQuestionType,
          required: question.required,
          options: question.options,
        })),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
