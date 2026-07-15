"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { removeMembershipAction } from "@/app/actions/users-groups";

/**
 * Verwijdert een lid uit een post (voor het geselecteerde werkingsjaar). Icoon met
 * tooltip, bevestigings-modal en toast (zie CLAUDE.md > UX-conventies).
 */
export function RemoveMemberButton({
  membershipId,
  userId,
  memberName,
  groupName,
  yearLabel,
  locale,
}: {
  membershipId: string;
  userId: string;
  memberName: string;
  groupName: string;
  yearLabel: string;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = nl ? "Verwijderen" : "Remove";

  function onConfirm() {
    const form = new FormData();
    form.append("id", membershipId);
    form.append("userId", userId);
    startTransition(async () => {
      await removeMembershipAction(form);
      setConfirming(false);
      showToast({ message: nl ? "Lid verwijderd" : "Member removed", variant: "success" });
    });
  }

  return (
    <>
      <IconButton
        label={label}
        srLabel={`${label}: ${memberName}`}
        tone="danger"
        onClick={() => setConfirming(true)}
      >
        <TrashIcon />
      </IconButton>
      <ConfirmDialog
        open={confirming}
        title={nl ? "Lid verwijderen?" : "Remove member?"}
        description={
          nl
            ? `${memberName} wordt verwijderd uit ${groupName} (${yearLabel}). De historiek van andere jaren blijft behouden.`
            : `${memberName} will be removed from ${groupName} (${yearLabel}). Other years' history is kept.`
        }
        confirmLabel={nl ? "Verwijderen" : "Remove"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
