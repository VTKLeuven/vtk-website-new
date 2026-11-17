"use client";

import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { syncMailGroupsAction } from "./actions";

/**
 * De acties boven het overzicht: synchroniseren, overnemen uit Google en de
 * accounts. Wat iemand niet mag, staat er niet.
 */
export function MailGroupsToolbar({
  nl,
  base,
  manageAll,
  approveAccounts,
  pendingRequests,
  canRequestAccounts,
}: {
  nl: boolean;
  base: string;
  manageAll: boolean;
  approveAccounts: boolean;
  pendingRequests: number;
  canRequestAccounts: boolean;
}) {
  const errorMessages = nl
    ? {
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld; vul eerst de configuratie in bij Admin > IT.",
        SYNC_PARTIAL:
          "Niet alles is gelukt. Kijk de foutmelding per adres na; de volgende ronde probeert het opnieuw.",
      }
    : {
        NOT_CONFIGURED: "Google Workspace is not set up yet; fill in the configuration under Admin > IT first.",
        SYNC_PARTIAL: "Not everything succeeded. Check the error per address; the next round will try again.",
      };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {manageAll && (
        <SaveForm
          action={syncMailGroupsAction}
          submitLabel={nl ? "Nu synchroniseren" : "Synchronise now"}
          savingLabel={nl ? "Bezig met synchroniseren..." : "Synchronising..."}
          savedMessage={nl ? "Synchronisatie afgerond." : "Synchronisation finished."}
          errorMessages={errorMessages}
          fallbackErrorMessage={nl ? "Synchroniseren is mislukt." : "Synchronisation failed."}
        />
      )}
      {manageAll && (
        <Link href={`${base}/overnemen`} className="vtk-link text-sm">
          {nl ? "Overnemen uit Google" : "Take over from Google"}
        </Link>
      )}
      {(approveAccounts || canRequestAccounts) && (
        <Link href={`${base}/aanvragen`} className="vtk-link text-sm">
          {approveAccounts
            ? nl
              ? `Accountaanvragen${pendingRequests ? ` (${pendingRequests} open)` : ""}`
              : `Account requests${pendingRequests ? ` (${pendingRequests} open)` : ""}`
            : nl
              ? "Accounts aanvragen"
              : "Request accounts"}
        </Link>
      )}
      {approveAccounts && (
        <Link href={`${base}/accounts`} className="vtk-link text-sm">
          {nl ? "Accounts aanmaken" : "Create accounts"}
        </Link>
      )}
      {approveAccounts && (
        <Link href={`${base}/organisatie-eenheden`} className="vtk-link text-sm">
          {nl ? "Organisatie-eenheden" : "Organisational units"}
        </Link>
      )}
      {manageAll && (
        <Link href={`${base}/koppelingen`} className="vtk-link text-sm">
          {nl ? "Accounts koppelen" : "Link accounts"}
        </Link>
      )}
    </div>
  );
}
