'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { adminCreateTransportAction } from '@/app/actions/beheer';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { useToast } from '@/components/ui/toast';
import { DriverOptions } from '../driver-select';
import type { DriverOption } from '@/lib/uitleen-server';

/**
 * Een rit inplannen vanuit de kalender (P4).
 *
 * De rit komt meteen als goedgekeurd binnen: het team vraagt niets aan zichzelf,
 * en ze daarna nog eens laten goedkeuren zou een lege stap zijn die blijft
 * openstaan. De botsingscontrole loopt daarom bij het opslaan.
 *
 * Wat er níét in staat: heen-en-terug en meerdere voertuigen tegelijk. Die
 * bestaan voor een aanvraag van een lid, waar ze samen beslist moeten worden;
 * wie hier twee ritten plant, tekent er gewoon twee. Dat scheelt een formulier
 * met vier tijdvelden voor het geval dat.
 */

const inputClass =
  'w-full rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink';

/**
 * De waarde van "Andere..." in de postkeuze.
 *
 * Een sentinel in `groupId` en geen tweede veld ernaast: het is één vraag ("voor
 * wie rijdt deze rit") met één antwoord, en twee velden waarvan er altijd
 * precies één gevuld hoort te zijn, lopen vroeg of laat allebei ingevuld.
 * Botst niet met een echte id: die zijn cuids.
 */
const OTHER_GROUP = 'andere';

export type NewTripValues = {
  startAt: string;
  endAt: string;
  vehicleId: string;
  /** Een post- of werkgroep-id, leeg (Logistiek zelf) of {@link OTHER_GROUP}. */
  groupId: string;
  /** Enkel bij {@link OTHER_GROUP}: voor wie de rit dan wél rijdt. */
  requesterName: string;
  driverId: string;
  purpose: string;
  cargoNote: string;
  pickupAddress: string;
  destination: string;
};

export function NewTripForm({
  initial,
  vehicles,
  groups,
  drivers,
  onDone,
  onCancel,
  onRangeChange,
}: {
  initial: NewTripValues;
  vehicles: Array<{ id: string; name: string; needsVanDriver: boolean }>;
  /** De posten en werkgroepen waarvoor de rit rijdt. */
  groups: Array<{ id: string; name: string }>;
  drivers: DriverOption[];
  onDone: () => void;
  onCancel: () => void;
  /**
   * De gekozen uren, telkens ze veranderen. De planning tekent er het grijze
   * blok mee op het rooster; zonder dit blijft dat blok staan op wat je
   * oorspronkelijk sleepte terwijl je hier al iets anders koos.
   */
  onRangeChange?: (startAt: string, endAt: string) => void;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  /**
   * Botste de vorige poging? Dan verschijnt er een tweede knop om ze toch door
   * te duwen. Pas dán, en niet meteen: een knop "toch inplannen" die er altijd
   * staat, wordt de knop waarop je klikt.
   */
  const [clashed, setClashed] = useState(false);

  function set<K extends keyof NewTripValues>(key: K, value: NewTripValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // De uren terugmelden in een effect en niet in de setter: een `setState` van
  // de ouder oproepen binnen een updater draait tijdens de render van dit
  // formulier, en React klaagt daar terecht over ("Cannot update a component
  // while rendering a different component").
  const report = useRef(onRangeChange);
  report.current = onRangeChange;
  useEffect(() => {
    report.current?.(values.startAt, values.endAt);
  }, [values.startAt, values.endAt]);

  /** "Andere" gekozen, dus er hoort een naam bij. */
  const isOther = values.groupId === OTHER_GROUP;

  function save(allowOverlap = false) {
    setError(null);
    if (isOther && values.requesterName.trim() === '') {
      // Anders staat de rit als "Werkgroep" zonder naam in de planning, en dan
      // is "voor wie is dit" precies de vraag die je niet meer beantwoord krijgt.
      setError('Vul in voor wie deze rit rijdt, of kies een post uit de lijst.');
      return;
    }
    startTransition(async () => {
      const result = await adminCreateTransportAction({
        allowOverlap,
        startAt: values.startAt,
        endAt: values.endAt,
        vehicleIds: values.vehicleId ? [values.vehicleId] : [],
        purpose: values.purpose,
        cargoNote: values.cargoNote,
        pickupAddress: values.pickupAddress,
        destination: values.destination,
        // Er is geen ledennota bij een rit die het team zelf inplant: er is geen
        // lid dat er een schreef.
        note: '',
        // "Andere" wordt een werkgroep met een vrije naam en géén externe: enkel
        // een externe krijgt prijs, tarief en betaalstatus (`chargesRequester`),
        // en dat is niet wat "andere" hier betekent. Zie docs/design-decisions.md.
        groupId: isOther ? null : values.groupId || null,
        requesterType: isOther ? 'WERKGROEP' : 'INTERN',
        requesterName: isOther ? values.requesterName.trim() : null,
        driverId: values.driverId || null,
      });
      if (result.ok) {
        // De actie meldt zelf wanneer de rit bewust over een andere ligt; dat is
        // een waarschuwing en geen fout, dus blijft ze staan tot je ze wegklikt.
        showToast({
          message: result.message ?? 'Rit ingepland.',
          variant: 'success',
          duration: result.warning ? 0 : undefined,
        });
        onDone();
      } else {
        setError(result.error);
        setClashed(result.code === 'OVERLAP');
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const chosenVehicle = vehicles.find((vehicle) => vehicle.id === values.vehicleId);

  return (
    <div className="grid gap-3">
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

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Voertuig
        <select
          value={values.vehicleId}
          onChange={(event) => set('vehicleId', event.target.value)}
          className={inputClass}
        >
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Voor welke post of werkgroep
        <select
          value={values.groupId}
          onChange={(event) => set('groupId', event.target.value)}
          className={inputClass}
        >
          <option value="">Logistiek zelf</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          {/* Onderaan en niet bovenaan: het is de uitzondering, en Logistiek
              rijdt meestal voor een post die gewoon in de lijst staat. */}
          <option value={OTHER_GROUP}>Andere...</option>
        </select>
      </label>

      {isOther ? (
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Voor wie dan
          <input
            type="text"
            value={values.requesterName}
            onChange={(event) => set('requesterName', event.target.value)}
            placeholder="bv. Alumni, een bevriende kring, de faculteit"
            className={inputClass}
            autoFocus
          />
        </label>
      ) : null}

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Chauffeur
        <select
          value={values.driverId}
          onChange={(event) => set('driverId', event.target.value)}
          className={inputClass}
        >
          <option value="">Nog geen</option>
          <DriverOptions
            drivers={drivers}
            current={null}
            needsVanDriver={chosenVehicle?.needsVanDriver ?? false}
          />
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Waarvoor
        <input
          type="text"
          value={values.purpose}
          onChange={(event) => set('purpose', event.target.value)}
          placeholder="bv. Cantusmateriaal ophalen"
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

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => save()} disabled={pending}>
          {pending ? 'Inplannen...' : 'Rit inplannen'}
        </Button>
        {clashed ? (
          <Button type="button" size="sm" variant="danger" onClick={() => save(true)} disabled={pending}>
            Toch inplannen
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm font-medium text-vtk-muted underline underline-offset-4"
        >
          Annuleren
        </button>
      </div>
    </div>
  );
}
