"use client";

import { Input, Label, Select, Textarea } from "@vtk/ui";
import { Modal } from "@/app/[locale]/admin/admin-table";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveLesbezoekAction } from "@/app/actions/lesbezoeken";
import { LESBEZOEK_LIMITS } from "@/lib/lesbezoeken";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import { AudienceCombobox } from "./AudienceCombobox";
import type { OrganisationView, VisitView } from "./types";

/**
 * Een lesbezoek zelf inplannen of er een bijstellen.
 *
 * Nodig omdat niet alles via het formulier binnenkomt: soms belt een organisatie,
 * en vaker stelt de docent een ander uur voor dan wat er gevraagd werd. Dat laatste
 * is de reden dat het einduur hier apart te zetten is.
 */

/** Minuten sinds middernacht als "HH:MM", voor een `<input type="time">`. */
function toTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function LesbezoekFormModal({
  nl,
  visit,
  organisations,
  onClose,
}: {
  nl: boolean;
  /** Leeg = een nieuw bezoek. */
  visit: VisitView | null;
  organisations: OrganisationView[];
  onClose: () => void;
}) {
  const errors = lesbezoekAdminErrors(nl);

  return (
    <Modal
      title={
        visit
          ? nl
            ? "Lesbezoek bewerken"
            : "Edit classroom visit"
          : nl
            ? "Nieuw lesbezoek"
            : "New classroom visit"
      }
      onClose={onClose}
      size="lg"
    >
      <SaveForm
        action={saveLesbezoekAction}
        submitLabel={nl ? "Opslaan" : "Save"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Lesbezoek opgeslagen." : "Classroom visit saved."}
        errorMessages={errors}
        fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
        resetOnSuccess={false}
        onSuccess={onClose}
        className="space-y-4"
      >
        {visit && <input type="hidden" name="id" value={visit.id} />}

        <div>
          <Label htmlFor="lb-organisation">{nl ? "Organisatie" : "Organisation"}</Label>
          <Select
            id="lb-organisation"
            name="organisationId"
            defaultValue={visit?.organisationId ?? ""}
            required
          >
            <option value="" disabled>
              {nl ? "Kies een organisatie…" : "Pick an organisation…"}
            </option>
            {organisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
                {organisation.active ? "" : nl ? " (niet actief)" : " (inactive)"}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="lb-date">{nl ? "Datum" : "Date"}</Label>
            <Input id="lb-date" name="date" type="date" defaultValue={visit?.day ?? ""} required />
          </div>
          <div>
            <Label htmlFor="lb-time">{nl ? "Startuur" : "Start time"}</Label>
            <Input id="lb-time" name="time" type="time" defaultValue={visit?.time ?? ""} required />
          </div>
          <div>
            <Label htmlFor="lb-endtime">{nl ? "Einduur" : "End time"}</Label>
            <Input
              id="lb-endtime"
              name="endTime"
              type="time"
              defaultValue={visit ? toTimeInput(visit.endMinutes) : ""}
            />
            <p className="lb-help">
              {nl ? "Leeg = volgt uit de duur hieronder." : "Empty = follows the duration below."}
            </p>
          </div>
        </div>

        <label className="lb-check">
          <input type="checkbox" name="longVisit" defaultChecked={visit?.longVisit ?? false} />
          <span>
            {nl
              ? "Dit lesbezoek duurt langer dan vijf minuten"
              : "This visit takes longer than five minutes"}
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lb-audience">{nl ? "Doelgroep" : "Target group"}</Label>
            <AudienceCombobox
              id="lb-audience"
              name="audience"
              defaultValue={visit?.audience ?? ""}
              maxLength={LESBEZOEK_LIMITS.audience}
              required
              placeholder={nl ? "Kies of typ een doelgroep…" : "Choose or type a target group…"}
            />
          </div>
          <div>
            <Label htmlFor="lb-course">{nl ? "Vak" : "Course"}</Label>
            <Input
              id="lb-course"
              name="course"
              defaultValue={visit?.course ?? ""}
              maxLength={LESBEZOEK_LIMITS.course}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="lb-subject">{nl ? "Onderwerp" : "Subject"}</Label>
          <Input
            id="lb-subject"
            name="subject"
            defaultValue={visit?.subject ?? ""}
            maxLength={LESBEZOEK_LIMITS.subject}
            required
          />
        </div>

        <div>
          <Label htmlFor="lb-note">{nl ? "Toelichting voor de docent" : "Note for the lecturer"}</Label>
          <Textarea
            id="lb-note"
            name="teacherNote"
            rows={5}
            defaultValue={visit?.teacherNote ?? ""}
            maxLength={LESBEZOEK_LIMITS.teacherNote}
            required
          />
          <p className="lb-help">
            {nl
              ? "Deze tekst komt letterlijk in de mail naar de docent."
              : "This text goes into the email to the lecturer word for word."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lb-teacher-email">{nl ? "Mailadres docent" : "Lecturer email"}</Label>
            <Input
              id="lb-teacher-email"
              name="teacherEmail"
              type="email"
              defaultValue={visit?.teacherEmail ?? ""}
              maxLength={LESBEZOEK_LIMITS.email}
              required
            />
          </div>
          <div>
            <Label htmlFor="lb-teacher-name">{nl ? "Naam docent" : "Lecturer name"}</Label>
            <Input
              id="lb-teacher-name"
              name="teacherName"
              defaultValue={visit?.teacherName ?? ""}
              maxLength={LESBEZOEK_LIMITS.name}
              placeholder={nl ? "leeg = uit het adres afgeleid" : "empty = derived from the address"}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="lb-req-name">{nl ? "Contactpersoon" : "Contact person"}</Label>
            <Input
              id="lb-req-name"
              name="requesterName"
              defaultValue={visit?.requesterName ?? ""}
              maxLength={LESBEZOEK_LIMITS.name}
            />
          </div>
          <div>
            <Label htmlFor="lb-req-email">{nl ? "E-mail aanvrager" : "Requester email"}</Label>
            <Input
              id="lb-req-email"
              name="requesterEmail"
              type="email"
              defaultValue={visit?.requesterEmail ?? ""}
              maxLength={LESBEZOEK_LIMITS.email}
            />
          </div>
          <div>
            <Label htmlFor="lb-req-phone">{nl ? "Telefoon" : "Phone"}</Label>
            <Input
              id="lb-req-phone"
              name="requesterPhone"
              defaultValue={visit?.requesterPhone ?? ""}
              maxLength={LESBEZOEK_LIMITS.phone}
            />
          </div>
        </div>
      </SaveForm>
    </Modal>
  );
}
