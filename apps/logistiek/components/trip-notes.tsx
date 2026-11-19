'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { addTripNoteAction, editTripNoteAction, removeTripNoteAction } from '@/app/actions/uitleen';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LinkedText } from '@/components/linked-text';
import { LogisticsIcon } from '@/components/logistics-icon';
import { Avatar } from '@/components/person-avatar';
import { useToast } from '@/components/ui/toast';
import { TRIP_NOTE_VISIBILITIES } from '@/lib/uitleen';
import type { UitleenTransportNoteVisibility } from '@prisma/client';

/**
 * Eigen nota's bij een rit, met een zichtbaarheid per nota (F4.20).
 *
 * Naast de twee notavelden die al op een rit staan: `memberNote` is wat de
 * aanvrager bij het aanvragen schreef, `adminNote` is de boodschap van Logistiek
 * die meegaat in de mail. Die twee horen bij de rit zelf en staan er één keer
 * op. Dit zijn de notities van de mensen eromheen, elk met een auteur.
 *
 * **De zichtbaarheid staat als drie keuzes in beeld en niet in een keuzelijst.**
 * Wat je hier kiest, bepaalt wie het leest, en dat is niets om achter een
 * dichtgeklapt menu te zetten. Bij "enkel voor mij" staat er uitdrukkelijk bij
 * dat ook Logistiek niet meeleest: een nota waarvan je dénkt dat het team ze
 * leest, is erger dan geen nota.
 *
 * **Wijzigen en wissen doet enkel de auteur**, ook een beheerder niet. Het heet
 * een eigen nota; een privénota die iemand anders kan bewerken is er geen. De
 * acties hercontroleren dat, want een knop verbergen is geen poort.
 */

export type TripNoteView = {
  id: string;
  text: string;
  visibility: UitleenTransportNoteVisibility;
  authorName: string;
  mine: boolean;
};

const LABELS: Record<UitleenTransportNoteVisibility, { nl: string; en: string }> = {
  PRIVE: { nl: 'Enkel voor mij', en: 'Only for me' },
  POST: { nl: 'Mijn post', en: 'My post' },
  POST_EN_LOGISTIEK: { nl: 'Mijn post en Logistiek', en: 'My post and Logistics' },
};

/** Wat die keuze concreet betekent; het label alleen is te kort om op te vertrouwen. */
const HINTS: Record<UitleenTransportNoteVisibility, { nl: string; en: string }> = {
  PRIVE: {
    nl: 'Niemand anders leest dit, ook Logistiek niet.',
    en: 'Nobody else reads this, not even Logistics.',
  },
  POST: {
    nl: 'Iedereen die deze rit ziet: de aanvrager, de chauffeur en de post erachter.',
    en: 'Everyone who sees this trip: the requester, the driver and the post behind it.',
  },
  POST_EN_LOGISTIEK: {
    nl: 'Die mensen, plus het team van Logistiek.',
    en: 'Those people, plus the Logistics team.',
  },
};

/** Het merkje op een nota die er al staat. Kort: het staat naast een naam. */
const CHIPS: Record<UitleenTransportNoteVisibility, { nl: string; en: string }> = {
  PRIVE: { nl: 'enkel voor jou', en: 'only for you' },
  POST: { nl: 'post', en: 'post' },
  POST_EN_LOGISTIEK: { nl: 'post en Logistiek', en: 'post and Logistics' },
};

const DEFAULT_VISIBILITY: UitleenTransportNoteVisibility = 'POST_EN_LOGISTIEK';

export function TripNotes({
  bookingId,
  notes,
  canWrite,
  locale = 'nl',
  variant = 'list',
}: {
  bookingId: string;
  /** Al gefilterd op wat deze persoon mag lezen; zie `tripNotesFor`. */
  notes: TripNoteView[];
  canWrite: boolean;
  locale?: 'nl' | 'en';
  /**
   * `thread`: als ballonnen met een rondje per auteur, onder de nota van
   * Logistiek op "Mijn ritten" (`app/ritten/ritten.css`). Zonder eigen kop en
   * zonder lege-staat-zin: dat blok heeft er al een.
   */
  variant?: 'list' | 'thread';
}) {
  const thread = variant === 'thread';
  const en = locale === 'en';
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  /** `null` is dicht, `'nieuw'` is het formulier voor een nieuwe, anders een id. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    text: string;
    visibility: UitleenTransportNoteVisibility;
  }>({ text: '', visibility: DEFAULT_VISIBILITY });

  function open(note: TripNoteView | null) {
    setEditing(note ? note.id : 'nieuw');
    setDraft(note ? { text: note.text, visibility: note.visibility } : { text: '', visibility: DEFAULT_VISIBILITY });
  }

  function save() {
    startTransition(async () => {
      const result =
        editing === 'nieuw'
          ? await addTripNoteAction(bookingId, draft)
          : await editTripNoteAction(editing as string, draft);
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
        setEditing(null);
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const form = (
    <div className="grid gap-2 rounded-[12px] border border-dashed border-vtk-navy/25 p-3">
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        {en ? 'Note' : 'Nota'}
        <textarea
          rows={3}
          value={draft.text}
          onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
          maxLength={1000}
          placeholder={
            en
              ? 'e.g. the gate at the back is locked, ring at number 12'
              : 'bv. de poort achteraan zit op slot, bellen aan nummer 12'
          }
          className="w-full rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 py-2 text-sm text-vtk-ink placeholder:text-vtk-muted"
          autoFocus
        />
      </label>

      {/* De drie keuzes onder elkaar en niet naast elkaar: dit leeft in een
          kaartje van 352px en in een zijbalk, en drie knoppen naast elkaar
          worden daar drie afgekapte woorden. */}
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-xs font-medium text-vtk-muted">
          {en ? 'Who may read this?' : 'Wie mag dit lezen?'}
        </legend>
        {TRIP_NOTE_VISIBILITIES.map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm text-vtk-ink">
            <input
              type="radio"
              name={`zichtbaarheid-${bookingId}`}
              checked={draft.visibility === value}
              onChange={() => setDraft((current) => ({ ...current, visibility: value }))}
              className="mt-1 shrink-0"
            />
            <span className="min-w-0">
              <span className="font-medium">{en ? LABELS[value].en : LABELS[value].nl}</span>
              <br />
              <span className="text-xs text-vtk-muted">{en ? HINTS[value].en : HINTS[value].nl}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !draft.text.trim()}>
          {pending ? (en ? 'Saving...' : 'Opslaan...') : en ? 'Save' : 'Opslaan'}
        </Button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="text-sm font-medium text-vtk-muted underline underline-offset-4"
        >
          {en ? 'Cancel' : 'Annuleren'}
        </button>
      </div>
    </div>
  );

  function noteActions(note: TripNoteView, buttonClass: string) {
    return (
      <>
        <button type="button" onClick={() => open(note)} className={buttonClass}>
          {en ? 'Edit' : 'Wijzigen'}
        </button>
        <ConfirmActionButton
          label={`${en ? 'Remove note' : 'Nota weghalen'}`}
          confirmLabel={en ? 'Remove' : 'Weghalen'}
          icon={<LogisticsIcon name="close" className="h-3.5 w-3.5" />}
          action={removeTripNoteAction.bind(null, note.id)}
          successMessage={en ? 'Removed.' : 'Nota weggehaald.'}
          destructive
          dialogTitle={en ? 'Remove note?' : 'Nota weghalen?'}
          dialogDescription={
            en
              ? 'Your note disappears from this trip. The trip itself does not change.'
              : 'Je nota verdwijnt van deze rit. Aan de rit zelf verandert er niets.'
          }
        />
      </>
    );
  }

  if (thread) {
    return (
      <>
        {notes.length > 0 ? (
          <ul className="trips-thread">
            {notes.map((note) =>
              editing === note.id ? (
                <li key={note.id}>{form}</li>
              ) : (
                <li key={note.id} className="trips-bubble">
                  {note.mine ? <Avatar me en={en} size="small" /> : <Avatar name={note.authorName} size="small" />}
                  <div className="trips-bubble-text">
                    <span className="trips-bubble-meta">
                      {note.mine ? (en ? 'You' : 'Jij') : note.authorName}
                      <span className="trips-visibility" title={en ? 'Who may read this' : 'Wie dit mag lezen'}>
                        <LogisticsIcon name="show" className="h-3 w-3" strokeWidth={2.2} />
                        {en ? CHIPS[note.visibility].en : CHIPS[note.visibility].nl}
                      </span>
                      {note.mine ? noteActions(note, 'trips-text-button') : null}
                    </span>
                    <LinkedText text={note.text} locale={locale} />
                  </div>
                </li>
              )
            )}
          </ul>
        ) : null}
        {editing === 'nieuw' ? form : null}
        {canWrite && editing === null ? (
          <button type="button" onClick={() => open(null)} className="trips-add">
            {en ? '+ Note' : '+ Nota'}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">{en ? 'Notes' : "Nota's"}</p>

      {notes.length === 0 && editing === null ? (
        <p className="text-sm text-vtk-muted">
          {canWrite
            ? en
              ? 'Nothing yet. A note here is yours: you choose who reads it.'
              : 'Nog niets. Een nota hier is van jou: jij kiest wie ze leest.'
            : en
              ? 'Nothing yet.'
              : 'Nog niets.'}
        </p>
      ) : null}

      {notes.length > 0 ? (
        <ul className="grid gap-2">
          {notes.map((note) =>
            editing === note.id ? (
              <li key={note.id}>{form}</li>
            ) : (
              <li key={note.id} className="rounded-lg bg-vtk-paper px-3 py-2 text-sm text-vtk-body">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-vtk-ink">
                    {note.mine ? (en ? 'You' : 'Jij') : note.authorName}
                  </span>
                  <span className="rounded-full bg-vtk-navy/8 px-2 py-0.5 text-[10px] font-semibold text-vtk-navy">
                    {en ? CHIPS[note.visibility].en : CHIPS[note.visibility].nl}
                  </span>
                  {note.mine
                    ? noteActions(note, 'text-xs font-medium text-vtk-muted underline underline-offset-4')
                    : null}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  <LinkedText text={note.text} locale={locale} />
                </p>
              </li>
            )
          )}
        </ul>
      ) : null}

      {editing === 'nieuw' ? form : null}

      {canWrite && editing === null ? (
        <button
          type="button"
          onClick={() => open(null)}
          className="justify-self-start rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
        >
          {en ? '+ Add note' : '+ Nota toevoegen'}
        </button>
      ) : null}
    </div>
  );
}
