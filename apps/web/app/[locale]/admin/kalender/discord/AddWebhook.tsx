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
            ? "Evenementen die al gepubliceerd zijn, komen niet vanzelf in het nieuwe kanaal; die post je hieronder met de hand."
            : "Events that are already published do not appear in the new channel by themselves; post those by hand below."}
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
