"use client";

import { ArrowUpFromLine } from "lucide-react";
import { promoteWaitlistedEntryAction } from "@/app/actions/formEntries";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AdminLocale } from "./format";

/** Iemand van de wachtlijst alsnog een plaats geven. */
export function PromoteWaitlistForm({
  locale,
  formId,
  entryId,
}: {
  locale: AdminLocale;
  formId: string;
  entryId: string;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={promoteWaitlistedEntryAction}
      submitLabel={nl ? "Een plaats geven" : "Give a spot"}
      savingLabel={nl ? "Bezig..." : "Promoting..."}
      savedMessage={nl ? "Deze inzending heeft nu een plaats" : "This entry now has a spot"}
      fallbackErrorMessage={nl ? "Dit is niet gelukt." : "This did not work."}
      errorMessages={{
        STILL_FULL: nl
          ? "Er is nog geen plaats vrij; de inzending blijft op de wachtlijst."
          : "There is no spot free yet; the entry stays on the waiting list.",
        ENTRY_NOT_FOUND: nl
          ? "Deze inzending staat niet (meer) op de wachtlijst."
          : "This entry is not on the waiting list (any more).",
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="entryId" value={entryId} />
      <p className="form-admin-hint">
        <ArrowUpFromLine aria-hidden="true" size={14} />{" "}
        {nl
          ? "De quota van haar keuzes worden dan alsnog geclaimd."
          : "The quotas of its choices are claimed at that moment."}
      </p>
    </SaveForm>
  );
}
