'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Label, Textarea } from '@vtk/ui';
import { ElixirIcon } from '@/components/elixir-icon';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';
import {
  deleteTakedownPhotoAction,
  keepTakedownPhotoAction,
  reopenTakedownAction,
} from '@/app/actions/takedown';

/**
 * Eén verzoek, met wat je ermee kan doen.
 *
 * De twee uitkomsten staan bewust naast elkaar: de foto weghalen, of het
 * verzoek afsluiten met een reden. Dat tweede is geen "negeren"-knop maar een
 * beslissing die je moet kunnen verantwoorden, dus de notitie is verplicht.
 */

const KEEP_ERRORS: Record<string, string> = {
  NOTE_REQUIRED: 'Schrijf op waarom de foto blijft staan.',
  REQUEST_MISSING: 'Dit verzoek bestaat niet meer; herlaad de pagina.',
};

export type TakedownRowData = {
  id: string;
  albumSlug: string;
  albumTitle: string;
  photoFilename: string;
  reporterName: string;
  reporterEmail: string;
  reasonLabel: string;
  message: string | null;
  createdAt: string;
  mailDelivered: boolean;
  status: 'NEW' | 'DELETED' | 'KEPT';
  handlingNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
};

export function TakedownRow({ request }: { request: TakedownRowData }) {
  const [keeping, setKeeping] = useState(false);
  const isOpen = request.status === 'NEW';

  return (
    <article className="fakbar-takedown-card" data-status={request.status}>
      <div className="fakbar-takedown-card-head">
        <div>
          <h4>{request.albumTitle}</h4>
          <p className="fakbar-takedown-file">{request.photoFilename}</p>
        </div>
        <div className="fakbar-takedown-tags">
          {request.status === 'DELETED' ? (
            <span className="fakbar-badge" data-tone="closed">Verwijderd</span>
          ) : null}
          {request.status === 'KEPT' ? <span className="fakbar-badge">Bewaard</span> : null}
          {/* Zonder mail weet de fakbar niet dat er iets binnenkwam; dat moet
              opvallen en niet stil in de tabel verdwijnen. */}
          {!request.mailDelivered ? (
            <span className="fakbar-badge" data-tone="warn" title="Er is geen meldingsmail vertrokken">
              Niet gemaild
            </span>
          ) : null}
        </div>
      </div>

      <dl className="fakbar-takedown-meta">
        <div>
          <dt>Melder</dt>
          <dd>
            {request.reporterName}{' '}
            <a href={`mailto:${request.reporterEmail}`}>{request.reporterEmail}</a>
          </dd>
        </div>
        <div>
          <dt>Reden</dt>
          <dd>{request.reasonLabel}</dd>
        </div>
        <div>
          <dt>Ontvangen</dt>
          <dd>{request.createdAt}</dd>
        </div>
        {request.handledAt ? (
          <div>
            <dt>Afgehandeld</dt>
            <dd>
              {request.handledAt}
              {request.handledBy ? ` door ${request.handledBy}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      {request.message ? <p className="fakbar-takedown-message">{request.message}</p> : null}
      {request.handlingNote ? (
        <p className="fakbar-takedown-message" data-kind="note">
          <strong>Notitie:</strong> {request.handlingNote}
        </p>
      ) : null}

      <div className="fakbar-takedown-actions">
        <Link href={`/fotos/${encodeURIComponent(request.albumSlug)}`} className="fakbar-btn fakbar-btn-ghost">
          <ElixirIcon name="photo" className="h-4 w-4" />
          Album bekijken
        </Link>

        {isOpen ? (
          <>
            <ConfirmActionButton
              label="Foto verwijderen"
              srLabel={`Foto verwijderen uit ${request.albumTitle}: ${request.photoFilename}`}
              confirmLabel="Verwijderen"
              variant="danger"
              destructive
              action={deleteTakedownPhotoAction.bind(null, request.id)}
              successMessage="De foto is uit de galerij gehaald."
              dialogTitle="Deze foto verwijderen?"
              dialogDescription={
                <>
                  <strong>{request.photoFilename}</strong> gaat naar de prullenmand van Immich en verdwijnt meteen uit
                  het album <strong>{request.albumTitle}</strong>. De rest van het album blijft staan. Immich ruimt de
                  prullenmand later zelf op.
                </>
              }
            />
            <button type="button" className="fakbar-btn fakbar-btn-ghost" onClick={() => setKeeping((value) => !value)}>
              <ElixirIcon name="edit" className="h-4 w-4" />
              {keeping ? 'Annuleren' : 'Bewaren met reden'}
            </button>
          </>
        ) : (
          <ConfirmActionButton
            label="Verzoek heropenen"
            srLabel={`Verzoek heropenen: ${request.photoFilename}`}
            confirm={false}
            action={reopenTakedownAction.bind(null, request.id)}
            successMessage="Het verzoek staat weer open."
          />
        )}
      </div>

      {isOpen && keeping ? (
        <SaveForm
          action={keepTakedownPhotoAction}
          submitLabel="Verzoek afsluiten"
          savingLabel="Bezig…"
          savedMessage="Het verzoek is afgesloten."
          errorMessages={KEEP_ERRORS}
          onSuccess={() => setKeeping(false)}
          className="fakbar-takedown-keep"
        >
          <input type="hidden" name="id" value={request.id} />
          <div>
            <Label htmlFor={`note-${request.id}`}>Waarom blijft deze foto staan?</Label>
            <Textarea id={`note-${request.id}`} name="note" rows={2} maxLength={1000} required />
          </div>
        </SaveForm>
      ) : null}
    </article>
  );
}
