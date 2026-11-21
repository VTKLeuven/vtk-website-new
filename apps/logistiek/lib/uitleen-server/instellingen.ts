import 'server-only';
import { prisma } from '@vtk/db';
import {
  DEFAULT_LAST_MINUTE_DAYS,
  NOTIFY_KINDS,
  isTripHandoverMode,
  type LogistiekNotifyEmails,
  type NotifyKind,
  type TripHandoverNotify,
} from '@/lib/uitleen';

const LOGISTIEK_SETTINGS_KEY = 'logistiek.settings';

export type LogistiekSettings = {
  showRentPrices: boolean;
  lastMinuteDays: number;
  /**
   * Naar welke adressen er een melding gaat bij een nieuwe aanvraag, per soort.
   *
   * Per soort en niet één adres voor alles: materiaal, flesserke en transport
   * hebben elk een andere verantwoordelijke, en één gedeelde mailbox betekent dat
   * iedereen alles leest tot niemand nog iets leest.
   *
   * Een lege lijst betekent **geen mail**. Dat is een echte keuze (niet elke
   * soort hoeft een melding), maar wel eentje die het instellingenscherm hardop
   * zegt: stil niets versturen is precies de bug die deze instelling oplost.
   */
  notifyEmails: LogistiekNotifyEmails;
  /**
   * Mag iemand die bij geen enkele groep hoort een aanvraag indienen?
   *
   * Standaard **uit**. De app is in het semester 2026-2027 in gebruik genomen bij
   * de posten en de werkgroepen, terwijl de externe aanvragen nog per mail lopen;
   * zonder deze schakelaar zou een externe student intussen wel kunnen indienen
   * in een systeem waar niemand naar kijkt. Een instelling en geen env-variabele,
   * want het is het team dat beslist wanneer het opengaat, niet een deploy.
   */
  externalRequestsOpen: boolean;
  /**
   * Wie er een mail krijgt wanneer een rit aan een post doorgegeven wordt
   * (F4.8b). Standaard **niemand**: de rit staat onder "Ritten van mijn post",
   * en dat scherm is de melding geworden. Zie `TripHandoverNotify`.
   */
  tripHandover: TripHandoverNotify;
};

/**
 * Kringinstellingen, als één JSON-blob in `Setting`. Defaults: huurprijzen
 * verbergen, zeven dagen last minute, en externen nog niet open. Een ontbrekende
 * of onzinnige waarde valt terug op de default in plaats van de pagina te doen
 * falen; dit is een instelling, geen invoer.
 */
export async function getLogistiekSettings(): Promise<LogistiekSettings> {
  const row = await prisma.setting.findUnique({ where: { key: LOGISTIEK_SETTINGS_KEY } });
  const value = (row?.value ?? null) as {
    showRentPrices?: boolean;
    lastMinuteDays?: number;
    externalRequestsOpen?: boolean;
    notifyEmails?: Partial<Record<NotifyKind, unknown>>;
    tripHandover?: { mode?: unknown; email?: unknown };
  } | null;
  const days = Number(value?.lastMinuteDays);
  const handoverMode = value?.tripHandover?.mode;
  return {
    showRentPrices: Boolean(value?.showRentPrices),
    lastMinuteDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_LAST_MINUTE_DAYS,
    externalRequestsOpen: Boolean(value?.externalRequestsOpen),
    tripHandover: {
      // Een onbekende of ontbrekende waarde wordt "niemand", net zoals hierboven:
      // dit is een instelling en geen invoer. Stil naar de verantwoordelijken
      // terugvallen zou van een kapotte sleutel een mailstorm maken.
      mode: isTripHandoverMode(handoverMode) ? handoverMode : 'NIEMAND',
      email: typeof value?.tripHandover?.email === 'string' ? value.tripHandover.email : '',
    },
    notifyEmails: Object.fromEntries(
      NOTIFY_KINDS.map((kind) => {
        const stored = value?.notifyEmails?.[kind];
        // Een instelling, geen invoer: wat er onzin in staat, wordt een lege
        // lijst in plaats van de pagina te doen falen.
        return [kind, Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : []];
      })
    ) as LogistiekNotifyEmails,
  };
}
