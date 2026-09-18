"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { deleteEventAction } from "@/app/actions/calendar";

/**
 * Wat er per rij overblijft: verwijderen.
 *
 * Het potloodje stond hier tot de rij zelf het evenement opende; twee wegen naar
 * hetzelfde scherm, waarvan er één een icoon kostte in elke rij. Verwijderen
 * blijft wel een knop, want het is de enige handeling die je niet ook door de
 * rij te openen kan doen.
 */
export function EventRowActions({
  locale,
  id,
  title,
}: {
  locale: Locale;
  id: string;
  title: string;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const deleteLabel = nl ? "Verwijderen" : "Delete";

  function onConfirm() {
    const form = new FormData();
    form.append("id", id);
    startTransition(async () => {
      await deleteEventAction(form);
      setConfirming(false);
      showToast({
        message: nl ? "Evenement verwijderd" : "Event deleted",
        variant: "success",
      });
    });
  }

  return (
    <RowActions>
      <IconButton
        label={deleteLabel}
        srLabel={`${deleteLabel}: ${title}`}
        tone="danger"
        onClick={() => setConfirming(true)}
      >
        <TrashIcon />
      </IconButton>

      <ConfirmDialog
        open={confirming}
        title={nl ? "Evenement verwijderen?" : "Delete event?"}
        description={
          nl
            ? `"${title}" wordt permanent verwijderd en verdwijnt meteen uit de publieke kalender. Dit kan niet ongedaan gemaakt worden.`
            : `"${title}" will be permanently deleted and disappears from the public calendar right away. This cannot be undone.`
        }
        confirmLabel={deleteLabel}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </RowActions>
  );
}
