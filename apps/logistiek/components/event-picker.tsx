'use client';

import { useId, useMemo, useState } from 'react';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * "Hoort bij een bestaand evenement?"
 *
 * De koepel is optioneel: wie twee tafels leent, kiest hier niets en er verandert
 * niets. Wie een groot evenement doet, hangt zijn materiaal-, flesserke- en
 * vervoeraanvraag onder hetzelfde evenement, zodat Logistiek in één scherm ziet
 * wat er al aangevraagd is en wat ontbreekt.
 *
 * De derde optie ("maak er een aan") lost de kip-en-eiproblematiek op: de eerste
 * aanvraag van een evenement heeft nog niets om aan te hangen, en wachten tot het
 * team er een maakt, zou betekenen dat niemand het ooit gebruikt.
 */
export type SelectableEvent = {
  id: string;
  name: string;
  startAt: string | null;
  groupName: string | null;
};

export function EventPicker({
  events,
  eventId,
  createEvent,
  onChange,
  locale,
  /** De naam die in het formulier staat; die wordt de naam van een nieuw evenement. */
  newEventName,
}: {
  events: SelectableEvent[];
  eventId: string;
  createEvent: boolean;
  onChange: (next: { eventId: string; createEvent: boolean }) => void;
  locale: LogistiekLocale;
  newEventName: string;
}) {
  const en = locale === 'en';
  const [search, setSearch] = useState('');
  const listId = useId();

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return events.slice(0, 8);
    return events.filter((event) => event.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [events, search]);

  const chosen = events.find((event) => event.id === eventId) ?? null;

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        {en ? 'Part of an event?' : 'Hoort dit bij een evenement?'}
      </h2>
      <p className="mt-1 text-sm text-vtk-muted">
        {en
          ? 'Optional. Link material, drinks and transport of the same event so Logistics sees them together.'
          : 'Optioneel. Hang materiaal, flesserke en transport van hetzelfde evenement samen, dan ziet Logistiek ze in één scherm.'}
      </p>

      {chosen ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-vtk-yellow/25 px-2.5 py-0.5 text-[11px] font-semibold text-vtk-ink">
            {en ? 'Event' : 'Evenement'}
          </span>
          <span className="font-medium text-vtk-ink">{chosen.name}</span>
          {chosen.groupName ? <span className="text-vtk-muted">· {chosen.groupName}</span> : null}
          <button
            type="button"
            onClick={() => onChange({ eventId: '', createEvent: false })}
            className="text-vtk-muted underline underline-offset-2"
          >
            {en ? 'Unlink' : 'Loskoppelen'}
          </button>
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {events.length > 0 ? (
            <>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={en ? 'Search an event...' : 'Zoek een evenement...'}
                aria-label={en ? 'Search an event' : 'Zoek een evenement'}
                aria-controls={listId}
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
              />
              <ul id={listId} className="grid gap-1">
                {shown.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => onChange({ eventId: event.id, createEvent: false })}
                      className="w-full rounded-[10px] border border-vtk-navy/10 px-3 py-2 text-left text-sm transition hover:border-vtk-navy/30 hover:bg-vtk-paper"
                    >
                      <span className="font-medium text-vtk-ink">{event.name}</span>
                      <span className="text-vtk-muted">
                        {event.groupName ? ` · ${event.groupName}` : ''}
                        {event.startAt ? ` · ${event.startAt}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 ? (
                  <li className="text-sm text-vtk-muted">
                    {en ? 'Nothing found.' : 'Niets gevonden.'}
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}

          <label className="mt-1 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createEvent}
              onChange={(event) => onChange({ eventId: '', createEvent: event.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium text-vtk-ink">
                {en ? 'Create a new event for this' : 'Maak hier een nieuw evenement van'}
              </span>
              <span className="block text-xs text-vtk-muted">
                {newEventName.trim()
                  ? en
                    ? `Called "${newEventName.trim()}". Your next request can hang under it.`
                    : `Met de naam "${newEventName.trim()}". Je volgende aanvraag kan er dan onder hangen.`
                  : en
                    ? 'Uses the event name you fill in above.'
                    : 'Gebruikt de naam die je hierboven invult.'}
              </span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
