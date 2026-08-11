'use client';

import { isLastMinute } from '@/lib/uitleen';

/**
 * Waarschuwing bij een afhaaldag die te dicht bij vandaag ligt. Het team zag de
 * badge "last minute" pas in de aanvragenlijst, dus na het indienen; de
 * aanvrager wist tot dan niet dat zijn aanvraag laat was. Dezelfde termijn en
 * dezelfde berekening als die badge (`isLastMinute`), zodat het lid geen
 * geruststelling krijgt die de beheerkant meteen tegenspreekt.
 *
 * `pickupDate` is de waarde van een date-input ("YYYY-MM-DD").
 */
export function LastMinuteNotice({
  pickupDate,
  days,
  locale,
}: {
  pickupDate: string;
  days: number;
  locale: 'nl' | 'en';
}) {
  if (!pickupDate || days <= 0) return null;
  const pickup = new Date(`${pickupDate}T00:00:00.000Z`);
  if (Number.isNaN(pickup.getTime())) return null;
  if (!isLastMinute(pickup, new Date(), days)) return null;

  const en = locale === 'en';
  return (
    <p className="rounded-lg border border-vtk-yellow bg-vtk-yellow/20 px-3 py-2 text-xs leading-5 text-vtk-ink">
      {en
        ? `This is a last-minute request: you are collecting within ${days} days. Logistics handles it as a priority case and may refuse it if the equipment is already promised.`
        : `Dit is een last-minute aanvraag: je haalt binnen de ${days} dagen af. Logistiek behandelt ze als voorrangsgeval en mag ze weigeren wanneer het materiaal al beloofd is.`}
    </p>
  );
}
