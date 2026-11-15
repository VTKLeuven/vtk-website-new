"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { requestAccountsAction } from "./actions";

type Row = {
  userId: string;
  name: string;
  missingName: boolean;
  status: "REQUESTED" | "REJECTED" | "ACTIVE" | "SUSPENDED" | null;
  email: string | null;
  rejectReason: string | null;
};

/** De leden van een werkgroep met de stand van hun account, en vinkjes om aan te vragen. */
export function RequestAccounts({ nl, groupId, rows }: { nl: boolean; groupId: string; rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        {nl
          ? "Nog geen leden dit werkingsjaar. Voeg ze eerst toe bij Werkgroepen."
          : "No members this working year yet. Add them under Work groups first."}
      </p>
    );
  }
  const statusLabel = (row: Row) => {
    if (row.status === "ACTIVE") return nl ? "account actief" : "account active";
    if (row.status === "REQUESTED") return nl ? "aangevraagd, wacht op IT of de vice" : "requested, waiting for IT or the vice";
    if (row.status === "SUSPENDED") return nl ? "geschorst" : "suspended";
    if (row.status === "REJECTED") {
      return `${nl ? "geweigerd" : "rejected"}${row.rejectReason ? `: ${row.rejectReason}` : ""}`;
    }
    return nl ? "geen account" : "no account";
  };
  const requestable = (row: Row) => !row.missingName && (row.status === null || row.status === "REJECTED");

  return (
    <SaveForm
      action={requestAccountsAction}
      submitLabel={nl ? "Aangevinkte accounts aanvragen" : "Request selected accounts"}
      savingLabel={nl ? "Bezig met aanvragen..." : "Requesting..."}
      savedMessage={nl ? "Aangevraagd. IT of de vice keurt het goed." : "Requested. IT or the vice will approve it."}
      errorMessages={
        nl
          ? {
              NOTHING_SELECTED: "Niets aangevinkt.",
              NOTHING_REQUESTED: "Niets aangevraagd: wie aangevinkt was, heeft al een account of een open aanvraag.",
            }
          : {
              NOTHING_SELECTED: "Nothing selected.",
              NOTHING_REQUESTED: "Nothing requested: whoever was selected already has an account or an open request.",
            }
      }
      fallbackErrorMessage={nl ? "Aanvragen is mislukt." : "Requesting failed."}
      className="space-y-3"
    >
      <input type="hidden" name="groupId" value={groupId} />
      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">{nl ? "Aanvragen" : "Request"}</span>
              </th>
              <th className="px-4 py-3 font-medium">{nl ? "Lid" : "Member"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Account" : "Account"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-vtk-blue/5 last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="userId"
                    value={row.userId}
                    disabled={!requestable(row)}
                    aria-label={row.name}
                  />
                </td>
                <td className="px-4 py-2 font-medium text-vtk-ink">{row.name}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {row.email && <span className="block">{row.email}</span>}
                  <span className={row.status === "REJECTED" ? "text-xs text-red-700" : "text-xs text-zinc-500"}>
                    {row.missingName
                      ? nl
                        ? "voor- of achternaam ontbreekt in het profiel"
                        : "first or last name missing from the profile"
                      : statusLabel(row)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SaveForm>
  );
}
