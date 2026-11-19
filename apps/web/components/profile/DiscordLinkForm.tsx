"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import type { DiscordLinkLabels } from "@/lib/discord/linkCopy";

/** Eén knop: dit Discord-account hoort bij mij. */
export function DiscordLinkForm({
  token,
  labels,
  action,
}: {
  token: string;
  labels: DiscordLinkLabels;
  action: SaveAction;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="space-y-1">
        <p className="font-semibold text-vtk-ink">{labels.doneTitle}</p>
        <p className="text-sm text-vtk-muted">{labels.doneBody}</p>
      </div>
    );
  }

  return (
    <SaveForm
      action={action}
      submitLabel={labels.submit}
      savingLabel={labels.submitting}
      savedMessage={labels.saved}
      errorMessages={labels.errors}
      fallbackErrorMessage={labels.fallbackError}
      resetOnSuccess={false}
      onSuccess={() => setDone(true)}
      className="space-y-4"
    >
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-vtk-body">{labels.intro}</p>
    </SaveForm>
  );
}
