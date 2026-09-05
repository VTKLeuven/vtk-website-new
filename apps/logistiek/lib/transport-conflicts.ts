/**
 * Welke goedgekeurde ritten hetzelfde voertuig op hetzelfde moment claimen.
 *
 * Puur en zonder databank, zoals `week-lanes.ts` en `availability-day.ts`: het
 * is een handvol randgevallen (aansluitende uren, een rit die de andere volledig
 * omsluit) waar niets zichtbaar misgaat als het fout staat, en dan wil je er
 * tests op.
 *
 * Botsen is sinds V3 een normale, tijdelijke toestand: het team tekent eerst in
 * wat mensen vragen en schuift het daarna passend, en de beheeracties laten een
 * botsing toe wanneer iemand er expliciet voor tekent. Daarom staat hier **wie
 * met wie** botst en niet enkel dát er iets botst: het paneel zet de andere rit
 * op één klik, en de teller boven de kalender belet dat een botsing die je
 * bewust maakte blijft staan omdat je haar niet meer terugvindt.
 */

export type ConflictCandidate = {
  id: string;
  vehicleId: string;
  status: string;
  startAt: Date;
  endAt: Date;
};

export function conflictPartners(bookings: readonly ConflictCandidate[]): Map<string, string[]> {
  const partners = new Map<string, string[]>();
  const add = (id: string, other: string) => {
    const current = partners.get(id);
    if (current) current.push(other);
    else partners.set(id, [other]);
  };

  // Enkel goedgekeurde ritten: een aanvraag die nog beslist moet worden, houdt
  // het voertuig niet bezet (zie "Conflicten: aanvragen mag, goedkeuren niet").
  const approved = bookings.filter((booking) => booking.status === 'APPROVED');
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.vehicleId !== b.vehicleId) continue;
      // Open einden: een rit die om 12:00 eindigt, laat de kar om 12:00 vrij.
      // Dezelfde regel als `momentsOverlap` in lib/uitleen.ts, waar de
      // validatie mee rekent.
      if (a.startAt < b.endAt && b.startAt < a.endAt) {
        add(a.id, b.id);
        add(b.id, a.id);
      }
    }
  }
  return partners;
}
