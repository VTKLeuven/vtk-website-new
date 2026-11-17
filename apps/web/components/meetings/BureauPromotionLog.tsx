'use client';

import { useState } from 'react';
import { Input, Label, Select } from '@vtk/ui';
import { SaveForm } from '@/components/ui/SaveForm';
import { DeleteIconButton } from '@/components/ui/DeleteIconButton';
import { addMeetingPromotionAction, deleteMeetingPromotionAction } from '@/app/actions/meetings';
import { OTHER_SOURCE } from '@/components/ticketing/admin/useSourceLink';

export type PromotionView = {
  id: string;
  /** Het nummer op de lijn; null wanneer het moment er niet op staat (na nu). */
  number: number | null;
  atLabel: string;
  label: string;
  /** "Mail · week-3", of null zonder kanaal. */
  linkLabel: string | null;
};

/**
 * Het logboek van reclamemomenten van één bureau: wanneer een mail vertrok of
 * een story online kwam. De nummers zijn die van de gestippelde lijnen in de
 * grafiek erboven. Zelf ingevuld, want die momenten gebeuren buiten de site.
 */
export function BureauPromotionLog({
  nl,
  meetingId,
  items,
  sources,
  defaultAt,
}: {
  nl: boolean;
  meetingId: string;
  items: PromotionView[];
  /** De kanalen voor de keuzelijst, met hun naam, van de server. */
  sources: { key: string; label: string }[];
  /** Nu, als `YYYY-MM-DDTHH:mm` op de Brusselse klok. */
  defaultAt: string;
}) {
  const [source, setSource] = useState('');
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-vtk-ink">{nl ? 'Reclamemomenten' : 'Promotion moments'}</h3>
        <p className="text-xs text-[#5c667f]">
          {nl
            ? 'Wanneer je een mail stuurde of iets postte. Ze staan als genummerde lijn op het totaal hierboven, zodat je ziet wat erna gebeurde.'
            : 'When you sent an email or posted something. They appear as numbered lines on the total above, so you can see what happened next.'}
        </p>
      </div>

      {items.length > 0 ? (
        <ol className="divide-y divide-vtk-blue/10 border-y border-vtk-blue/10 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-vtk-navy px-1.5 text-[11px] font-semibold tabular-nums text-white"
                aria-label={item.number === null ? undefined : `${nl ? 'Lijn' : 'Line'} ${item.number}`}
              >
                {item.number ?? '–'}
              </span>
              <span className="w-36 shrink-0 tabular-nums text-[#5c667f]">{item.atLabel}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-vtk-ink">{item.label}</span>
                {item.linkLabel ? <span className="text-[#5c667f]"> · {item.linkLabel}</span> : null}
              </span>
              <DeleteIconButton
                action={deleteMeetingPromotionAction}
                fields={{ promotionId: item.id }}
                label={nl ? 'Verwijderen' : 'Delete'}
                srLabel={`${nl ? 'Verwijderen' : 'Delete'}: ${item.label}`}
                title={nl ? 'Reclamemoment verwijderen' : 'Delete promotion moment'}
                description={
                  nl
                    ? `"${item.label}" (${item.atLabel}) verdwijnt uit het logboek en van de grafiek. De inschrijvingen zelf en hun herkomst blijven staan.`
                    : `"${item.label}" (${item.atLabel}) is removed from the log and the chart. The registrations and their sources stay.`
                }
                confirmLabel={nl ? 'Verwijderen' : 'Delete'}
                cancelLabel={nl ? 'Annuleren' : 'Cancel'}
                successMessage={nl ? 'Reclamemoment verwijderd' : 'Promotion moment deleted'}
                errorFallback={nl ? 'Verwijderen mislukt.' : 'Deleting failed.'}
              />
            </li>
          ))}
        </ol>
      ) : null}

      <SaveForm
        action={addMeetingPromotionAction}
        className="grid gap-3 sm:grid-cols-2"
        submitLabel={nl ? 'Moment toevoegen' : 'Add moment'}
        savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
        savedMessage={nl ? 'Reclamemoment toegevoegd' : 'Promotion moment added'}
        errorMessages={
          nl
            ? {
                INVALID_DATE: 'Vul een geldige datum en een uur in.',
                LABEL_REQUIRED: 'Zeg kort wat er gebeurde, bv. "Mail naar bureau".',
                LABEL_TOO_LONG: 'Hou de omschrijving onder 120 tekens.',
                NOT_FOUND: 'Dit bureau bestaat niet meer.',
                DATE_OUT_OF_RANGE:
                  'Die datum ligt te ver van het bureau: een moment valt ten vroegste 60 dagen ervoor en ten laatste op de dag zelf. Kijk het jaartal na.',
              }
            : {
                INVALID_DATE: 'Enter a valid date and time.',
                LABEL_REQUIRED: 'Say briefly what happened, e.g. "Email to bureau".',
                LABEL_TOO_LONG: 'Keep the description under 120 characters.',
                NOT_FOUND: 'This bureau no longer exists.',
                DATE_OUT_OF_RANGE:
                  'That date is too far from the bureau: a moment falls at most 60 days before it and at the latest on the day itself. Check the year.',
              }
        }
        fallbackErrorMessage={nl ? 'Opslaan van het reclamemoment mislukt.' : 'Saving the promotion moment failed.'}
      >
        <input type="hidden" name="meetingId" value={meetingId} />
        <div>
          <Label htmlFor={`promotion-at-${meetingId}`}>{nl ? 'Wanneer' : 'When'}</Label>
          <Input id={`promotion-at-${meetingId}`} name="at" type="datetime-local" defaultValue={defaultAt} required />
        </div>
        <div>
          <Label htmlFor={`promotion-label-${meetingId}`}>{nl ? 'Wat' : 'What'}</Label>
          <Input
            id={`promotion-label-${meetingId}`}
            name="label"
            required
            maxLength={120}
            placeholder={nl ? 'bv. Mail naar bureau' : 'e.g. Email to bureau'}
          />
        </div>
        <div>
          <Label htmlFor={`promotion-source-${meetingId}`}>{nl ? 'Kanaal (optioneel)' : 'Channel (optional)'}</Label>
          <Select
            id={`promotion-source-${meetingId}`}
            name="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">{nl ? 'Geen' : 'None'}</option>
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
            <option value={OTHER_SOURCE}>{nl ? 'Iets anders...' : 'Something else...'}</option>
          </Select>
        </div>
        {source === OTHER_SOURCE ? (
          <div>
            <Label htmlFor={`promotion-custom-${meetingId}`}>{nl ? 'Naam van het kanaal' : 'Channel name'}</Label>
            <Input
              id={`promotion-custom-${meetingId}`}
              name="sourceCustom"
              maxLength={40}
              placeholder={nl ? 'bv. toledo' : 'e.g. toledo'}
            />
          </div>
        ) : null}
        <div>
          <Label htmlFor={`promotion-campaign-${meetingId}`}>
            {nl ? 'Naam van de link (optioneel)' : 'Link name (optional)'}
          </Label>
          <Input
            id={`promotion-campaign-${meetingId}`}
            name="sourceCampaign"
            maxLength={40}
            placeholder={nl ? 'bv. week-3' : 'e.g. week-3'}
          />
        </div>
      </SaveForm>
    </div>
  );
}
