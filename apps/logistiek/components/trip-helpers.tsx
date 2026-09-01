'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { addTripHelperAction, removeTripHelperAction } from '@/app/actions/uitleen';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { PhoneLink } from '@/components/phone-link';
import { useToast } from '@/components/ui/toast';

/**
 * De bijrijders van een rit (V2): wie er meerijdt en op welk nummer.
 *
 * Ook ná het aanvragen te wijzigen, en niet alleen door de aanvrager: iemand van
 * Sport vraagt de rit aan, en wie er effectief meerijdt is pas de dag voordien
 * bekend, vaak bij iemand anders van dezelfde post. Dat is precies waarom dit
 * bestaat.
 *
 * Het nummer mag leeg blijven: soms weet je wel wie meegaat en nog niet zijn
 * gsm. Half ingevuld is beter dan niets ingevuld, want de chauffeur weet dan
 * tenminste op wie hij staat te wachten.
 */

export type TripHelper = { id: string; name: string; phone: string | null };

export function TripHelpers({
  bookingId,
  helpers,
  legacyNote,
  canEdit,
  locale = 'nl',
}: {
  bookingId: string;
  helpers: TripHelper[];
  /** De vrije tekst van vóór V2, indien die er nog staat. */
  legacyNote?: string | null;
  canEdit: boolean;
  locale?: 'nl' | 'en';
}) {
  const en = locale === 'en';
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '' });

  function add() {
    startTransition(async () => {
      const result = await addTripHelperAction(bookingId, draft);
      if (result.ok) {
        showToast({ message: result.message ?? 'Toegevoegd.', variant: 'success' });
        setDraft({ name: '', phone: '' });
        setOpen(false);
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
        {en ? 'Passengers' : 'Bijrijders'}
      </p>

      {helpers.length === 0 && !legacyNote ? (
        <p className="text-sm text-vtk-muted">
          {en ? 'Nobody yet.' : 'Nog niemand.'}
          {canEdit
            ? en
              ? ' You can add them later too.'
              : ' Je kan ze ook later nog toevoegen.'
            : ''}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {helpers.map((helper) => (
            <li key={helper.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-vtk-ink">{helper.name}</span>
              {helper.phone ? (
                <PhoneLink number={helper.phone} />
              ) : (
                <span className="text-xs text-vtk-muted">
                  {en ? 'no number' : 'geen nummer'}
                </span>
              )}
              {canEdit ? (
                <ConfirmActionButton
                  label={`${en ? 'Remove' : 'Weghalen'}: ${helper.name}`}
                  confirmLabel={en ? 'Remove' : 'Weghalen'}
                  icon={<LogisticsIcon name="close" className="h-3.5 w-3.5" />}
                  action={removeTripHelperAction.bind(null, helper.id)}
                  successMessage={en ? 'Removed.' : 'Bijrijder weggehaald.'}
                  destructive
                  dialogTitle={en ? 'Remove passenger?' : 'Bijrijder weghalen?'}
                  dialogDescription={
                    en
                      ? `${helper.name} disappears from the trip; the driver will not see the name or number any more. The trip itself does not change.`
                      : `${helper.name} verdwijnt van de rit; de chauffeur ziet de naam en het nummer dan niet meer. Aan de rit zelf verandert er niets.`
                  }
                />
              ) : null}
            </li>
          ))}
          {/* De vrije tekst van vóór V2 blijft leesbaar staan: ze kan "twee
              helpers van onze werkgroep" zeggen, en dat is informatie die de
              chauffeur onderweg gebruikt. */}
          {legacyNote ? (
            <li className="text-sm italic text-vtk-body">{legacyNote}</li>
          ) : null}
        </ul>
      )}

      {canEdit ? (
        open ? (
          <div className="grid gap-2 rounded-[12px] border border-dashed border-vtk-navy/25 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1 text-xs font-medium text-vtk-muted">
              {en ? 'Name' : 'Naam'}
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-vtk-muted">
              {en ? 'Phone (optional)' : 'Telefoon (optioneel)'}
              <input
                type="tel"
                value={draft.phone}
                onChange={(event) => setDraft((c) => ({ ...c, phone: event.target.value }))}
                placeholder="+32 4.."
                className={inputClass}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={add}
                disabled={pending || !draft.name.trim()}
              >
                {pending ? (en ? 'Adding...' : 'Toevoegen...') : en ? 'Add' : 'Toevoegen'}
              </Button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-vtk-muted underline underline-offset-4"
              >
                {en ? 'Cancel' : 'Annuleren'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="justify-self-start rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            {en ? '+ Add passenger' : '+ Bijrijder toevoegen'}
          </button>
        )
      ) : null}
    </div>
  );
}
