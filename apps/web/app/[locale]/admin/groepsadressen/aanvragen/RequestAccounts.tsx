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
  /** Aangeduid als "heeft geen werkgroepaccount nodig". */
  notNeeded: boolean;
  /**
   * Het adres dat de site zou voorstellen, bestaat al in Google: met de hand
   * aangemaakt, en dus niet gekend als werkgroepaccount. Null als het er niet is
   * of de site er al een rij voor heeft.
   */
  existingEmail: string | null;
};

/**
 * De leden van een werkgroep met de stand van hun account, en vinkjes om aan te
 * vragen, om aan te duiden dat iemand er geen nodig heeft, of (IT en de vice) om
 * een account dat al in Google bestaat te koppelen.
 */
export function RequestAccounts({
  nl,
  groupId,
  rows,
  canLink,
}: {
  nl: boolean;
  groupId: string;
  rows: Row[];
  /** Mag koppelen aan een bestaand account (`googleAccounts.manage`), en Google is bereikbaar. */
  canLink: boolean;
}) {
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
    if (row.notNeeded) return nl ? "niet nodig" : "not needed";
    if (row.existingEmail) {
      return nl ? "bestaat al in Google, nog niet gekoppeld" : "already exists in Google, not linked yet";
    }
    return nl ? "geen account" : "no account";
  };
  // Aanvinken kan voor wie nog geen account of open aanvraag heeft: om aan te
  // vragen, om niet nodig te zetten (of terug), of om te koppelen.
  const selectable = (row: Row) => !row.missingName && (row.status === null || row.status === "REJECTED");
  const existing = rows.filter((row) => row.existingEmail && !row.status).length;
  const notNeeded = rows.filter((row) => row.notNeeded && !row.status).length;
  const summary = [
    existing > 0
      ? nl
        ? `${existing} ${existing === 1 ? "lid heeft" : "leden hebben"} al een account in Google dat de site nog niet kent`
        : `${existing} ${existing === 1 ? "member has" : "members have"} an account in Google the site does not know yet`
      : null,
    notNeeded > 0 ? (nl ? `${notNeeded} niet nodig` : `${notNeeded} not needed`) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SaveForm
      action={requestAccountsAction}
      submitLabel={nl ? "Aangevinkte accounts aanvragen" : "Request selected accounts"}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Opgeslagen." : "Saved."}
      secondarySubmit={[
        { name: "intent", value: "skip", label: nl ? "Niet nodig" : "Not needed" },
        { name: "intent", value: "unskip", label: nl ? "Toch nodig" : "Needed after all" },
        ...(canLink && existing > 0
          ? [{ name: "intent", value: "link", label: nl ? "Koppelen aan bestaand account" : "Link to existing account" }]
          : []),
      ]}
      errorMessages={
        nl
          ? {
              NOTHING_SELECTED: "Niets aangevinkt.",
              NOTHING_REQUESTED: "Niets aangevraagd: wie aangevinkt was, heeft al een account of een open aanvraag.",
              NOTHING_CHANGED: "Niets gewijzigd: wie aangevinkt was, is geen lid meer dit werkingsjaar.",
              NOTHING_LINKED: "Niets gekoppeld: voor wie aangevinkt was, bestaat het adres niet in Google, of hangt het al aan iemand anders.",
              NOT_CONFIGURED: "De koppeling met Google is niet ingesteld.",
            }
          : {
              NOTHING_SELECTED: "Nothing selected.",
              NOTHING_REQUESTED: "Nothing requested: whoever was selected already has an account or an open request.",
              NOTHING_CHANGED: "Nothing changed: whoever was selected is no longer a member this working year.",
              NOTHING_LINKED: "Nothing linked: for whoever was selected, the address does not exist in Google, or it already belongs to someone else.",
              NOT_CONFIGURED: "The Google connection is not set up.",
            }
      }
      fallbackErrorMessage={nl ? "Dat is mislukt." : "That failed."}
      className="space-y-3"
    >
      <input type="hidden" name="groupId" value={groupId} />
      {summary ? <p className="text-xs text-zinc-500">{summary}.</p> : null}
      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">{nl ? "Aanvinken" : "Select"}</span>
              </th>
              <th className="px-4 py-3 font-medium">{nl ? "Lid" : "Member"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Account" : "Account"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                className={`border-b border-vtk-blue/5 last:border-0 ${row.notNeeded && !row.status ? "text-zinc-500" : ""}`}
              >
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="userId"
                    value={row.userId}
                    disabled={!selectable(row)}
                    aria-label={row.name}
                  />
                </td>
                <td className={`px-4 py-2 font-medium ${row.notNeeded && !row.status ? "" : "text-vtk-ink"}`}>{row.name}</td>
                <td className="px-4 py-2 text-zinc-600">
                  {(row.email ?? row.existingEmail) && <span className="block">{row.email ?? row.existingEmail}</span>}
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
