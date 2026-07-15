"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { deleteEventAction } from "@/app/actions/calendar";

export function EventRowActions({
  locale,
  id,
  title,
  base,
}: {
  locale: Locale;
  id: string;
  title: string;
  base: string;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const editLabel = nl ? "Bewerken" : "Edit";
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
      <IconLink
        href={`${base}/admin/kalender/${id}`}
        label={editLabel}
        srLabel={`${editLabel}: ${title}`}
      >
        <PencilIcon />
      </IconLink>
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
