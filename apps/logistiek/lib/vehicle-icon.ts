import type { IconName } from '@/components/logistics-icon';

/**
 * Het icoon van een voertuig in de transportplanning (F4.21).
 *
 * Er stond hier al een afleiding uit de code van het voertuig, en die blijft:
 * ze klopt voor de drie voertuigen die er staan en ze kost niemand een
 * instelling. Wat erbij komt is dat het team haar kan overrulen, want ze
 * raadt. Het team voert zelf voertuigen in, en een gehuurd busje dat "Dockx"
 * heet (F4.22) bevat geen van de woorden waar deze functie op let.
 *
 * `null` in de databank betekent dus "automatisch", en niet "geen icoon". Een
 * voertuig zonder icoon bestaat niet: in een blok van een kwartier is het icoon
 * vaak het enige dat je nog leest.
 *
 * Een eigen module en niet in `components/transport-calendar/trip-block.tsx`,
 * waar de afleiding vandaan komt: dat is een `'use client'`-module met React
 * erin, en het beheerscherm én de test hebben hier enkel de twee strings nodig.
 */

/**
 * Waar een voertuig uit te kiezen valt, in de volgorde van de keuzelijst.
 *
 * Enkel iconen die een voertuig voorstellen. De `LogisticsIcon`-set telt er
 * dertig, maar een keuzelijst waarin een krat of een fles naast een bestelwagen
 * staat, vraagt niet welk voertuig dit is maar of je oplet.
 */
export const VEHICLE_ICONS = ['van', 'car', 'cargobike'] as const satisfies readonly IconName[];

export type VehicleIcon = (typeof VEHICLE_ICONS)[number];

export const VEHICLE_ICON_LABELS: Record<VehicleIcon, string> = {
  van: 'Bestelwagen',
  car: 'Auto',
  cargobike: 'Bakfiets',
};

export function isVehicleIcon(value: unknown): value is VehicleIcon {
  return typeof value === 'string' && (VEHICLE_ICONS as readonly string[]).includes(value);
}

/**
 * De afleiding uit de code, voor een voertuig dat niets ingesteld heeft.
 *
 * Op bevatten en niet op gelijkheid, want het team voert zelf voertuigen in: een
 * tweede bestelwagen heet geen `kar`. De bestelwagen is de laatste stap en
 * daarmee ook het antwoord op alles wat we niet herkennen; dat is wat de
 * uitleendienst het vaakst uitleent.
 */
function iconFromCode(code: string): VehicleIcon {
  const normalized = code.toLowerCase();
  if (normalized.includes('fiets')) return 'cargobike';
  if (normalized.includes('auto') || normalized.includes('wagen')) return 'car';
  return 'van';
}

/** Het icoon van dit voertuig: het ingestelde, of anders de afleiding. */
export function vehicleIconName(vehicle: { code: string; icon?: string | null }): VehicleIcon {
  return isVehicleIcon(vehicle.icon) ? vehicle.icon : iconFromCode(vehicle.code);
}
