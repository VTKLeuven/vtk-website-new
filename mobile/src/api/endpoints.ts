import { apiFetch, appApi } from './client';
import type {
  AppCalendar,
  AppCalendarEventDetail,
  AppLocale,
  AppMyOrder,
  AppProfile,
  AppTheokot,
  AppTheokotOrderInput,
  AppTicketEvent,
  AppTicketEventDetail,
  AppAlbumDetail,
  AppCategory,
  AppMedia,
  AppPage,
  AppPraesidium,
  AppSearch,
  AppGroups,
  AppPoc,
  AppShifts,
  AppPiano,
  AppFakCheckin,
  AppNotificationSettings,
  AppNotificationTopic,
  AppPassHolder,
  AppScanEvent,
  AppScannerInviteResult,
  AppTicketScanResult,
  AppToday,
  AppVoucherRedeemInput,
  AppVoucherRedeemResult,
  AppVouchers,
} from './contract';

/**
 * De endpoints van de app-API. Eén regel per aanroep, zodat de schermen niets van
 * paden hoeven te weten en de versie op één plek staat (`appApi`).
 */

/**
 * De kalender. Zonder `van` vertrekt de lijst vanaf nu; de maandweergave geeft
 * het zichtbare rooster mee, want die toont ook het verleden.
 */
export function fetchCalendar(
  locale: AppLocale,
  options: {
    categorie?: string;
    audience?: 'all';
    van?: string;
    tot?: string;
    /** Enkel wat je zelf met een ster aanduidde. */
    interesse?: boolean;
  } = {},
): Promise<AppCalendar> {
  return apiFetch<AppCalendar>(
    appApi('/kalender', {
      locale,
      categorie: options.categorie,
      audience: options.audience,
      van: options.van,
      tot: options.tot,
      interesse: options.interesse ? '1' : undefined,
    }),
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

// ── Inhoud, zoeken, media en mensen ─────────────────────────────────────────

export function fetchCategory(locale: AppLocale, slug: string): Promise<AppCategory> {
  return apiFetch<AppCategory>(appApi(`/categorie/${encodeURIComponent(slug)}`, { locale }));
}

export function fetchPage(locale: AppLocale, slug: string): Promise<AppPage> {
  return apiFetch<AppPage>(appApi(`/paginas/${encodeURIComponent(slug)}`, { locale }));
}

export function search(locale: AppLocale, query: string): Promise<AppSearch> {
  return apiFetch<AppSearch>(appApi('/zoeken', { locale, q: query }));
}

export function fetchMedia(locale: AppLocale): Promise<AppMedia> {
  return apiFetch<AppMedia>(appApi('/media', { locale }));
}

export function fetchAlbum(locale: AppLocale, slug: string): Promise<AppAlbumDetail> {
  return apiFetch<AppAlbumDetail>(appApi(`/media/${encodeURIComponent(slug)}`, { locale }));
}

export function fetchPraesidium(locale: AppLocale, year?: number): Promise<AppPraesidium> {
  return apiFetch<AppPraesidium>(
    appApi('/praesidium', { locale, jaar: year === undefined ? undefined : String(year) }),
  );
}

// ── Shiften ─────────────────────────────────────────────────────────────────

export function fetchShifts(locale: AppLocale): Promise<AppShifts> {
  return apiFetch<AppShifts>(appApi('/shiften', { locale }));
}

/**
 * In- en uitschrijven gaan naar de bestaande route van de site.
 *
 * Die doet meer dan een rij wegschrijven: ze bewaakt overlappende shiften en de
 * 24-uursgrens, en ze duwt een cursusdienst-shift door naar cudi. Dat hier
 * overdoen zou betekenen dat een uitschrijving in de app op cudi kan blijven
 * staan.
 */
export function registerForShift(shiftId: string): Promise<unknown> {
  return apiFetch(`/api/shift/register?id=${encodeURIComponent(shiftId)}`, { method: 'POST' });
}

export function unregisterFromShift(shiftId: string): Promise<unknown> {
  return apiFetch(`/api/shift/register?id=${encodeURIComponent(shiftId)}`, { method: 'DELETE' });
}

// ── Groepen ─────────────────────────────────────────────────────────────────

export function fetchWerkgroepen(locale: AppLocale, year?: number): Promise<AppGroups> {
  return apiFetch<AppGroups>(
    appApi('/werkgroepen', { locale, jaar: year === undefined ? undefined : String(year) }),
  );
}

export function fetchPocs(locale: AppLocale): Promise<AppPoc[]> {
  return apiFetch<AppPoc[]>(appApi('/pocs', { locale }));
}

// ── Piano ───────────────────────────────────────────────────────────────────

export function fetchPiano(locale: AppLocale): Promise<AppPiano> {
  return apiFetch<AppPiano>(appApi('/piano', { locale }));
}

export function reservePianoSlot(startsAt: string): Promise<{ startsAt: string; endsAt: string }> {
  return apiFetch(appApi('/piano/reservatie'), { method: 'POST', body: { startsAt } });
}

export function cancelPianoSlot(id: string): Promise<{ ok: true }> {
  return apiFetch(appApi('/piano/reservatie'), { method: 'DELETE', body: { id } });
}

// ── Vandaag ─────────────────────────────────────────────────────────────────

/**
 * Het beginscherm. Bewust een eigen endpoint en niet `/home`: die laatste is de
 * voorpagina van de site in gegevensvorm en blijft bestaan voor toestellen die
 * nog op de vorige versie van de app zitten.
 */
export function fetchToday(locale: AppLocale): Promise<AppToday> {
  return apiFetch<AppToday>(appApi('/vandaag', { locale }));
}

// ── Interesse en gevolgde categorieën ───────────────────────────────────────

export function setEventInterest(id: string, interested: boolean): Promise<{ interested: boolean }> {
  return apiFetch(appApi(`/kalender/${encodeURIComponent(id)}/interesse`), {
    method: interested ? 'POST' : 'DELETE',
  });
}

export function fetchNotificationSettings(locale: AppLocale): Promise<AppNotificationSettings> {
  return apiFetch<AppNotificationSettings>(appApi('/mijn/meldingen', { locale }));
}

type NotificationPatch = { topics: AppNotificationSettings['topics']; followedCategories: string[] };

export function setNotificationTopic(
  topic: AppNotificationTopic,
  enabled: boolean,
): Promise<NotificationPatch> {
  return apiFetch(appApi('/mijn/meldingen'), { method: 'PATCH', body: { topic, enabled } });
}

export function setCategoryFollow(category: string, follow: boolean): Promise<NotificationPatch> {
  return apiFetch(appApi('/mijn/meldingen'), { method: 'PATCH', body: { category, follow } });
}

// ── Bonnetjes ───────────────────────────────────────────────────────────────

export function fetchVouchers(): Promise<AppVouchers> {
  return apiFetch<AppVouchers>(appApi('/mijn/bonnetjes'));
}

/** Wie hoort bij deze pas, en hoeveel staat er open. Nog niets afgeboekt. */
export function lookupPass(pass: string): Promise<AppPassHolder> {
  return apiFetch<AppPassHolder>(appApi('/bonnetjes/pas'), { method: 'POST', body: { pass } });
}

export function redeemVouchers(input: AppVoucherRedeemInput): Promise<AppVoucherRedeemResult> {
  return apiFetch(appApi('/bonnetjes/inwisselen'), { method: 'POST', body: input });
}

// ── Scannen ─────────────────────────────────────────────────────────────────

export function fetchScanEvents(locale: AppLocale): Promise<AppScanEvent[]> {
  return apiFetch<AppScanEvent[]>(appApi('/scan/events', { locale }));
}

export function redeemScannerInvite(code: string): Promise<AppScannerInviteResult> {
  return apiFetch(appApi('/scan/uitnodiging'), { method: 'POST', body: { code } });
}

/**
 * Een ticket scannen gaat naar de bestaande route van de webscanner en niet naar
 * `/app/v1`. Dezelfde reden als bij afrekenen en bij inschrijven op een shift:
 * die route draagt de hele beoordeling (geldig, al gescand, verkeerd evenement,
 * terugbetaald) plus het scanlogboek, en een wrapper zou daar niets doen dan
 * doorgeven of, erger, de helft vergeten.
 *
 * `clientScanId` maakt de aanroep idempotent: dezelfde id twee keer sturen geeft
 * hetzelfde antwoord in plaats van een tweede scan. Dat is precies wat je wil
 * wanneer het netwerk aan een deur wegvalt en de app opnieuw probeert.
 */
export function scanTicket(
  eventId: string,
  input: { credential: string; clientScanId: string; deviceId: string; clientScannedAt: string },
): Promise<AppTicketScanResult> {
  return apiFetch(`/api/tickets/events/${encodeURIComponent(eventId)}/scan`, {
    method: 'POST',
    body: input,
  });
}

// ── Fakbar ──────────────────────────────────────────────────────────────────

export function fakCheckin(code: string): Promise<AppFakCheckin> {
  return apiFetch<AppFakCheckin>(appApi('/fakbar/checkin'), { method: 'POST', body: { code } });
}
