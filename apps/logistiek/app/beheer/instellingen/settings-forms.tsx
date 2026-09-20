'use client';

import { useState } from 'react';
import type { UitleenVehicle } from '@prisma/client';
import {
  NOTIFY_KINDS,
  TRIP_HANDOVER_MODES,
  type LogistiekNotifyEmails,
  type NotifyKind,
  type TripHandoverMode,
  type TripHandoverNotify,
} from '@/lib/uitleen';
import { saveLogistiekSettingsAction, saveVehicleAction, setVehicleActiveAction } from '@/app/actions/beheer';
import {
  VEHICLE_PATTERNS,
  VEHICLE_PATTERN_LABELS,
  vehiclePatternClass,
} from '@/lib/driver-colors';
import { VEHICLE_ICONS, VEHICLE_ICON_LABELS, vehicleIconName } from '@/lib/vehicle-icon';
import { LogisticsIcon } from '@/components/logistics-icon';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';

const VEHICLE_ERRORS = {
  NAME_REQUIRED: 'Geef het voertuig een naam.',
  AMOUNT_INVALID: 'Het tarief moet een bedrag zijn, bv. 0,35.',
};

const PRICING_MODES: Array<{ value: string; label: string }> = [
  { value: 'FREE', label: 'Gratis' },
  { value: 'PER_HOUR', label: 'Per uur' },
  { value: 'PER_KM', label: 'Per kilometer' },
  { value: 'FLAT', label: 'Vast bedrag' },
];

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink';

function euroInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * De arcering van dit voertuig in de transportplanning (K1), met het patroon
 * ernaast getekend.
 *
 * Een keuzelijst zonder voorbeeld zou "Ruitjes" tegenover "Stippen" zetten
 * zonder dat je ziet welke van de twee straks naast de kar staat, en dat is
 * precies waarvoor je hier bent.
 */
function VehiclePatternField({ pattern }: { pattern: string }) {
  const [chosen, setChosen] = useState(pattern);
  return (
    <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
      Arcering in de transportplanning
      <span className="flex items-center gap-3">
        <select
          name="pattern"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          className={`${inputClass} flex-1`}
        >
          {VEHICLE_PATTERNS.map((value) => (
            <option key={value} value={value}>
              {VEHICLE_PATTERN_LABELS[value]}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className={`h-10 w-16 shrink-0 rounded-lg border border-vtk-navy/15 bg-vtk-paper ${vehiclePatternClass(
            chosen
          )}`}
        />
      </span>
      <span className="font-normal text-vtk-muted">
        De vulkleur van een rit is de chauffeur; dit patroon zegt met welk voertuig hij rijdt.
        Geef elk voertuig een ander patroon, anders zegt het niets.
      </span>
    </label>
  );
}

/**
 * Het icoon van dit voertuig in de transportplanning (F4.21), getekend naast de
 * keuzelijst.
 *
 * Met "Automatisch" erin en niet enkel de drie iconen: wat er nu staat, is
 * afgeleid uit de naam, en dat klopt voor de kar, de auto en de bakfiets. Die
 * afleiding vervangen door een keuze die iemand ooit gemaakt heeft, betekent dat
 * een hernoemd voertuig zijn oude icoon blijft dragen. Kiezen doe je pas wanneer
 * de afleiding ernaast zit, bijvoorbeeld bij een gehuurd busje dat "Dockx" heet.
 */
function VehicleIconField({ icon, code }: { icon: string; code: string }) {
  const [chosen, setChosen] = useState(icon);
  return (
    <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
      Icoon in de transportplanning
      <span className="flex items-center gap-3">
        <select
          name="icon"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          className={`${inputClass} flex-1`}
        >
          {/* Kort, en niet "Automatisch, uit de naam": de breedte van een
              `select` is die van zijn langste optie, en die telt door tot in de
              breedte van de hele pagina. Met die zin erin liep het beheerscherm
              op een telefoon van 390px over de rand. Wat automatisch doet, staat
              eronder, waar tekst gewoon afbreekt. */}
          <option value="">Automatisch</option>
          {VEHICLE_ICONS.map((value) => (
            <option key={value} value={value}>
              {VEHICLE_ICON_LABELS[value]}
            </option>
          ))}
        </select>
        {/* Het echte icoon en geen naam ernaast: "Bestelwagen" tegenover "Auto"
            zegt niet welk van de twee tekeningetjes straks in het blok staat. */}
        <span
          aria-hidden
          className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border border-vtk-navy/15 bg-vtk-paper text-vtk-ink"
        >
          <LogisticsIcon name={vehicleIconName({ code, icon: chosen })} className="h-5 w-5" />
        </span>
      </span>
      <span className="font-normal text-vtk-muted">
        Staat in elk blok van de planning, naast de naam van het voertuig. Automatisch leidt het
        af uit de naam; kies zelf zodra dat ernaast zit, bijvoorbeeld bij een gehuurd busje.
      </span>
    </label>
  );
}

function VehicleFields({ vehicle }: { vehicle?: UitleenVehicle }) {
  // De naam wordt hier gestuurd om één reden: bij een voertuig dat nog niet
  // bestaat is er geen code, en dan is de naam waar "Automatisch" straks uit
  // afgeleid wordt. Zonder dit toont de voorvertoning een bestelwagen terwijl je
  // "Auto" aan het typen bent.
  const [nameNl, setNameNl] = useState(vehicle?.nameNl ?? '');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {vehicle ? <input type="hidden" name="id" value={vehicle.id} /> : null}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Naam (NL)
        <input
          type="text"
          name="nameNl"
          value={nameNl}
          onChange={(event) => setNameNl(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Naam (EN)
        <input type="text" name="nameEn" defaultValue={vehicle?.nameEn ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Tariefmodus
        <select name="pricingMode" defaultValue={vehicle?.pricingMode ?? 'FREE'} className={inputClass}>
          {PRICING_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Tarief (€)
        <input
          type="text"
          name="rate"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={vehicle ? euroInput(vehicle.rateCents) : ''}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
        Omschrijving (optioneel)
        <input type="text" name="description" defaultValue={vehicle?.description ?? ''} className={inputClass} />
      </label>
      <VehicleIconField icon={vehicle?.icon ?? ''} code={vehicle?.code ?? nameNl} />
      <VehiclePatternField pattern={vehicle?.pattern ?? 'none'} />
      <label className="flex items-start gap-2 text-sm text-vtk-ink sm:col-span-2">
        <input
          type="checkbox"
          name="needsDriver"
          defaultChecked={vehicle?.needsDriver ?? true}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Logistiek rijdt dit voertuig
          <span className="mt-0.5 block text-xs font-normal text-vtk-muted">
            Zet dit uit voor een voertuig dat de aanvrager zelf meeneemt, zoals de bakfiets. Dan
            vraagt de app er geen chauffeur voor en blijft de rit niet als onafgewerkt staan.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-vtk-ink sm:col-span-2">
        <input
          type="checkbox"
          name="needsVanDriver"
          defaultChecked={vehicle?.needsVanDriver ?? false}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Vraagt een chauffeur die de kar mag rijden
          <span className="mt-0.5 block text-xs font-normal text-vtk-muted">
            Voor de bestelwagen. Bij een rit met dit voertuig staan de chauffeurs die met de kar
            rijden bovenaan in de keuzelijst, de rest onder &quot;Niet met de kar&quot;. Wie dat is,
            zet je bij Chauffeurs.
          </span>
        </span>
      </label>
    </div>
  );
}

export function VehicleSettings({ vehicles }: { vehicles: UitleenVehicle[] }) {
  const active = vehicles.filter((v) => v.active);
  const inactive = vehicles.filter((v) => !v.active);

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Voertuigen & tarieven</h2>
      <p className="mt-1 text-sm text-vtk-muted">
        Stel per voertuig de tariefmodus in. Bij per-kilometer voert het team de kilometers in bij het
        afronden van de rit.
      </p>

      <ul className="mt-4 grid gap-3">
        {active.map((vehicle) => (
          <li key={vehicle.id} className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
            <SaveForm
              action={saveVehicleAction}
              submitLabel="Opslaan"
              savingLabel="Opslaan..."
              savedMessage="Voertuig opgeslagen."
              errorMessages={VEHICLE_ERRORS}
              className="grid gap-3"
            >
              <VehicleFields vehicle={vehicle} />
            </SaveForm>
            <div className="mt-2">
              <ConfirmActionButton
                label="Deactiveren"
                successMessage="Voertuig gedeactiveerd."
                action={setVehicleActiveAction.bind(null, vehicle.id, false)}
                destructive
                dialogTitle="Voertuig deactiveren?"
                dialogDescription="Leden kunnen dit voertuig niet meer kiezen. Bestaande ritten blijven bewaard."
              />
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-4 rounded-[14px] border border-dashed border-vtk-navy/25 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">+ Voertuig toevoegen</summary>
        <div className="mt-3">
          <SaveForm
            action={saveVehicleAction}
            submitLabel="Voertuig toevoegen"
            savingLabel="Toevoegen..."
            savedMessage="Voertuig toegevoegd."
            errorMessages={VEHICLE_ERRORS}
            className="grid gap-3"
          >
            <VehicleFields />
          </SaveForm>
        </div>
      </details>

      {inactive.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-vtk-ink">Gedeactiveerd</h3>
          <ul className="mt-2 grid gap-2">
            {inactive.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-vtk-paper/60 px-3 py-2.5 text-sm"
              >
                <span className="text-vtk-muted">{vehicle.nameNl}</span>
                <ConfirmActionButton
                  label="Heractiveren"
                  successMessage="Voertuig terug beschikbaar."
                  action={setVehicleActiveAction.bind(null, vehicle.id, true)}
                  confirm={false}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const GENERAL_ERRORS = {
  LAST_MINUTE_INVALID: 'De last-minute-termijn moet een aantal dagen tussen 1 en 90 zijn.',
  NOTIFY_EMAIL_INVALID:
    'Een van de meldingsadressen ziet er niet uit als een adres. Splits meerdere adressen met een komma.',
  HANDOVER_EMAIL_INVALID:
    'Vul het vaste adres in waar de melding over een doorgegeven rit naartoe moet, of kies een andere ontvanger.',
};

/** Wat elke keuze doet wanneer Logistiek een rit aan een post doorgeeft (F4.8b). */
const HANDOVER_LABELS: Record<TripHandoverMode, { title: string; hint: string }> = {
  NIEMAND: {
    title: 'Niemand',
    hint: 'De rit verschijnt bij die post onder "Ritten van mijn post". Er vertrekt geen mail.',
  },
  LEADS: {
    title: 'De verantwoordelijken van die post',
    hint: 'Elke verantwoordelijke (LEAD) van dit werkingsjaar krijgt een mail met de rit en een link om een chauffeur te kiezen.',
  },
  POSTADRES: {
    title: 'Het postadres',
    hint: 'De mailinglijst van die post zelf (bv. sport@vtk.be). Een post zonder eigen lijst krijgt geen mail; dat zegt de melding na het doorgeven.',
  },
  ADRES: {
    title: 'Een vast adres',
    hint: 'Altijd hetzelfde adres, ongeacht de post. Handig wanneer één iemand de ritten opvolgt.',
  },
};

/**
 * De ontvanger van de melding bij het doorgeven van een rit.
 *
 * Een radiogroep en geen keuzelijst: het zijn vier keuzes die elk iets anders
 * doen met de mailbox van iemand anders, en die lees je liever naast elkaar dan
 * één voor één. Het adresveld hangt onder zijn eigen keuze en blijft bewaard
 * wanneer je tijdelijk iets anders aanduidt.
 */
function TripHandoverField({ value }: { value: TripHandoverNotify }) {
  const [mode, setMode] = useState<TripHandoverMode>(value.mode);
  return (
    <div className="mt-4 grid gap-3 border-t border-vtk-navy/10 pt-4">
      <p className="text-sm font-semibold text-vtk-ink">Melding bij het doorgeven van een rit aan een post</p>
      <p className="text-xs text-vtk-muted">
        Geef je een autorit door, dan duidt die post zelf de chauffeur aan. Wie daarover een mail
        krijgt, kies je hier. Standaard niemand: de rit staat bij hen op &quot;Mijn ritten&quot;, en dat
        scherm is de melding.
      </p>
      {TRIP_HANDOVER_MODES.map((option) => (
        <label key={option} className="grid gap-1 text-sm text-vtk-ink">
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name="tripHandoverMode"
              value={option}
              checked={mode === option}
              onChange={() => setMode(option)}
              className="h-4 w-4"
            />
            {HANDOVER_LABELS[option].title}
          </span>
          <span className="ml-6 text-xs font-normal text-vtk-muted">{HANDOVER_LABELS[option].hint}</span>
        </label>
      ))}
      <label className="ml-6 grid gap-1 text-xs font-medium text-vtk-muted sm:max-w-[22rem]">
        Vast adres
        <input
          type="email"
          name="tripHandoverEmail"
          defaultValue={value.email}
          placeholder="logistiek@vtk.be"
          disabled={mode !== 'ADRES'}
          className={`${inputClass} disabled:opacity-50`}
        />
      </label>
    </div>
  );
}

/** Wat er per soort in de melding staat, zodat je weet wie je waarvoor aanschrijft. */
const NOTIFY_LABELS: Record<NotifyKind, { title: string; hint: string }> = {
  materiaal: {
    title: 'Materiaal',
    hint: 'Krijgt een mail met de nieuwe materiaalaanvragen.',
  },
  flesserke: {
    title: 'Flesserke',
    hint: 'Krijgt een mail met de nieuwe flesserke-aanvragen.',
  },
  transport: {
    title: 'Transport',
    hint: 'Krijgt een mail met de nieuwe ritaanvragen.',
  },
};

export function GeneralSettings({
  showRentPrices,
  lastMinuteDays,
  externalRequestsOpen,
  notifyEmails,
  tripHandover,
}: {
  showRentPrices: boolean;
  lastMinuteDays: number;
  externalRequestsOpen: boolean;
  notifyEmails: LogistiekNotifyEmails;
  tripHandover: TripHandoverNotify;
}) {
  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Algemeen</h2>
      <SaveForm
        action={saveLogistiekSettingsAction}
        submitLabel="Opslaan"
        savingLabel="Opslaan..."
        savedMessage="Instellingen opgeslagen."
        errorMessages={GENERAL_ERRORS}
        className="mt-4 grid gap-3"
      >
        <label className="flex items-center gap-2 text-sm text-vtk-ink">
          <input type="checkbox" name="showRentPrices" defaultChecked={showRentPrices} className="h-4 w-4" />
          Huurprijzen tonen aan leden (naast de waarborg)
        </label>
        <p className="text-xs text-vtk-muted">
          Standaard uit: de uitleendienst rekent doorgaans enkel waarborg aan. Zet dit aan als je materiaal
          met een huurprijs aanbiedt.
        </p>

        <label className="mt-2 grid gap-1 text-xs font-medium text-vtk-muted sm:max-w-[14rem]">
          Last minute vanaf (dagen voor de afhaaldag)
          <input
            type="number"
            name="lastMinuteDays"
            min={1}
            max={90}
            defaultValue={lastMinuteDays}
            className={inputClass}
          />
        </label>
        <p className="text-xs text-vtk-muted">
          Aanvragen die binnen deze termijn afgehaald worden, krijgen de badge &quot;last minute&quot; in de
          aanvragenlijst. Het lid ziet de waarschuwing al bij het invullen, dus dit is ook wat je belooft:
          korter dan dit mag je weigeren.
        </p>

        <label className="mt-2 flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="checkbox"
            name="externalRequestsOpen"
            defaultChecked={externalRequestsOpen}
            className="h-4 w-4"
          />
          Externen mogen aanvragen indienen
        </label>
        <p className="text-xs text-vtk-muted">
          Staat dit uit, dan kan iemand die dit werkingsjaar bij geen enkele post of werkgroep hoort
          de catalogus en de voertuigen wel bekijken, maar niets indienen; hij krijgt in de plaats van
          het formulier het mailadres van Logistiek te zien. Posten en werkgroepen merken er niets van.
        </p>

        {/* M1: wie er gewaarschuwd wordt bij een nieuwe aanvraag. Per soort, want
            materiaal, flesserke en transport hebben elk een andere
            verantwoordelijke; één gedeelde mailbox betekent dat iedereen alles
            leest tot niemand nog iets leest. */}
        <div className="mt-4 grid gap-3 border-t border-vtk-navy/10 pt-4">
          <p className="text-sm font-semibold text-vtk-ink">Melding bij nieuwe aanvragen</p>
          {NOTIFY_KINDS.map((kind) => (
            <label key={kind} className="grid gap-1 text-xs font-medium text-vtk-muted">
              {NOTIFY_LABELS[kind].title}
              <input
                type="text"
                name={`notify-${kind}`}
                defaultValue={notifyEmails[kind].join(', ')}
                placeholder="logistiek@vtk.be, iemand@vtk.be"
                className={inputClass}
              />
              <span className="font-normal">
                {NOTIFY_LABELS[kind].hint}{' '}
                {notifyEmails[kind].length === 0 ? (
                  <span className="font-semibold text-vtk-danger">
                    Nu leeg: er vertrekt geen enkele melding voor deze soort.
                  </span>
                ) : null}
              </span>
            </label>
          ))}
          <p className="text-xs text-vtk-muted">
            Meerdere adressen mogen, gescheiden door een komma. De mail draagt per aanvraag een
            samenvatting plus de link ernaartoe, en een mailserver die er niet is, houdt een aanvraag
            nooit tegen.
          </p>
          {/* R4: zeggen dát er gewacht wordt. Wie dit niet weet, denkt bij het
              testen dat de melding stuk is omdat er na het indienen niets komt. */}
          <p className="text-xs text-vtk-muted">
            De meldingen worden <strong>gebundeld</strong>: hoogstens één mail per uur per soort, met
            alles wat er sinds de vorige binnenkwam. Vijf aanvragen na elkaar gaven anders vijf mails
            naar dezelfde mailbox. Een aanvraag die binnen 24 uur begint, wacht niet en vertrekt
            meteen.
          </p>
        </div>

        <TripHandoverField value={tripHandover} />
      </SaveForm>
    </section>
  );
}
