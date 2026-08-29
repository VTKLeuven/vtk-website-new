"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import {
  deleteTakedownPhotoAction,
  keepTakedownPhotoAction,
  reopenTakedownAction,
} from "@/app/actions/takedown";

/**
 * Eén verzoek, met wat je ermee kan doen.
 *
 * De twee uitkomsten staan bewust naast elkaar: de foto weghalen, of het
 * verzoek afsluiten met een reden. Dat tweede is geen "negeren"-knop maar een
 * beslissing die je moet kunnen verantwoorden, dus de notitie is verplicht.
 *
 * Verwijderen gaat door een bevestigingsdialoog die zegt wát er weg gaat: deze
 * ene foto, niet het album (zie CLAUDE.md > UX-conventies).
 */

export type TakedownRowLabels = {
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  photoDeleted: string;
  confirm: string;
  cancel: string;
  keep: string;
  keepNote: string;
  keepSubmit: string;
  reopen: string;
  viewAlbum: string;
  reporter: string;
  reason: string;
  received: string;
  handledOn: string;
  by: string;
  note: string;
  notMailed: string;
  notMailedTitle: string;
  deleted: string;
  kept: string;
  saving: string;
  saved: string;
  failed: string;
  noteRequired: string;
  requestMissing: string;
  immichUnreachable: string;
};

export type TakedownRowData = {
  id: string;
  albumTitle: string;
  photoFilename: string;
  reporterName: string;
  reporterEmail: string;
  reasonLabel: string;
  message: string | null;
  createdAt: string;
  mailDelivered: boolean;
  status: "NEW" | "DELETED" | "KEPT";
  handlingNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
};

export function TakedownRow({
  request,
  labels,
  albumHref,
}: {
  request: TakedownRowData;
  labels: TakedownRowLabels;
  albumHref: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const isOpen = request.status === "NEW";

  const errorMessages: Record<string, string> = {
    NOTE_REQUIRED: labels.noteRequired,
    REQUEST_MISSING: labels.requestMissing,
    IMMICH_UNREACHABLE: labels.immichUnreachable,
  };

  function runDelete() {
    const form = new FormData();
    form.append("id", request.id);
    startTransition(async () => {
      const result = await deleteTakedownPhotoAction({ status: "idle" }, form);
      setConfirming(false);
      if (result.status === "error") {
        // Fout-toasts blijven staan tot de gebruiker ze wegklikt (CLAUDE.md).
        showToast({
          message: errorMessages[result.code] ?? labels.failed,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: labels.photoDeleted, variant: "success" });
    });
  }

  return (
    <article className="vtk-takedown-card" data-status={request.status}>
      <div className="vtk-takedown-card-head">
        <div>
          <h3>{request.albumTitle}</h3>
          <p className="vtk-takedown-file">{request.photoFilename}</p>
        </div>
        <div className="vtk-takedown-tags">
          {request.status === "DELETED" ? (
            <span className="vtk-takedown-tag" data-tone="done">
              {labels.deleted}
            </span>
          ) : null}
          {request.status === "KEPT" ? <span className="vtk-takedown-tag">{labels.kept}</span> : null}
          {/* Zonder mail weet de post niet dat er iets binnenkwam; dat moet
              opvallen en niet stil in de lijst verdwijnen. */}
          {!request.mailDelivered ? (
            <span className="vtk-takedown-tag" data-tone="warn" title={labels.notMailedTitle}>
              {labels.notMailed}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="vtk-takedown-meta">
        <div>
          <dt>{labels.reporter}</dt>
          <dd>
            {request.reporterName} <a href={`mailto:${request.reporterEmail}`}>{request.reporterEmail}</a>
          </dd>
        </div>
        <div>
          <dt>{labels.reason}</dt>
          <dd>{request.reasonLabel}</dd>
        </div>
        <div>
          <dt>{labels.received}</dt>
          <dd>{request.createdAt}</dd>
        </div>
        {request.handledAt ? (
          <div>
            <dt>{labels.handledOn}</dt>
            <dd>
              {request.handledAt}
              {request.handledBy ? ` ${labels.by} ${request.handledBy}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      {request.message ? <p className="vtk-takedown-message">{request.message}</p> : null}
      {request.handlingNote ? (
        <p className="vtk-takedown-message" data-kind="note">
          <strong>{labels.note}:</strong> {request.handlingNote}
        </p>
      ) : null}

      <div className="vtk-takedown-actions">
        <Link href={albumHref} className="vtk-button vtk-button-ghost">
          {labels.viewAlbum}
        </Link>

        {isOpen ? (
          <>
            <button type="button" className="vtk-button vtk-button-danger" onClick={() => setConfirming(true)}>
              {labels.delete}
            </button>
            <button type="button" className="vtk-button vtk-button-ghost" onClick={() => setKeeping((v) => !v)}>
              {keeping ? labels.cancel : labels.keep}
            </button>
          </>
        ) : (
          <SaveForm
            action={reopenTakedownAction}
            submitLabel={labels.reopen}
            savingLabel={labels.saving}
            savedMessage={labels.saved}
            errorMessages={errorMessages}
            fallbackErrorMessage={labels.failed}
            className="vtk-takedown-inline-form"
          >
            <input type="hidden" name="id" value={request.id} />
          </SaveForm>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={labels.deleteTitle}
        description={labels.deleteDescription
          .replace("{photo}", request.photoFilename)
          .replace("{album}", request.albumTitle)}
        confirmLabel={labels.confirm}
        cancelLabel={labels.cancel}
        pending={pending}
        onConfirm={runDelete}
        onCancel={() => setConfirming(false)}
      />

      {isOpen && keeping ? (
        <SaveForm
          action={keepTakedownPhotoAction}
          submitLabel={labels.keepSubmit}
          savingLabel={labels.saving}
          savedMessage={labels.saved}
          errorMessages={errorMessages}
          fallbackErrorMessage={labels.failed}
          onSuccess={() => setKeeping(false)}
          className="vtk-takedown-keep"
        >
          <input type="hidden" name="id" value={request.id} />
          <label htmlFor={`note-${request.id}`}>
            <span>{labels.keepNote}</span>
            <textarea id={`note-${request.id}`} name="note" rows={2} maxLength={1000} required />
          </label>
        </SaveForm>
      ) : null}
    </article>
  );
}
