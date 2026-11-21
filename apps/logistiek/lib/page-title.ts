import type { Metadata } from 'next';
import { getLocale } from './i18n';
import type { LogistiekLocale } from './i18n-shared';
import { canManage, getSession } from './session';

/**
 * De titel van een tabblad (V1 uit de audit van november 2026).
 *
 * Elk tabblad heette "VTK Uitleendienst"; met een paar tabbladen van het beheer
 * open wist niemand nog welk welk was. De root-layout zet nu de naam van de app
 * achter de titel van de pagina, de layout van het beheer "Beheer uitleendienst".
 * Een pagina geeft dus enkel wat ze zelf is: "Mijn ritten", of de naam van de
 * aanvraag die openstaat.
 */

/** Een vaste titel in de taal van het lid, voor `export const generateMetadata`. */
export function localizedTitle(titles: Record<LogistiekLocale, string>, extra: Omit<Metadata, 'title'> = {}) {
  return async function generateMetadata(): Promise<Metadata> {
    return { ...extra, title: titles[await getLocale()] };
  };
}

/**
 * Een titel met iets uit de database erin (de naam van een aanvraag, een
 * chauffeur), enkel voor wie het beheer mag openen.
 *
 * De metadata wordt opgebouwd los van de layout: wie het beheer niet mag zien,
 * krijgt daar "Geen toegang", maar zou anders in de titel van het tabblad toch de
 * naam lezen. Die krijgt de vaste titel.
 */
export async function manageTitle(
  fallback: string,
  load: () => Promise<string | null | undefined>
): Promise<Metadata> {
  const session = await getSession();
  if (!session || !canManage(session)) return { title: fallback };
  const title = (await load())?.trim();
  return { title: title || fallback };
}
