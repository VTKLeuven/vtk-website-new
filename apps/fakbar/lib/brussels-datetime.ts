/**
 * Een `datetime-local`-input heeft geen tijdzone: wat de beheerder intikt, is de
 * klok in Brussel, ook wanneer de server in UTC draait. Deze twee functies zetten
 * die wandklok om naar een tijdstip en terug.
 *
 * Dezelfde twee staan in de uitleendienst (`parseBrusselsDateTime` in
 * `apps/logistiek/lib/reservation-form.ts`, `toDatetimeLocalValue` in
 * `apps/logistiek/lib/uitleen.ts`); er is geen gedeeld pakket waar ze thuishoren,
 * dus staan ze hier opnieuw, met dezelfde uitkomst.
 */

const BRUSSELS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function brusselsParts(date: Date): Record<string, string> {
  const parts = Object.fromEntries(BRUSSELS.formatToParts(date).map((part) => [part.type, part.value]));
  if (parts.hour === '24') parts.hour = '00';
  return parts;
}

/** "YYYY-MM-DDTHH:mm" als Brusselse wandklok naar een tijdstip, of null. */
export function parseBrusselsDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const asUtc = new Date(`${value}:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const parts = brusselsParts(asUtc);
  const brusselsAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00.000Z`);
  return new Date(asUtc.getTime() - (brusselsAsUtc.getTime() - asUtc.getTime()));
}

/** Een tijdstip naar de "YYYY-MM-DDTHH:mm" van een `datetime-local`-input (Brussel). */
export function toDatetimeLocalValue(date: Date): string {
  const parts = brusselsParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
