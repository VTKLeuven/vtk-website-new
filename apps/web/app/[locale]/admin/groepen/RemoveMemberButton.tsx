"use client";

import { useState, useTransition } from "react";
import { Button, ConfirmDialog } from "@vtk/ui";
import { removeMembershipAction } from "@/app/actions/users-groups";

/**
 * Verwijdert een lid uit een post (voor het geselecteerde werkingsjaar). Toont
 * eerst een bevestigings-modal (zie CLAUDE.md > UX-conventies): geen kale
 * delete-knop of native confirm().
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
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", membershipId);
    form.append("userId", userId);
    startTransition(() => void removeMembershipAction(form));
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {nl ? "Verwijderen" : "Remove"}
      </Button>
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
