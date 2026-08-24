import { apiFetch, appApi } from './client';
import type {
  AppCalendar,
  AppCalendarEventDetail,
  AppHome,
  AppLocale,
  AppMyOrder,
  AppProfile,
  AppTheokot,
  AppTheokotOrderInput,
  AppTicketEvent,
  AppTicketEventDetail,
} from './contract';

/**
 * De endpoints van de app-API. Eén regel per aanroep, zodat de schermen niets van
 * paden hoeven te weten en de versie op één plek staat (`appApi`).
 */

export function fetchHome(locale: AppLocale): Promise<AppHome> {
  return apiFetch<AppHome>(appApi('/home', { locale }));
}

export function fetchCalendar(
  locale: AppLocale,
  options: { categorie?: string; audience?: 'all' } = {},
): Promise<AppCalendar> {
  return apiFetch<AppCalendar>(
    appApi('/kalender', { locale, categorie: options.categorie, audience: options.audience }),
  );
}

export function fetchCalendarEvent(locale: AppLocale, id: string): Promise<AppCalendarEventDetail> {
  return apiFetch<AppCalendarEventDetail>(appApi(`/kalender/${encodeURIComponent(id)}`, { locale }));
}

export function fetchTheokot(locale: AppLocale): Promise<AppTheokot> {
  return apiFetch<AppTheokot>(appApi('/theokot', { locale }));
}

export function placeTheokotOrder(
  input: AppTheokotOrderInput,
): Promise<{ orderId: string; totalCents: number }> {
  return apiFetch(appApi('/theokot/order'), { method: 'POST', body: input });
}

export function cancelTheokotOrder(orderId: string): Promise<{ ok: true }> {
  return apiFetch(appApi('/theokot/order'), { method: 'DELETE', body: { orderId } });
}

// ── Tickets ─────────────────────────────────────────────────────────────────

export function fetchTicketEvents(locale: AppLocale): Promise<AppTicketEvent[]> {
  return apiFetch<AppTicketEvent[]>(appApi('/tickets', { locale }));
}

export function fetchTicketEvent(locale: AppLocale, slug: string): Promise<AppTicketEventDetail> {
  return apiFetch<AppTicketEventDetail>(
    appApi(`/tickets/${encodeURIComponent(slug)}`, { locale }),
  );
}

export function fetchMyTickets(locale: AppLocale): Promise<AppMyOrder[]> {
  return apiFetch<AppMyOrder[]>(appApi('/mijn/tickets', { locale }));
}

export function fetchProfile(locale: AppLocale): Promise<AppProfile> {
  return apiFetch<AppProfile>(appApi('/mijn/profiel', { locale }));
}

/**
 * Afrekenen gaat naar de bestaande route van de webshop en niet naar `/app/v1`.
 *
 * Twee redenen. Een wrapper zou hier niets doen dan doorgeven; en die route zet
 * het order-toegangscookie dat daarna nodig is om de status van de bestelling te
 * mogen lezen. `fetch` in React Native deelt die cookie-opslag met de browser die
 * de betaling opent, dus dat werkt vanzelf mee.
 */
export function startTicketCheckout(input: {
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  locale: AppLocale;
  termsAccepted: true;
  items: {
    ticketTypeId: string;
    attendeeName: string;
    attendeeEmail?: string;
    answers: Record<string, string | boolean | string[]>;
  }[];
}): Promise<{ orderId: string; orderNumber: string; checkoutUrl: string }> {
  return apiFetch('/api/tickets/checkout', { method: 'POST', body: input });
}

/** De stand van een bestelling, om na het betalen te weten of ze doorging. */
export function fetchOrderStatus(orderId: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/tickets/orders/${encodeURIComponent(orderId)}/status`);
}
