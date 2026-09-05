'use client';

import { useState } from 'react';

import type { UitleenRequesterType } from '@prisma/client';
import { SaveForm } from '@/components/ui/save-form';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { chargesRequester } from '@/lib/uitleen';
import { approveTransportAction, rejectTransportAction } from '@/app/actions/beheer';
import type { DriverOption } from '@/lib/uitleen-server';
import { DriverOptions } from './driver-select';

const APPROVE_ERRORS = {
  MODE_REQUIRED: 'Kies hoe er betaald wordt.',
  NOT_FOUND: 'Rit niet gevonden.',
  NOT_REQUESTED: 'Deze rit is al beslist.',
  NOT_A_DRIVER: 'Deze persoon staat niet in de chauffeurslijst.',
  TIME_INVALID: 'Vul een geldig begin- en einduur in.',
  TIME_ORDER: 'Het einduur ligt voor het beginuur.',
  TIME_QUARTER: 'Kies uren op het kwartier (bv. 14:00, 14:15).',
  SELF_OVERLAP: 'De heen- en terugrit overlappen elkaar.',
  // OVERLAP komt bewust niet in deze lijst: de actie stuurt zelf een zin mee met
  // de rit waarmee het botst, en die is bruikbaarder dan "voertuig bezet".
};

const REJECT_ERRORS = {
  NOTE_REQUIRED: 'Geef een reden mee; het lid ziet die bij de rit.',
  NOT_FOUND: 'Rit niet gevonden.',
  NOT_REQUESTED: 'Deze rit is al beslist.',
};

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink';

export type DecisionLeg = {
  id: string;
  /** Voorgevuld met de gevraagde uren, als datetime-local-waarde. */
  startAt: string;
  endAt: string;
  label: string | null;
};

export function TransportDecisionForms({
  bookingId,
  legs,
  drivers,
  pricingIsPerKm,
  requesterType,
  needsDriver = true,
  needsVanDriver = false,
  sameDayBookings = [],
}: {
  bookingId: string;
  /** De rit zelf, of beide helften van een heen-en-terugaanvraag. */
  legs: DecisionLeg[];
  drivers: DriverOption[];
  pricingIsPerKm: boolean;
  /** R4: enkel externen betalen, dus enkel zij krijgen een betaalwijze. */
  requesterType: UitleenRequesterType;
  /** Rijdt Logistiek dit voertuig? De bakfiets neemt de aanvrager zelf mee. */
  needsDriver?: boolean;
  needsVanDriver?: boolean;
  /** Andere goedgekeurde ritten met datzelfde voertuig die dag, om naar te schuiven. */
  sameDayBookings?: string[];
}) {
  // Meerdere ritten in één aanvraag: heen en terug (V12), meerdere voertuigen
  // (V1), of allebei. Standaard beslist het team over alles samen; wie enkel
  // deze rit wil vastleggen, zegt dat expliciet (T2).
  const multiple = legs.length > 1;
  const [separate, setSeparate] = useState(false);
  const decidingAll = multiple && !separate;
  // Een post of werkgroep betaalt niets (R4), dus de keuze tussen online en ter
  // plaatse betalen is daar zinloos.
  const charged = chargesRequester(requesterType);

  return (
    <div className="grid gap-4">
      <SaveForm
        action={approveTransportAction}
        submitLabel={decidingAll ? `Alle ${legs.length} ritten goedkeuren` : 'Goedkeuren'}
        savingLabel="Goedkeuren..."
        savedMessage={
          decidingAll ? 'Alle ritten van deze aanvraag goedgekeurd.' : 'Rit goedgekeurd.'
        }
        errorMessages={APPROVE_ERRORS}
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        {(state) => (
          <>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="scope" value={separate ? 'single' : 'group'} />
            <p className="text-sm font-semibold text-vtk-ink">Goedkeuren</p>

            {/* Heen en terug apart kunnen beslissen (T2): soms kan de heenrit wel en
                moet de terugrit nog verschuiven. Standaard uit, want heen zonder
                terug laat iemand ter plaatse staan. */}
            {multiple ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={separate}
                  onChange={(event) => setSeparate(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Enkel deze rit beslissen
                  <span className="mt-0.5 block text-xs text-vtk-muted">
                    De andere {legs.length - 1} rit{legs.length - 1 > 1 ? 'ten' : ''} van deze aanvraag
                    {legs.length - 1 > 1 ? ' blijven' : ' blijft'} openstaan. Let op dat de aanvrager
                    niet zonder terugrit valt.
                  </span>
                </span>
              </label>
            ) : null}

            {/* De uren staan in het formulier, niet vast: twee aanvragen voor dezelfde
                kar passen vaak samen na een halfuur schuiven. */}
            {(separate ? legs.filter((leg) => leg.id === bookingId) : legs).map((leg) => (
              <div key={leg.id} className="grid gap-2 sm:grid-cols-2">
                {leg.label ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-vtk-muted sm:col-span-2">
                    {leg.label}
                  </p>
                ) : null}
                <label className="grid gap-1 text-sm">
                  <span className="text-vtk-muted">Van</span>
                  <QuarterDateTime
                    name={`startAt-${leg.id}`}
                    defaultValue={leg.startAt}
                    timeLabel="Startuur"
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-vtk-muted">Tot</span>
                  <QuarterDateTime
                    name={`endAt-${leg.id}`}
                    defaultValue={leg.endAt}
                    timeLabel="Einduur"
                    className={inputClass}
                  />
                </label>
              </div>
            ))}
            <p className="text-xs text-vtk-muted">
              Verschoven uren worden meteen de uren van de rit; de wijziging komt in de historiek.
            </p>

            {sameDayBookings.length > 0 ? (
              <div className="rounded-[12px] bg-white px-3 py-2 text-xs text-vtk-body">
                <p className="font-semibold text-vtk-ink">Dit voertuig staat die dag al vast:</p>
                <ul className="mt-1 grid gap-0.5">
                  {sameDayBookings.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Bij een voertuig dat de aanvrager zelf meeneemt, hoort geen
                chauffeur; de keuzelijst helemaal weglaten zou het team wel het
                recht ontnemen er alsnog iemand op te zetten, dus enkel het lege
                antwoord verandert van betekenis (T13). */}
            <label className="grid gap-1 text-sm">
              <span className="text-vtk-muted">
                {needsDriver ? 'Chauffeur (optioneel, kan later)' : 'Chauffeur (niet nodig voor dit voertuig)'}
              </span>
              <select
                name="driverId"
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
                defaultValue=""
              >
                <option value="">{needsDriver ? 'Nog geen chauffeur' : 'Geen chauffeur nodig'}</option>
                <DriverOptions drivers={drivers} needsVanDriver={needsVanDriver} />
              </select>
            </label>
            {charged ? (
              <fieldset className="grid gap-2 text-sm">
                <legend className="sr-only">Betaalwijze</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="paymentMode" value="ONLINE" defaultChecked={!pricingIsPerKm} />
                  <span>Online betalen (betaallink voor het lid)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="paymentMode" value="OFFLINE" defaultChecked={pricingIsPerKm} />
                  <span>Ter plaatse betalen (cash/Payconiq)</span>
                </label>
              </fieldset>
            ) : (
              // `approveTransportAction` weigert met MODE_REQUIRED zonder betaalwijze.
              // Enkel de radiogroep verbergen zou een interne rit dus onbeslisbaar
              // maken; OFFLINE is hier de betekenisloze maar veilige waarde, want er
              // volgt geen betaallink en de knop "Markeer als betaald" is voor een
              // interne aanvrager toch verborgen. Laat deze input dus staan.
              <input type="hidden" name="paymentMode" value="OFFLINE" />
            )}
            {charged && pricingIsPerKm ? (
              <p className="text-xs text-vtk-muted">
                De prijs wordt pas bekend na de rit (per km); online betalen kan na het afronden.
              </p>
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="text-vtk-muted">Nota voor het lid (optioneel)</span>
              <input
                type="text"
                name="adminNote"
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
              />
            </label>

            {/* Pas ná een geweigerde botsing: altijd tonen zou dit vinkje tot
                standaarduitrusting maken, en dan remt de weigering niets meer. */}
            {state.status === 'error' && state.code === 'OVERLAP' ? (
              <label className="flex items-start gap-2 rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm">
                <input type="checkbox" name="allowOverlap" className="mt-0.5 h-4 w-4" />
                <span>
                  Toch goedkeuren
                  <span className="mt-0.5 block text-xs text-vtk-body">
                    Het voertuig staat dan dubbel geboekt. Beide ritten worden rood in de
                    planning tot je er een verschuift.
                  </span>
                </span>
              </label>
            ) : null}
          </>
        )}
      </SaveForm>

      <SaveForm
        action={rejectTransportAction}
        submitLabel={multiple ? `Alle ${legs.length} ritten afwijzen` : 'Afwijzen'}
        savingLabel="Afwijzen..."
        savedMessage={multiple ? 'Alle ritten van deze aanvraag afgewezen.' : 'Rit afgewezen.'}
        errorMessages={REJECT_ERRORS}
        submitVariant="danger"
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <p className="text-sm font-semibold text-vtk-ink">Afwijzen</p>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Reden (verplicht, zichtbaar voor het lid)</span>
          <input
            type="text"
            name="adminNote"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
          />
        </label>
      </SaveForm>
    </div>
  );
}
