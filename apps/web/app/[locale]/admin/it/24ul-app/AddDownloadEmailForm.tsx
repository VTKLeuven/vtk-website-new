"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { addDownloadEmailAction } from "@/app/actions/urenloop-app";

export function AddDownloadEmailForm() {
  return (
    <SaveForm
      action={addDownloadEmailAction}
      submitLabel="Add"
      savingLabel="Adding..."
      savedMessage="Address added."
      errorMessages={{
        INVALID_EMAIL: "That is not a valid email address.",
        DUPLICATE_EMAIL: "That address is already on the list.",
      }}
      fallbackErrorMessage="Could not add the address."
      className="flex flex-wrap items-end gap-3"
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor="urenloop-email">Email address</Label>
        <Input
          id="urenloop-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="it@andere-kring.be"
        />
      </div>
      <div className="min-w-48 flex-1">
        <Label htmlFor="urenloop-note">Note (optional)</Label>
        <Input id="urenloop-note" name="note" autoComplete="off" placeholder="Which association" />
      </div>
    </SaveForm>
  );
}
