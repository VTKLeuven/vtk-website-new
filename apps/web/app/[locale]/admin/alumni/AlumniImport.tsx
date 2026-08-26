"use client";

import { Card } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { importAlumniAction } from "@/app/actions/alumni";

/**
 * Een geplakte lijst invoeren.
 *
 * Zonder deze weg is een adresboek van vijfhonderd alumni een middag typen, en
 * dan gebeurt het gewoon niet. Komma's, puntkomma's en tabs zijn alle drie
 * geldig, want wie uit Excel kopieert krijgt tabs en wie uit een export komt
 * krijgt komma's.
 */
export function AlumniImport({ locale }: { locale: "nl" | "en" }) {
  const nl = locale === "nl";

  return (
    <Card className="p-5">
      <h2 className="font-medium text-vtk-ink">{nl ? "Lijst plakken" : "Paste a list"}</h2>
      <p className="mt-1 mb-3 max-w-2xl text-sm text-[#5c667f]">
        {nl
          ? "Eén alumnus per regel: voornaam, achternaam, e-mail, afstudeerjaar, in VTK. De laatste twee mogen weg. Komma, puntkomma en tab werken alle drie, dus plakken uit Excel kan rechtstreeks. Een adres dat al in het adresboek staat, wordt bijgewerkt in plaats van geweigerd."
          : "One alumnus per line: first name, last name, email, graduation year, in VTK. The last two are optional. Comma, semicolon and tab all work, so pasting from Excel works directly. An address already in the book is updated instead of refused."}
      </p>
      <SaveForm
        action={importAlumniAction}
        className="space-y-3 [&>button]:justify-self-start"
        submitLabel={nl ? "Invoeren" : "Import"}
        savingLabel={nl ? "Bezig met invoeren..." : "Importing..."}
        savedMessage={nl ? "Alumni ingevoerd" : "Alumni imported"}
        errorMessages={{
          NOTHING_IMPORTED: nl
            ? "Niets ingevoerd: geen enkele regel was bruikbaar."
            : "Nothing imported: not a single line was usable.",
        }}
        fallbackErrorMessage={
          nl ? "Er ging iets mis bij het invoeren." : "Something went wrong while importing."
        }
      >
        <textarea
          name="paste"
          rows={6}
          required
          className="w-full rounded-xl border border-vtk-blue/15 bg-white px-3 py-2 font-mono text-sm"
          placeholder={
            nl
              ? "Jan, Peeters, jan.peeters@example.com, 2004, ja\nAn, Janssens, an@example.com, 2011"
              : "Jan, Peeters, jan.peeters@example.com, 2004, yes\nAn, Janssens, an@example.com, 2011"
          }
        />
      </SaveForm>
    </Card>
  );
}
