"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useState, useTransition } from "react";
import type { Locale } from "@vtk/i18n";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import { setCommuRequestStatusAction } from "@/app/actions/commuRequests";

type Status = "NEW" | "ACCEPTED" | "REJECTED";

const ERRORS: Record<string, [string, string]> = {
  FORBIDDEN: ["Je mag de status van deze aanvraag niet wijzigen.", "You may not change the status of this request."],
  ENTRY_NOT_FOUND: ["Deze aanvraag bestaat niet meer.", "This request no longer exists."],
};

/**
 * De status van één aanvraag, meteen in de rij. Zet de keuze meteen om en
 * draait ze terug wanneer de server weigert: anders staat de keuzelijst een
 * halve seconde op de oude waarde terwijl je al verder klikt.
 */
export function CommuStatusSelect({
  locale,
  entryId,
  title,
  status,
  labels,
}: {
  locale: Locale;
  entryId: string;
  title: string;
  status: Status;
  labels: Record<Status, string>;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [value, setValue] = useState<Status>(status);
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    const previous = value;
    if (next === previous) return;
    setValue(next as Status);
    const form = new FormData();
    form.append("entryId", entryId);
    form.append("reviewStatus", next);
    startTransition(async () => {
      const result = await unsentGuard.run(() => setCommuRequestStatusAction(SAVE_IDLE, form));
      if (result === UNSENT) {
        setValue(previous);
        return;
      }
      if (result.status === "error") {
        setValue(previous);
        const message = ERRORS[result.code];
        showToast({
          message: message
            ? message[nl ? 0 : 1]
            : nl
              ? `De status van "${title}" kon niet gewijzigd worden. Probeer het opnieuw.`
              : `The status of "${title}" could not be changed. Try again.`,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: `"${title}": ${labels[next as Status]}`, variant: "success" });
    });
  }

  return (
    <div data-row-action className="vtk-commu-status">
      <ThemedSelect
        name={`status-${entryId}`}
        ariaLabel={nl ? `Status: ${title}` : `Status: ${title}`}
        value={value}
        disabled={pending}
        onChange={choose}
        options={(Object.keys(labels) as Status[]).map((key) => ({ value: key, label: labels[key] }))}
      />
    </div>
  );
}
