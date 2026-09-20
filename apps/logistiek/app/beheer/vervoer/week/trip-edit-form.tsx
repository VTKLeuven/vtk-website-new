'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { adminEditTransportAction } from '@/app/actions/beheer';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { useToast } from '@/components/ui/toast';
import { TripEventSelect, type TripEventOption } from '@/components/trip-event-select';
import { materialListHref } from '@/lib/material-list-link';
import { EXTERN_REQUESTER, OTHER_REQUESTER, requesterFromChoice } from '@/lib/uitleen';

/**
 * De feiten van een rit aanpassen, in de inspector naast de kalender (P4).
 *
 * Eén op één met het venster dat het team tot nu toe in zijn externe agenda-tool
 * gebruikte: start, eind, reden, lading, extra info. Bestuurder en voertuig staan
 * eronder in `TransportControls`, want die hebben hun eigen actie met hun eigen
 * regels (een chauffeur moet in de chauffeurslijst staan, een voertuigwissel
 * hersnapshot het tarief).
 *
 * Bewust geen `SaveForm`: die hoort bij een `<form action>`, en deze actie neemt
 * een object omdat het formulier gecontroleerde velden heeft (de uren zijn
 * kwartierkiezers, geen vrije invoer).
 */

const inputClass =
  'w-full rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 py-2 text-sm text-vtk-ink';

export type TripEditValues = {
  startAt: string;
  endAt: string;
  purpose: string;
  cargoNote: string;
  pickupAddress: string;
  destination: string;
  adminNote: string;
  /** Het evenement waar de rit onder hangt (A8); leeg is geen evenement. */
  eventId: string;
  /**
   * Voor wie de rit rijdt (F4.4): een post-id, leeg (Logistiek zelf), of een
   * van de twee sentinels hierboven.
   */
  requesterChoice: string;
  /** Enkel bij een sentinel: de vrije naam van de werkgroep of de externe. */
  requesterOther: string;
};

export function TripEditForm({
  bookingId,
  initial,
  groups,
  currentGroup,
  events,
  reservationId,
  locked,
  onSaved,
}: {
  bookingId: string;
  initial: TripEditValues;
  /** De posten en werkgroepen waarvoor de rit kan rijden (F4.4). */
  groups: Array<{ id: string; name: string }>;
  /**
   * De post waar de rit nu op staat, als die niet meer actief is.
   *
   * `activeGroups` levert enkel actieve posten, en een rit van vorig jaar kan
   * op een post staan die er niet meer is. Zonder deze staat de keuzelijst dan
   * stil op "Logistiek zelf" en verhuist één klik op opslaan de rit weg van een
   * post die niemand koos.
   */
  currentGroup: { id: string; name: string } | null;
  /** De evenementen rond deze periode, om de rit aan te hangen (A8). */
  events: TripEventOption[];
  /** De materiaalaanvraag waarvan deze rit de levering is, als er een is. */
  reservationId: string | null;
  /** Afgerond of geannuleerd: de rit is geschiedenis en staat enkel nog te lezen. */
  locked: boolean;
  onSaved?: () => void;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  /** Botste de vorige poging? Dan pas verschijnt "toch verschuiven". */
  const [clashed, setClashed] = useState(false);

  // Klik je in de kalender een andere rit aan, dan blijft dit formulier bestaan
  // en moet het de nieuwe waarden overnemen; anders bewerk je rit B met de velden
  // van rit A nog ingevuld.
  useEffect(() => {
    setValues(initial);
    setError(null);
    setClashed(false);
  }, [initial]);

  function set<K extends keyof TripEditValues>(key: K, value: TripEditValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const dirty = (Object.keys(values) as Array<keyof TripEditValues>).some(
    (key) => values[key] !== initial[key]
  );

  /** Een sentinel: dan vraagt het formulier zelf om de naam. */
  const freeName =
    values.requesterChoice === OTHER_REQUESTER || values.requesterChoice === EXTERN_REQUESTER;
  const requesterDirty =
    values.requesterChoice !== initial.requesterChoice ||
    values.requesterOther !== initial.requesterOther;
  /** Was extern en wordt het niet meer: dan verandert er iets aan het geld. */
  const leavingExtern =
    initial.requesterChoice === EXTERN_REQUESTER && values.requesterChoice !== EXTERN_REQUESTER;

  function save(allowOverlap = false) {
    setError(null);
    if (freeName && values.requesterOther.trim() === '') {
      // Anders staat de rit als kale "Werkgroep" in de planning, en dan is "voor
      // wie is dit" precies de vraag die je niet meer beantwoord krijgt.
      setError('Vul in voor wie deze rit rijdt, of kies een post uit de lijst.');
      return;
    }
    const { requesterChoice, requesterOther, ...fields } = values;
    startTransition(async () => {
      // `eventName` staat hier niet bij: de actie zoekt de naam zelf op bij het
      // gekozen evenement. Het slepen van een blok in de kalender roept dezelfde
      // actie aan met deze waarden, en dat gebaar heeft geen lijst evenementen
      // bij de hand om een naam uit te halen.
      const result = await adminEditTransportAction(bookingId, {
        ...fields,
        requester: requesterFromChoice(requesterChoice, requesterOther),
        allowOverlap,
      });
      if (result.ok) {
        // Een bewust geforceerde botsing is goed nieuws met een staartje: die
        // melding blijft staan tot je ze wegklikt.
        showToast({
          message: result.message ?? 'Opgeslagen.',
          variant: 'success',
          duration: result.warning ? 0 : undefined,
        });
        onSaved?.();
      } else {
        // In het paneel zelf én als toast: het paneel scrollt, en een melding die
        // boven de vouw hangt terwijl je onderaan op opslaan drukte, lees je niet.
        setError(result.error);
        setClashed(result.code === 'OVERLAP');
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  if (locked) {
    return (
      <p className="text-sm text-vtk-muted">
        Deze rit is afgerond of geannuleerd; er kan niets meer aan gewijzigd worden.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Onder elkaar en niet naast elkaar: het paneel is 26rem breed, en een
          datumveld plus een uurkeuze naast elkaar knijpt de datum tot "02/09/2…". */}
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Start
          <QuarterDateTime value={values.startAt} onChange={(value) => set('startAt', value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Einde
          <QuarterDateTime
            value={values.endAt}
            onChange={(value) => set('endAt', value)}
            min={values.startAt}
          />
        </label>
      </div>

      {/* Voor wie de rit rijdt (F4.4). Boven "Waarvoor" en niet onderaan: het is
          dezelfde vraag als in het intekenformulier, waar ze ook bovenaan staat,
          en het is het eerste wat je nakijkt wanneer een rit op de verkeerde
          naam blijkt te staan. */}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Voor welke post of werkgroep
        <select
          value={values.requesterChoice}
          onChange={(event) => set('requesterChoice', event.target.value)}
          className={inputClass}
        >
          <option value="">Logistiek zelf</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          {currentGroup && !groups.some((group) => group.id === currentGroup.id) ? (
            <option value={currentGroup.id}>{currentGroup.name} (niet meer actief)</option>
          ) : null}
          <option value={OTHER_REQUESTER}>Andere...</option>
          {/* Enkel bij een rit die al extern is: zie `EXTERN_REQUESTER`. */}
          {initial.requesterChoice === EXTERN_REQUESTER ? (
            <option value={EXTERN_REQUESTER}>Externe</option>
          ) : null}
        </select>
      </label>

      {freeName ? (
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Voor wie dan
          <input
            type="text"
            value={values.requesterOther}
            onChange={(event) => set('requesterOther', event.target.value)}
            placeholder="bv. Alumni, een bevriende kring, de faculteit"
            className={inputClass}
          />
        </label>
      ) : null}

      {requesterDirty ? (
        <p className="rounded-lg border border-vtk-navy/10 bg-vtk-paper px-3 py-2 text-xs leading-5 text-vtk-body">
          Wie deze rit ziet bij "Ritten van mijn post" verandert mee. De post die zelf een chauffeur
          aanduidt, staat daar los van en blijft staan.
          {leavingExtern ? (
            <>
              {' '}
              Het bewaarde tarief blijft ook staan, want een tarief wordt nooit herrekend; de prijs
              en de betaalstatus verdwijnen wel van het scherm, omdat enkel een externe betaalt.
            </>
          ) : null}
        </p>
      ) : null}

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Waarvoor
        <input
          type="text"
          value={values.purpose}
          onChange={(event) => set('purpose', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Lading
        <input
          type="text"
          value={values.cargoNote}
          onChange={(event) => set('cargoNote', event.target.value)}
          placeholder="bv. 20 bierbakken en 4 tafels"
          className={inputClass}
        />
      </label>

      {/* De link naar de materiaallijst erbij zetten, in één klik. Hij hoort in
          de lading omdat dat het veld is dat meereist naar "Mijn ritten": wie de
          rit openslaat, ziet dan meteen waar de lijst staat in plaats van hem
          terug te zoeken via de naam van de aanvrager. Enkel bij een rit die een
          levering is; een rit zonder aanvraag heeft geen lijst. */}
      {reservationId && !values.cargoNote.includes(materialListHref(reservationId)) ? (
        <button
          type="button"
          onClick={() =>
            set(
              'cargoNote',
              `${values.cargoNote.trim() ? `${values.cargoNote.trim()} · ` : ''}Materiaallijst: ${materialListHref(reservationId)}`
            )
          }
          className="justify-self-start text-xs font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
        >
          Link naar de materiaallijst invoegen
        </button>
      ) : null}

      {events.length > 0 ? (
        <TripEventSelect
          events={events}
          value={values.eventId}
          onChange={(eventId) => set('eventId', eventId)}
          className={inputClass}
        />
      ) : null}

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Laadadres
        <input
          type="text"
          value={values.pickupAddress}
          onChange={(event) => set('pickupAddress', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Bestemming
        <input
          type="text"
          value={values.destination}
          onChange={(event) => set('destination', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Extra info van Logistiek
        <textarea
          rows={3}
          value={values.adminNote}
          onChange={(event) => set('adminNote', event.target.value)}
          placeholder="Staat mee in de mail naar de aanvrager"
          className={inputClass}
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-lg border border-vtk-danger-line bg-vtk-danger-soft px-3 py-2 text-sm text-vtk-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => save()} disabled={pending || !dirty}>
          {pending ? 'Opslaan...' : 'Opslaan'}
        </Button>
        {clashed ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => save(true)}
            disabled={pending || !dirty}
          >
            Toch verschuiven
          </Button>
        ) : null}
        {dirty ? (
          <button
            type="button"
            onClick={() => setValues(initial)}
            disabled={pending}
            className="text-sm font-medium text-vtk-muted underline underline-offset-4"
          >
            Ongedaan maken
          </button>
        ) : null}
      </div>
    </div>
  );
}
