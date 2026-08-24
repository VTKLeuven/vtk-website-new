import { apiFetch, appApi } from './client';
import type {
  AppCalendar,
  AppCalendarEventDetail,
  AppHome,
  AppLocale,
  AppTheokot,
  AppTheokotOrderInput,
} from './contract';

/**
 * De endpoints van fase 1. Eén regel per aanroep, zodat de schermen niets van
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
