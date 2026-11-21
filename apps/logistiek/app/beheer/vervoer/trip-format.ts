/**
 * Hoe de ritlijst en het paneel een moment schrijven, op de Brusselse klok.
 * Eén plek, zodat de rij en het paneel van dezelfde rit hetzelfde zeggen.
 */
const dateFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dateLabel(moment: Date): string {
  return dateFormatter.format(moment);
}

/** Uren van de rit; bij een rit over meerdere dagen ook de einddag. */
export function hoursLabel(trip: { startAt: Date; endAt: Date }): string {
  const sameDay = dayKeyFormatter.format(trip.startAt) === dayKeyFormatter.format(trip.endAt);
  const hours = `${timeFormatter.format(trip.startAt)}-${timeFormatter.format(trip.endAt)}`;
  return sameDay ? hours : `${hours} (${dateFormatter.format(trip.endAt)})`;
}
