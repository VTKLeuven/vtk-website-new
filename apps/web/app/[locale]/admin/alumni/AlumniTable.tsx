"use client";

import { useState } from "react";
import { Card } from "@vtk/ui";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton, RowActions } from "@/components/ui/IconButton";
import { PencilIcon } from "@/components/ui/icons";
import { deleteAlumniContactAction, toggleAlumniSubscriptionAction } from "@/app/actions/alumni";
import { AlumniContactForm } from "./AlumniContactForm";

export type AlumniRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  graduationYear: number | null;
  wasInVtk: boolean;
  note: string | null;
  unsubscribedAt: Date | null;
};

/**
 * Het adresboek zelf. Rij-acties zijn icoonknoppen (zie CLAUDE.md); bewerken
 * klapt hetzelfde formulier open dat ook "toevoegen" gebruikt, in plaats van
 * naar een aparte pagina te springen.
 *
 * De site-accounts staan hier bewust **niet** in: dit is de handmatige lijst.
 * Wat er samen naar Brevo en naar de CSV gaat, staat in de kop van de pagina.
 */
export function AlumniTable({
  rows,
  locale,
}: {
  rows: AlumniRow[];
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const [editing, setEditing] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Nog geen alumni in het adresboek. Voeg er hierboven een toe, of plak een lijst."
            : "No alumni in the address book yet. Add one above, or paste a list."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Een brede tabel in een horizontale scroller heeft een gepositioneerde
          wrapper nodig; zie CLAUDE.md. */}
      <Card className="relative overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
              <th className="px-4 py-3 font-medium">{nl ? "Naam" : "Name"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "E-mail" : "Email"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Lichting" : "Year"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "In VTK" : "In VTK"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Status" : "Status"}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = `${row.firstName} ${row.lastName}`;
              return (
                <tr key={row.id} className="border-b border-vtk-blue/10 last:border-0">
                  <td className="px-4 py-3 font-medium text-vtk-ink">
                    {name}
                    {row.note ? (
                      <span className="block text-xs font-normal text-[#5c667f]">{row.note}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[#34405e]">{row.email}</td>
                  <td className="px-4 py-3 text-[#34405e]">{row.graduationYear ?? "—"}</td>
                  <td className="px-4 py-3 text-[#34405e]">{row.wasInVtk ? (nl ? "Ja" : "Yes") : "—"}</td>
                  <td className="px-4 py-3">
                    {row.unsubscribedAt ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {nl ? "Uitgeschreven" : "Unsubscribed"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        {nl ? "Krijgt mails" : "Receives mail"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions>
                      <IconButton
                        label={nl ? "Bewerken" : "Edit"}
                        srLabel={`${nl ? "Bewerken" : "Edit"}: ${name}`}
                        onClick={() => setEditing(editing === row.id ? null : row.id)}
                      >
                        <PencilIcon />
                      </IconButton>
                      {/* Uitschrijven is geen verwijderen: de rij blijft staan
                          zodat de volgende import hem niet stilletjes weer
                          toevoegt. Daarom een gewone knop en geen dialoog. */}
                      <form action={toggleAlumniSubscriptionAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
                        >
                          {row.unsubscribedAt
                            ? nl
                              ? "Opnieuw inschrijven"
                              : "Resubscribe"
                            : nl
                              ? "Uitschrijven"
                              : "Unsubscribe"}
                        </button>
                      </form>
                      <DeleteIconButton
                        action={deleteAlumniContactAction}
                        fields={{ id: row.id }}
                        label={nl ? "Verwijderen" : "Delete"}
                        srLabel={`${nl ? "Verwijderen" : "Delete"}: ${name}`}
                        title={nl ? "Alumnus verwijderen?" : "Delete alumnus?"}
                        description={
                          nl
                            ? `${name} (${row.email}) verdwijnt uit het adresboek en uit elke export. Wil je enkel dat hij geen mails meer krijgt, gebruik dan "Uitschrijven": dan blijft de rij staan en voegt een volgende import hem niet opnieuw toe.`
                            : `${name} (${row.email}) disappears from the address book and from every export. If you only want to stop the mail, use "Unsubscribe": the row stays and a later import will not add them back.`
                        }
                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Alumnus verwijderd" : "Alumnus deleted"}
                      />
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editing
        ? rows
            .filter((row) => row.id === editing)
            .map((row) => (
              <AlumniContactForm
                key={row.id}
                locale={locale}
                contact={row}
                onSaved={() => setEditing(null)}
              />
            ))
        : null}
    </div>
  );
}
