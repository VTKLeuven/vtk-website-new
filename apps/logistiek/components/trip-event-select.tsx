'use client';

/**
 * "Hoort deze rit bij een evenement?" in de beheerkant.
 *
 * Een keuzelijst en niet de `EventPicker` van de ledenkant: die heeft een
 * zoekveld, een groepje "eigen evenementen" en een derde optie om er een aan te
 * maken, en hij hoort thuis in een aanvraagformulier van een halve pagina. Dit
 * staat in het inspectorpaneel van 26rem naast de kalender, waar elk veld één
 * regel hoog is; een evenement aanmaken doet Logistiek in de strook boven het
 * rooster, waar het thuishoort.
 *
 * De naam van het evenement komt mee in `eventName` op de rit: dat veld is een
 * momentopname en blijft staan als het evenement later verdwijnt, precies zoals
 * bij een aanvraag van een lid.
 */
export type TripEventOption = {
  id: string;
  name: string;
  /** ISO; enkel om de datum achter de naam te zetten. */
  startAt: string;
  groupName: string | null;
};

const dayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
  month: 'short',
});

export function eventOptionLabel(event: TripEventOption): string {
  const when = dayFormatter.format(new Date(event.startAt));
  return event.groupName ? `${event.name} · ${when} · ${event.groupName}` : `${event.name} · ${when}`;
}

export function TripEventSelect({
  events,
  value,
  onChange,
  className,
}: {
  events: TripEventOption[];
  value: string;
  onChange: (eventId: string) => void;
  className?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-vtk-muted">
      Hoort bij evenement
      <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
        <option value="">Geen evenement</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {eventOptionLabel(event)}
          </option>
        ))}
        {/* Het evenement van deze rit ligt buiten het venster dat de lijst
            ophaalde. Zonder deze regel valt de keuzelijst terug op "Geen
            evenement" en ontkoppel je de rit door het formulier gewoon te
            openen en op te slaan. */}
        {value && !events.some((event) => event.id === value) ? (
          <option value={value}>Het gekoppelde evenement (buiten deze periode)</option>
        ) : null}
      </select>
    </label>
  );
}
