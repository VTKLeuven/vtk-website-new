"use client";

import { useState } from "react";
import { Button, Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { WebhookForm } from "./WebhookForm";

/**
 * Een kanaal toevoegen. Zonder kanalen staat het formulier meteen open: dat is
 * dan de enige zinvolle handeling op het scherm. Met kanalen zit het achter een
 * knop, zodat het niet naast de lijst om aandacht vraagt.
 */
export function AddWebhook({ locale, startOpen }: { locale: Locale; startOpen: boolean }) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(startOpen);

  if (!open) {
    return (
      <div>
        <Button type="button" onClick={() => setOpen(true)}>
          {nl ? "Webhook toevoegen" : "Add webhook"}
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Webhook toevoegen" : "Add webhook"}</h2>
        <p className="mt-1 text-sm text-vtk-muted">
          {nl
            ? "Evenementen komen twee weken voor ze beginnen in het kanaal, ook die al online staan. Wat nu al binnen die twee weken valt, komt niet vanzelf; dat post je hieronder met de hand."
            : "Events appear in the channel two weeks before they start, including those already online. What already falls within those two weeks does not appear by itself; post that by hand below."}
        </p>
      </div>
      <WebhookForm
        locale={locale}
        onSuccess={startOpen ? undefined : () => setOpen(false)}
        onCancel={startOpen ? undefined : () => setOpen(false)}
      />
    </Card>
  );
}
