'use client';

import {
  emptyEventValues,
  type EventReservationValues,
  type RequesterOption,
} from './event-values';

export { emptyEventValues };
export type { EventReservationValues, RequesterOption };

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/** Gedeelde event- en aanvragervelden voor het aanmaken en bewerken van een aanvraag. */
export function EventRequesterFields({
  value,
  onChange,
  groups,
  locale,
  mode = 'member',
}: {
  value: EventReservationValues;
  onChange: (next: EventReservationValues) => void;
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  /** 'member' leidt het aanvragertype automatisch af; 'team' laat het manueel kiezen. */
  mode?: 'member' | 'team';
}) {
  const en = locale === 'en';
  const set = <K extends keyof EventReservationValues>(key: K, v: EventReservationValues[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        {en ? 'About your activity' : 'Over je activiteit'}
      </h2>
      <p className="mt-1 text-sm text-vtk-muted">
        {en
          ? 'Logistics handles requests per event and gives VTK events priority, so tell us the essentials.'
          : 'Logistiek behandelt aanvragen per evenement en geeft VTK-evenementen voorrang, dus vertel ons het essentiële.'}
      </p>

      {mode === 'team' ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-vtk-ink">{en ? 'Requesting as' : 'Aanvrager'}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['INTERN', en ? 'A post' : 'Een post'],
                ['WERKGROEP', en ? 'A work group' : 'Een werkgroep'],
                ['EXTERN', en ? 'External' : 'Extern'],
              ] as const
            ).map(([type, label]) => (
              <label
                key={type}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  value.requesterType === type
                    ? 'border-vtk-navy bg-vtk-navy text-white'
                    : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
                }`}
              >
                <input
                  type="radio"
                  name="requesterType"
                  value={type}
                  checked={value.requesterType === type}
                  onChange={() => set('requesterType', type)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Team-modus: volledige post/naam-keuze. Member-modus: enkel een
            post-keuze wanneer het lid meerdere posten heeft (anders automatisch). */}
        {mode === 'team' && value.requesterType === 'INTERN' ? (
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">Post</span>
            <select value={value.groupId} onChange={(e) => set('groupId', e.target.value)} className={inputClass}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === 'team' && value.requesterType !== 'INTERN' ? (
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">
              {value.requesterType === 'WERKGROEP'
                ? en
                  ? 'Work group or year committee'
                  : 'Werkgroep of jaarwerking'
                : en
                  ? 'Requester name'
                  : 'Naam aanvrager'}
            </span>
            <input
              type="text"
              value={value.requesterName}
              onChange={(e) => set('requesterName', e.target.value)}
              className={inputClass}
            />
          </label>
        ) : null}
        {mode === 'member' && groups.length > 1 ? (
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">{en ? 'On behalf of which post?' : 'Namens welke post?'}</span>
            <select value={value.groupId} onChange={(e) => set('groupId', e.target.value)} className={inputClass}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'Event / activity' : 'Evenement / activiteit'}</span>
          <input
            type="text"
            value={value.eventName}
            onChange={(e) => set('eventName', e.target.value)}
            placeholder={en ? 'E.g. 24-hour run' : 'Bv. 24 urenloop'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Location' : 'Locatie'}</span>
          <input
            type="text"
            value={value.eventLocation}
            onChange={(e) => set('eventLocation', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Event start' : 'Startuur evenement'}</span>
          <input
            type="datetime-local"
            value={value.eventStart}
            onChange={(e) => set('eventStart', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Expected attendance' : 'Verwachte opkomst'}</span>
          <input
            type="number"
            min={0}
            value={value.expectedAttendance}
            onChange={(e) => set('expectedAttendance', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Contact person' : 'Contactpersoon'}</span>
          <input
            type="text"
            value={value.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'Contact phone' : 'Telefoon contactpersoon'}</span>
          <input
            type="tel"
            value={value.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={value.delivery}
            onChange={(e) => set('delivery', e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium text-vtk-ink">{en ? 'Delivery needed' : 'Levering nodig'}</span>
        </label>
        {value.delivery ? (
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">{en ? 'Delivery details' : 'Leveringsdetails'}</span>
            <input
              type="text"
              value={value.deliveryNote}
              onChange={(e) => set('deliveryNote', e.target.value)}
              placeholder={en ? 'E.g. address, time window' : 'Bv. adres, tijdvenster'}
              className={inputClass}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
