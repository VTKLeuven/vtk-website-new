'use client';

import {
  emptyEventValues,
  isWerkgroep,
  splitRequesterOptions,
  type EventReservationValues,
  type RequesterOption,
} from './event-values';

export { emptyEventValues };
export type { EventReservationValues, RequesterOption };

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/**
 * De groepen van het lid als keuzelijst. Posten en werkgroepen staan onder een
 * eigen kopje zodra het lid van beide iets heeft: een werkgroep is geen post, en
 * ze samen onder "post" zetten laat de keuzelijst iets anders beweren dan wat de
 * server ervan maakt (`deriveMemberRequester` leidt WERKGROEP wél correct af).
 * Heeft het lid maar één soort, dan is een kopje enkel ruis.
 */
function RequesterOptions({ groups, en }: { groups: RequesterOption[]; en: boolean }) {
  const { posten, werkgroepen } = splitRequesterOptions(groups);
  const options = (list: RequesterOption[]) =>
    list.map((group) => (
      <option key={group.id} value={group.id}>
        {group.name}
      </option>
    ));

  if (posten.length === 0 || werkgroepen.length === 0) return <>{options(groups)}</>;

  return (
    <>
      <optgroup label={en ? 'Posts' : 'Posten'}>{options(posten)}</optgroup>
      <optgroup label={en ? 'Work groups and year committees' : 'Werkgroepen en jaarwerkingen'}>
        {options(werkgroepen)}
      </optgroup>
    </>
  );
}

/** Gedeelde event- en aanvragervelden voor het aanmaken en bewerken van een aanvraag. */
export function EventRequesterFields({
  value,
  onChange,
  groups,
  locale,
  mode = 'member',
  linkedEventName = null,
}: {
  value: EventReservationValues;
  onChange: (next: EventReservationValues) => void;
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  /** 'member' leidt het aanvragertype automatisch af; 'team' laat het manueel kiezen. */
  mode?: 'member' | 'team';
  /**
   * Naam van het evenement waaraan deze aanvraag gekoppeld is. Dan is de naam
   * geen vraag meer maar een gegeven: het veld toont ze en je typt ze niet
   * opnieuw. Loskoppelen in de kiezer maakt het weer een gewoon veld.
   */
  linkedEventName?: string | null;
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
            {/* Enkel echte posten: een werkgroep hoort onder het WERKGROEP-type,
                niet als post op een interne aanvraag. */}
            <select value={value.groupId} onChange={(e) => set('groupId', e.target.value)} className={inputClass}>
              {splitRequesterOptions(groups).posten.map((group) => (
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
            <span className="font-medium text-vtk-ink">{en ? 'On behalf of' : 'Namens'}</span>
            <select
              value={value.groupId}
              onChange={(e) => {
                const chosen = groups.find((group) => group.id === e.target.value);
                onChange({
                  ...value,
                  groupId: e.target.value,
                  // Volg het type van de gekozen groep, zoals de server dat ook doet.
                  requesterType: chosen && isWerkgroep(chosen) ? 'WERKGROEP' : 'INTERN',
                });
              }}
              className={inputClass}
            >
              <RequesterOptions groups={groups} en={en} />
            </select>
          </label>
        ) : null}

        {linkedEventName ? (
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">
              {en ? 'Event / activity' : 'Evenement / activiteit'}
            </span>
            {/* Onderbroken rand en doffe vulling: dit vult zichzelf in, je kan er
                niet in typen. Loskoppelen doe je in de kiezer hieronder. */}
            <p className="flex h-10 items-center rounded-lg border border-dashed border-vtk-navy/20 bg-vtk-paper px-3 text-sm text-vtk-muted">
              {linkedEventName}
            </p>
            <span className="text-xs text-vtk-muted">
              {en
                ? 'Comes from the event you picked below.'
                : 'Volgt uit het evenement dat je hieronder koos.'}
            </span>
          </div>
        ) : (
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
        )}
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
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Contact phone' : 'Telefoon contactpersoon'}</span>
          <input
            type="tel"
            value={value.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
            className={inputClass}
          />
        </label>
        {/* Meelezend adres. Een aanvraag hoort bij een post of werkgroep, maar de
            mails komen bij één persoon toe; wie volgend jaar die post overneemt,
            vindt niets terug. Een mailbox van de werkgroep in kopie lost dat op. */}
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'Extra address to keep posted' : 'Extra adres dat op de hoogte blijft'}
          </span>
          {/* `multiple`: meerdere adressen mogen, gescheiden door een komma
              (T13). Zonder dat attribuut weigert de browser de tweede al voor
              de server ze ziet. */}
          <input
            type="email"
            multiple
            value={value.notifyEmail}
            onChange={(e) => set('notifyEmail', e.target.value)}
            placeholder="bv. logistiek.existenz@vtk.be, sarah@vtk.be"
            className={inputClass}
          />
          <span className="text-xs text-vtk-muted">
            {en
              ? 'Optional. Gets a copy of every mail about this request. Separate addresses with a comma.'
              : 'Optioneel. Krijgt elke mail over deze aanvraag in kopie. Splits meerdere adressen met een komma.'}
          </span>
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
