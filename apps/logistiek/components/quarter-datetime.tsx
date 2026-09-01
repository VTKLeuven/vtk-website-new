'use client';

import { useEffect, useRef, useState } from 'react';
import { joinMoment, quarterOptions, splitMoment } from '@/lib/quarter-time';

/**
 * Een datum en een uur kiezen, waarbij enkel kwartieren bestaan.
 *
 * `<input type="datetime-local" step={900}>` leek dit te doen, maar doet het
 * niet: de pijltjes springen per kwartier, terwijl je 14:07 gewoon kan intikken.
 * De server weigert dat (zie `isOnQuarterHour`), dus je vulde een formulier in,
 * klikte op verzenden en kreeg een foutmelding over iets wat het veld je zelf
 * had laten doen. Een keuzelijst met de kwartieren erin kan die fout niet meer
 * maken.
 *
 * Bewust geen stille afronding van 14:07 naar 14:15: dat verschuift een rit
 * zonder dat de aanvrager het merkt, en dat is precies waarom de server ze
 * weigert in plaats van ze te aanvaarden.
 */
export function QuarterDateTime({
  value,
  defaultValue,
  onChange,
  name,
  min,
  dataField,
  invalid,
  className = '',
  disabled,
  timeLabel,
}: {
  /** Gecontroleerd gebruik; laat weg en gebruik `defaultValue` in een gewoon formulier. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Zet een verborgen veld met de samengevoegde waarde, voor een `<form action>`. */
  name?: string;
  /** Vroegste toegelaten moment, als `YYYY-MM-DDTHH:MM`. */
  min?: string;
  dataField?: string;
  invalid?: boolean;
  className?: string;
  disabled?: boolean;
  /** Toegankelijke naam voor de urenlijst ("Startuur"); het zichtbare label hoort bij de datum. */
  timeLabel?: string;
}) {
  const [parts, setParts] = useState(() => splitMoment(value ?? defaultValue ?? ''));
  // Wat we het laatst naar boven stuurden. Zonder dit kan een parent die de
  // waarde herberekent onze half ingevulde staat wissen terwijl je nog bezig
  // bent: de datum staat er dan al, het uur nog niet, en wij melden "".
  const lastEmitted = useRef(value ?? defaultValue ?? '');

  useEffect(() => {
    if (value === undefined || value === lastEmitted.current) return;
    setParts(splitMoment(value));
    lastEmitted.current = value;
  }, [value]);

  const minParts = min ? splitMoment(min) : null;
  // Enkel op de mindag zelf beperkt het minimum de uren; een latere dag is
  // altijd goed.
  const earliestTime =
    minParts && minParts.date && parts.date === minParts.date ? minParts.time : '';

  const options = quarterOptions(parts.time);

  function update(next: { date: string; time: string }) {
    // Schuift de datum naar de vroegst toegelaten dag, dan is een vroeger uur
    // onmogelijk geworden; opschuiven naar het eerste dat wel kan, zodat het
    // veld niet op een grijze, onselecteerbare keuze blijft staan.
    const floor =
      minParts && minParts.date && next.date === minParts.date ? minParts.time : '';
    const corrected =
      floor && next.time && next.time < floor ? { ...next, time: floor } : next;
    setParts(corrected);
    const combined = joinMoment(corrected.date, corrected.time);
    lastEmitted.current = combined;
    onChange?.(combined);
  }

  return (
    // Naast elkaar wanneer het past, onder elkaar wanneer niet.
    //
    // Dit was een raster van twee vaste kolommen, en in een zijbalk van 340px
    // bleef er voor de datum een strookje van dertig pixels over: het veld stond
    // er wel, maar je zag er niets meer van. Een datumveld heeft een
    // minimumbreedte nodig (de browser tekent er dd/mm/jjjj in), dus krijgt het
    // die, en dan zakt de urenlijst eronder in plaats van de datum plat te
    // duwen.
    //
    // De maten staan op de omhulsels en niet op de velden zelf: `className`
    // komt van de aanroeper en draagt vaak al `w-full`, en welke van twee
    // breedtes dan wint hangt af van de volgorde in de stylesheet. Zo hoeft dat
    // niet uitgevochten te worden.
    <span className="flex flex-wrap gap-2">
      <span className="min-w-[8.5rem] flex-1">
        <input
          type="date"
          value={parts.date}
          min={minParts?.date || undefined}
          onChange={(event) => update({ ...parts, date: event.target.value })}
          data-field={dataField}
          aria-invalid={invalid}
          disabled={disabled}
          className={`${className} w-full`}
        />
      </span>
      <span className="w-[6.5rem] shrink-0">
        <select
          value={parts.time}
          onChange={(event) => update({ ...parts, time: event.target.value })}
          aria-label={timeLabel}
          aria-invalid={invalid}
          disabled={disabled}
          className={`${className} w-full`}
        >
          <option value="">--:--</option>
          {options.map((option) => (
            <option
              key={option}
              value={option}
              disabled={Boolean(earliestTime) && option < earliestTime}
            >
              {option}
            </option>
          ))}
        </select>
      </span>
      {name ? <input type="hidden" name={name} value={joinMoment(parts.date, parts.time)} /> : null}
    </span>
  );
}
