import { rentalGridSlot } from "@/lib/theokotVerhuur";

/**
 * Van een verhuur in de database naar wat een bezoeker ervan te zien krijgt.
 *
 * Deze omzetting staat apart, en niet in de pagina, omdat het de plaats is waar
 * de privacy van deze feature beslist wordt: wat hier niet in het resultaat
 * belandt, staat ook niet in de HTML van de publieke pagina. `test/publicRentalSlots.test.ts`
 * controleert daarom niet alleen wat er in staat, maar ook dat er niets bij komt.
 */

/** De velden die de publieke pagina uit de database mag halen; meer niet. */
export type PublicRentalRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  purpose: string;
  purposePublic: boolean;
};

export type PublicRentalSlot = {
  id: string;
  /** "YYYY-MM-DD" in Brussel. */
  day: string;
  minutes: number;
  endMinutes: number;
  /** "20:00 – 02:00", op de server geformatteerd. */
  timeLabel: string;
  /** "vrijdag 3 oktober", voor de lijst op een smal scherm. */
  dayLabel: string;
  /** De aard van de activiteit, enkel wanneer ze vrijgegeven is. */
  title: string | null;
};

export type SlotFormatters = {
  time: (date: Date) => string;
  day: (date: Date) => string;
};

export function toPublicRentalSlots(
  rows: readonly PublicRentalRow[],
  fmt: SlotFormatters,
): PublicRentalSlot[] {
  return rows.map((row) => {
    const grid = rentalGridSlot(row.startsAt, row.endsAt);
    return {
      id: row.id,
      day: grid.day,
      minutes: grid.minutes,
      endMinutes: grid.endMinutes,
      timeLabel: `${fmt.time(row.startsAt)} – ${fmt.time(row.endsAt)}`,
      dayLabel: fmt.day(row.startsAt),
      // Het vinkje staat per aanvraag in het beheer: een post geeft haar
      // activiteit vrij, een verjaardag blijft "bezet".
      title: row.purposePublic ? row.purpose : null,
    };
  });
}
