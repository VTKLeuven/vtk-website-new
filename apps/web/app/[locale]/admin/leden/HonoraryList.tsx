import { Card } from "@vtk/ui";
import { listHonoraryMembers } from "@/lib/membership";
import { revokeHonoraryAction } from "@/app/actions/membership";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { GrantHonoraryForm } from "./GrantHonoraryForm";

/**
 * De tweede lijst op /admin/leden: de ereleden.
 *
 * Een erelid ziet ticketsoorten met doelgroep "Alleen ereleden"; voor iedereen
 * anders bestaan die niet. Anders dan het lidmaatschap hangt dit niet aan een
 * academiejaar, dus er is hier geen jaarkeuze.
 */
export async function HonoraryList({ nl }: { nl: boolean }) {
  const rows = await listHonoraryMembers();

  return (
    <>
      <Card className="p-5">
        <h2 className="mb-1 font-medium text-vtk-ink">
          {nl ? "Iemand erelid maken" : "Make someone an honorary member"}
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "Een erelid ziet ticketsoorten met doelgroep “Alleen ereleden”. Voor alle andere bezoekers bestaan die soorten niet: ze staan niet in de lijst en de kassa weigert ze. Erelid blijf je tot het hier ingetrokken wordt, ook over academiejaren heen."
            : "An honorary member sees ticket types with the “Honorary members only” audience. For every other visitor those types do not exist: they are not listed, and checkout refuses them. The status lasts until it is revoked here, across academic years."}
        </p>
        <GrantHonoraryForm nl={nl} />
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="font-medium text-vtk-ink">{nl ? "Ereleden" : "Honorary members"}</h2>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? `${rows.length} ${rows.length === 1 ? "erelid" : "ereleden"}.`
              : `${rows.length} honorary ${rows.length === 1 ? "member" : "members"}.`}
          </p>
        </div>

        <Card className="relative overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
                <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "R-nummer" : "R-number"}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium text-vtk-ink">{row.name}</span>
                    <span className="block text-xs text-[#5c667f]">{row.email}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.rNumber ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <DeleteIconButton
                      action={revokeHonoraryAction}
                      fields={{ userId: row.userId }}
                      label={nl ? "Erelidmaatschap intrekken" : "Revoke honorary membership"}
                      srLabel={
                        nl
                          ? `Erelidmaatschap intrekken: ${row.name}`
                          : `Revoke honorary membership: ${row.name}`
                      }
                      title={nl ? "Erelidmaatschap intrekken?" : "Revoke honorary membership?"}
                      description={
                        nl
                          ? `${row.name} ziet daarna geen ticketsoorten voor ereleden meer. Het account, een lidmaatschap van de kring en tickets die al gekocht zijn, blijven staan.`
                          : `${row.name} will no longer see ticket types for honorary members. The account, a VTK membership and tickets already bought stay.`
                      }
                      confirmLabel={nl ? "Intrekken" : "Revoke"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={
                        nl ? "Erelidmaatschap ingetrokken." : "Honorary membership revoked."
                      }
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-[#5c667f]" colSpan={3}>
                    {nl ? "Nog geen ereleden." : "No honorary members yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
