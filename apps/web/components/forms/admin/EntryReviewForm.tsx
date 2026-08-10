"use client";

import { ClipboardCheck } from "lucide-react";
import { saveEntryReviewAction } from "@/app/actions/formEntries";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AdminLocale } from "./format";

/**
 * Opvolging van één inzending: status, interne notitie en beoordelaar. Bedoeld
 * voor sollicitatie- en aanvraagformulieren, waar "ingediend" niet hetzelfde is
 * als "afgehandeld".
 */
export function EntryReviewForm({
  locale,
  formId,
  entryId,
  reviewStatus,
  internalNote,
  reviewerEmail,
}: {
  locale: AdminLocale;
  formId: string;
  entryId: string;
  reviewStatus: string;
  internalNote: string | null;
  reviewerEmail: string;
}) {
  const nl = locale === "nl";

  return (
    <section className="ticket-admin-section" aria-labelledby="review-heading">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon">
            <ClipboardCheck aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 id="review-heading">{nl ? "Opvolging" : "Follow-up"}</h2>
            <p>
              {nl
                ? "Enkel zichtbaar voor wie dit formulier beheert."
                : "Only visible to people who manage this form."}
            </p>
          </div>
        </div>
      </div>

      <SaveForm
        action={saveEntryReviewAction}
        className="ticket-admin-form"
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
        savedMessage={nl ? "Opvolging opgeslagen" : "Follow-up saved"}
        fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Saving failed."}
        errorMessages={{
          REVIEWER_NOT_FOUND: nl
            ? "Geen lid gevonden met dat e-mailadres."
            : "No member found with that e-mail address.",
          ENTRY_NOT_FOUND: nl
            ? "Deze inzending bestaat niet meer."
            : "This entry no longer exists.",
        }}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="formId" value={formId} />
        <input type="hidden" name="entryId" value={entryId} />

        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="review-status">{nl ? "Status" : "Status"}</label>
            <select id="review-status" name="reviewStatus" defaultValue={reviewStatus}>
              <option value="NEW">{nl ? "Nieuw" : "New"}</option>
              <option value="ACCEPTED">{nl ? "Geaccepteerd" : "Accepted"}</option>
              <option value="REJECTED">{nl ? "Geweigerd" : "Rejected"}</option>
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="review-reviewer">{nl ? "Beoordelaar" : "Reviewer"}</label>
            <input
              id="review-reviewer"
              name="reviewerEmail"
              type="email"
              defaultValue={reviewerEmail}
              placeholder={nl ? "E-mail van een lid" : "E-mail of a member"}
            />
          </div>
          <div className="ticket-admin-field" data-span="2">
            <label htmlFor="review-note">{nl ? "Interne notitie" : "Internal note"}</label>
            <textarea
              id="review-note"
              name="internalNote"
              rows={3}
              maxLength={5_000}
              defaultValue={internalNote ?? ""}
            />
          </div>
        </div>
      </SaveForm>
    </section>
  );
}
