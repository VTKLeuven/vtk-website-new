"use client";

import { useTransition } from "react";
import { Button } from "@vtk/ui";
import { deferGoogleLinkAction } from "@/app/actions/googleLink";

/**
 * De uitweg voor wie nog geen `@vtk.be`-account heeft.
 *
 * Geen bevestigingsdialoog: dit gooit niets weg, het stelt enkel uit. De
 * navigatie naar de site is zelf de bevestiging.
 */
export function DeferLinkButton({
  label,
  help,
  home,
}: {
  label: string;
  help: string;
  home: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => deferGoogleLinkAction(home))}
      >
        {label}
      </Button>
      <p className="text-xs text-vtk-muted">{help}</p>
    </div>
  );
}
