"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { useToast } from "@/components/ui/toast";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { MegaphoneIcon, TrashIcon } from "@/components/ui/icons";
import { deleteEventAction } from "@/app/actions/calendar";

/**
 * Wat er per rij overblijft: communicatie aanvragen en verwijderen.
 *
 * Het potloodje stond hier tot de rij zelf het evenement opende; twee wegen naar
 * hetzelfde scherm, waarvan er één een icoon kostte in elke rij. Verwijderen
 * blijft wel een knop, want het is de enige handeling die je niet ook door de
 * rij te openen kan doen. De megafoon opent het aanvraagformulier voor commu
 * met dit evenement al ingevuld; met een vinkje erin is er al een aanvraag.
 */
export function EventRowActions({
  locale,
  id,
  title,
  commu,
}: {
  locale: Locale;
  id: string;
  title: string;
  commu: { href: string; requested: boolean } | null;
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
      {commu ? (
        <IconLink
          href={commu.href}
          label={
            commu.requested
              ? nl
                ? "Commu aangevraagd"
                : "Comms requested"
              : nl
                ? "Commu aanvragen"
                : "Request comms"
          }
          srLabel={`${
            commu.requested
              ? nl
                ? "Commu aangevraagd"
                : "Comms requested"
              : nl
                ? "Commu aanvragen"
                : "Request comms"
          }: ${title}`}
        >
          <MegaphoneIcon done={commu.requested} />
        </IconLink>
      ) : null}
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
