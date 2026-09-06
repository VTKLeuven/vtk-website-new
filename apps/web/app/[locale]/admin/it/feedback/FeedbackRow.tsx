"use client";

import Image from "next/image";
import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { deleteFeedbackAction, updateFeedbackAction } from "@/app/actions/feedback";
import { FEEDBACK_LIMITS, type FeedbackStatus } from "@/lib/feedback";
import { storageKeyPath } from "@/lib/storageKeyPath";

/**
 * Eén melding, met de triage eronder.
 *
 * De vier statussen zitten in één keuzelijst en niet in vier knoppen: het is
 * één beslissing ("waar staat dit nu?"), en vier knoppen per kaart maakt van
 * een lijst van dertig meldingen een muur. De notitie staat ernaast, want ze
 * hoort bij diezelfde beslissing.
 *
 * Verwijderen is voor spam en dubbels en staat bewust apart, met een
 * bevestiging: het is de enige onomkeerbare actie hier.
 */

export type FeedbackRowLabels = {
  statusLabel: string;
  statusOptions: { value: FeedbackStatus; label: string }[];
  noteLabel: string;
  notePlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
  noteRequired: string;
  statusInvalid: string;
  feedbackMissing: string;
  reporter: string;
  anonymous: string;
  deletedAccount: string;
  page: string;
  browser: string;
  received: string;
  handledOn: string;
  by: string;
  note: string;
  screenshot: string;
  openScreenshot: string;
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  deleted: string;
  confirm: string;
  cancel: string;
  open: string;
};

export type FeedbackRowData = {
  id: string;
  kindLabel: string;
  statusLabel: string;
  status: FeedbackStatus;
  message: string;
  imageKey: string | null;
  path: string | null;
  userAgent: string | null;
  anonymous: boolean;
  authorName: string | null;
  createdAt: string;
  handlingNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
};

export function FeedbackRow({
  item,
  labels,
  pathHref,
}: {
  item: FeedbackRowData;
  labels: FeedbackRowLabels;
  /** Het pad uit de melding als link, of null wanneer er geen pad bij zat. */
  pathHref: string | null;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status);

  const errorMessages: Record<string, string> = {
    NOTE_REQUIRED: labels.noteRequired,
    STATUS_INVALID: labels.statusInvalid,
    FEEDBACK_MISSING: labels.feedbackMissing,
  };

  const shotUrl = item.imageKey ? `/api/media/${storageKeyPath(item.imageKey)}` : null;

  return (
    <article className="vtk-feedback-card" data-status={item.status}>
      <div className="vtk-feedback-card-head">
        <div className="vtk-feedback-tags">
          <span className="vtk-feedback-tag" data-tone="kind">
            {item.kindLabel}
          </span>
          <span className="vtk-feedback-tag" data-tone={item.status === "NEW" ? "open" : undefined}>
            {item.statusLabel}
          </span>
        </div>
        <DeleteIconButton
          label={labels.delete}
          srLabel={`${labels.delete}: ${item.kindLabel} — ${item.createdAt}`}
          action={deleteFeedbackAction}
          fields={{ id: item.id }}
          title={labels.deleteTitle}
          description={labels.deleteDescription}
          confirmLabel={labels.confirm}
          cancelLabel={labels.cancel}
          successMessage={labels.deleted}
        />
      </div>

      <p className="vtk-feedback-message">{item.message}</p>

      <dl className="vtk-feedback-meta">
        <div>
          <dt>{labels.reporter}</dt>
          <dd>
            {item.anonymous
              ? labels.anonymous
              : (item.authorName ?? labels.deletedAccount)}
          </dd>
        </div>
        <div>
          <dt>{labels.page}</dt>
          <dd>
            {pathHref ? (
              <a href={pathHref}>{item.path}</a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>{labels.received}</dt>
          <dd>{item.createdAt}</dd>
        </div>
        {item.handledAt ? (
          <div>
            <dt>{labels.handledOn}</dt>
            <dd>
              {item.handledAt}
              {item.handledBy ? ` ${labels.by} ${item.handledBy}` : ""}
            </dd>
          </div>
        ) : null}
        {item.userAgent ? (
          <div>
            <dt>{labels.browser}</dt>
            <dd>{item.userAgent}</dd>
          </div>
        ) : null}
      </dl>

      {shotUrl ? (
        <div className="vtk-feedback-shot-block">
          <span className="vtk-feedback-shot-caption">{labels.screenshot}</span>
          <a
            className="vtk-feedback-shot-link"
            href={shotUrl}
            target="_blank"
            rel="noreferrer noopener"
            title={labels.openScreenshot}
          >
            {/* `unoptimized`: de melder uploadde al een verkleinde PNG, en de
                optimalisatie zou de tekst op een schermafdruk weer uitsmeren. */}
            <Image src={shotUrl} alt={labels.screenshot} width={260} height={160} unoptimized />
          </a>
        </div>
      ) : null}

      {item.handlingNote ? (
        <p className="vtk-feedback-note">
          <strong>{labels.note}:</strong> {item.handlingNote}
        </p>
      ) : null}

      <SaveForm
        action={updateFeedbackAction}
        submitLabel={labels.save}
        savingLabel={labels.saving}
        savedMessage={labels.saved}
        errorMessages={errorMessages}
        fallbackErrorMessage={labels.failed}
        resetOnSuccess={false}
        className="vtk-feedback-triage"
      >
        <input type="hidden" name="id" value={item.id} />
        <label htmlFor={`status-${item.id}`}>
          <span>{labels.statusLabel}</span>
          <select
            id={`status-${item.id}`}
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
          >
            {labels.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`note-${item.id}`} className="vtk-feedback-note-field">
          <span>{labels.noteLabel}</span>
          <input
            id={`note-${item.id}`}
            name="note"
            defaultValue={item.handlingNote ?? ""}
            maxLength={FEEDBACK_LIMITS.note}
            placeholder={labels.notePlaceholder}
            // Afwijzen zonder reden is over een half jaar niet meer te
            // verantwoorden; de server weigert het ook.
            required={status === "DISMISSED"}
          />
        </label>
      </SaveForm>
    </article>
  );
}
