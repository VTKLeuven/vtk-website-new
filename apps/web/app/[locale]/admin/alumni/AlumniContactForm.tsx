"use client";

import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveAlumniContactAction } from "@/app/actions/alumni";
import { saveErrorMessages } from "@/lib/saveMessages";

/**
 * Eén alumnus toevoegen of bijwerken.
 *
 * Bewust hetzelfde formulier voor allebei: een apart bewerkscherm zou betekenen
 * dat je voor een tikfout in een e-mailadres naar een andere pagina moet, en het
 * adresboek is precies de plek waar tikfouten zitten.
 */
export function AlumniContactForm({
  locale,
  contact,
  onSaved,
}: {
  locale: "nl" | "en";
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    graduationYear: number | null;
    wasInVtk: boolean;
    note: string | null;
  };
  onSaved?: () => void;
}) {
  const nl = locale === "nl";

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-medium text-vtk-ink">
        {contact ? (nl ? "Alumnus bewerken" : "Edit alumnus") : nl ? "Alumnus toevoegen" : "Add an alumnus"}
      </h2>
      <SaveForm
        action={saveAlumniContactAction}
        className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:justify-self-start"
        submitLabel={contact ? (nl ? "Opslaan" : "Save") : nl ? "Toevoegen" : "Add"}
        savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
        savedMessage={
          contact
            ? nl
              ? "Alumnus bijgewerkt"
              : "Alumnus updated"
            : nl
              ? "Alumnus toegevoegd"
              : "Alumnus added"
        }
        errorMessages={{
          ...saveErrorMessages(locale),
          EMAIL_TAKEN: nl
            ? "Niet opgeslagen: dit e-mailadres staat al in het adresboek."
            : "Not saved: this email address is already in the address book.",
        }}
        fallbackErrorMessage={
          nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving."
        }
        // Bij een bestaande alumnus moeten de waarden blijven staan; bij een
        // nieuwe hoort het formulier leeg te zijn voor de volgende.
        resetOnSuccess={!contact}
        onSuccess={onSaved}
      >
        {contact && <input type="hidden" name="id" value={contact.id} />}
        <div>
          <Label>{nl ? "Voornaam" : "First name"}</Label>
          <Input name="firstName" defaultValue={contact?.firstName ?? ""} required />
        </div>
        <div>
          <Label>{nl ? "Achternaam" : "Last name"}</Label>
          <Input name="lastName" defaultValue={contact?.lastName ?? ""} required />
        </div>
        <div>
          <Label>{nl ? "E-mailadres" : "Email address"}</Label>
          <Input name="email" type="email" defaultValue={contact?.email ?? ""} required />
        </div>
        <div>
          <Label>{nl ? "Afstudeerjaar" : "Graduation year"}</Label>
          {/* Geen `type="number"`: een spinner op een jaartal is onbruikbaar op
              een telefoon en scrollt per ongeluk mee. */}
          <Input
            name="graduationYear"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="2004"
            defaultValue={contact?.graduationYear ?? ""}
          />
        </div>
        <div className="md:col-span-2">
          <Label>{nl ? "Notitie" : "Note"}</Label>
          <Input
            name="note"
            defaultValue={contact?.note ?? ""}
            placeholder={
              nl ? "Bv. oud-praeses, of waar deze naam vandaan komt" : "E.g. former praeses, or where this name came from"
            }
          />
        </div>
        <label className="md:col-span-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="wasInVtk" defaultChecked={contact?.wasInVtk ?? false} />
          {nl ? "Heeft ooit in VTK gezeten" : "Was part of VTK"}
        </label>
      </SaveForm>
    </Card>
  );
}
