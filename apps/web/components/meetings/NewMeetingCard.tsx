"use client";

import type { MeetingKind } from "@prisma/client";
import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { createMeetingAction } from "@/app/actions/meetings";

/**
 * Eén losse vergadering bijzetten, buiten de kalender om: een verplaatste
 * grocomeet of een extra bureau. De kalender blijft voor het ritme van een
 * semester; dit is voor de uitzondering.
 */
export function NewMeetingCard({
  nl,
  kind,
  year,
}: {
  nl: boolean;
  kind: MeetingKind;
  year: number;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">
        {nl ? "Losse vergadering toevoegen" : "Add a single meeting"}
      </h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Voor een verplaatste of extra vergadering die niet in het ritme van de kalender past."
          : "For a moved or extra meeting that does not fit the calendar's rhythm."}
      </p>
      <SaveForm
        action={createMeetingAction}
        className="grid gap-3 sm:grid-cols-2"
        submitLabel={nl ? "Toevoegen" : "Add"}
        savingLabel={nl ? "Bezig..." : "Adding..."}
        savedMessage={nl ? "Vergadering toegevoegd" : "Meeting added"}
        errorMessages={
          nl ? { INVALID_DATE: "Geef een geldig moment op." } : { INVALID_DATE: "Enter a valid moment." }
        }
        fallbackErrorMessage={nl ? "Toevoegen mislukt." : "Adding failed."}
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="year" value={year} />
        <div>
          <Label>{nl ? "Wanneer" : "When"}</Label>
          <Input type="datetime-local" name="startsAt" required />
        </div>
        <div>
          <Label>{nl ? "Plaats (optioneel)" : "Location (optional)"}</Label>
          <Input name="location" />
        </div>
      </SaveForm>
    </Card>
  );
}
