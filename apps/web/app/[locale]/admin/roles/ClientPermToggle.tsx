"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { ToggleDot } from "../admin-table";
import { setRoleClientPermissionAction } from "@/app/actions/roles";

/**
 * Eén permissie van een externe applicatie aan- of uitzetten voor een rol.
 *
 * Waarom dit geen kaal `<form>` is zoals bij de gewone VTK-rechten: uitzetten is
 * hier destructief. Leden die de code enkel via deze rol hadden, worden meteen
 * uitgelogd bij die applicatie. Dat verdient een bevestiging vooraf en een
 * melding achteraf, conform de UX-conventies in CLAUDE.md.
 *
 * Aanzetten neemt niemand iets af en gaat dus rechtstreeks door.
 */
export function ClientPermToggle({
  nl,
  roleId,
  permissionId,
  code,
  label,
  clientName,
  grantsAccess,
  on,
}: {
  nl: boolean;
  roleId: string;
  permissionId: string;
  code: string;
  label: string;
  clientName: string;
  grantsAccess: boolean;
  on: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function submit() {
    const form = new FormData();
    form.append("roleId", roleId);
    form.append("permissionId", permissionId);
    form.append("enabled", on ? "0" : "1");

    startTransition(async () => {
      try {
        await setRoleClientPermissionAction(form);
        setConfirming(false);
        showToast({
          message: on
            ? nl
              ? `${code} ingetrokken`
              : `${code} revoked`
            : nl
              ? `${code} toegekend`
              : `${code} granted`,
          variant: "success",
        });
      } catch {
        setConfirming(false);
        showToast({
          message: nl ? "Wijzigen mislukt" : "Could not change",
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2"
          disabled={pending}
          onClick={() => (on ? setConfirming(true) : submit())}
          aria-label={`${label} (${code})`}
          aria-pressed={on}
          title={code}
        >
          <ToggleDot on={on} title={code} visual />
          <span>{label}</span>
        </button>
        {grantsAccess && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
            {nl ? "toegang" : "access"}
          </span>
        )}
      </span>

      <ConfirmDialog
        open={confirming}
        title={nl ? "Recht intrekken?" : "Revoke right?"}
        description={
          grantsAccess
            ? nl
              ? `Leden die ${clientName} enkel via deze rol konden gebruiken, kunnen daarna niet meer inloggen en worden nu uitgelogd. Wie de toegang ook via een andere rol of post heeft, merkt niets.`
              : `Members who could only use ${clientName} through this role will no longer be able to sign in, and are signed out now. Anyone who also has access through another role or post is unaffected.`
            : nl
              ? `Leden die ${code} enkel via deze rol hadden, verliezen dat recht in ${clientName} en worden daar uitgelogd. Wie het ook langs een ander pad heeft, merkt niets.`
              : `Members who had ${code} only through this role lose that right in ${clientName} and are signed out there. Anyone who has it by another path is unaffected.`
        }
        confirmLabel={nl ? "Intrekken" : "Revoke"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
