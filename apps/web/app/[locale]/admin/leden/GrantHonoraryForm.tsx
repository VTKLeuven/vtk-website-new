"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { grantHonoraryAction } from "@/app/actions/membership";
import { UserSearchField, type SearchUser } from "./UserSearchField";

/** Iemand erelid maken: een account zoeken en de vlag zetten. */
export function GrantHonoraryForm({ nl }: { nl: boolean }) {
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [resetKey, setResetKey] = useState(0);

  return (
    <SaveForm
      action={grantHonoraryAction}
      submitLabel={nl ? "Erelid maken" : "Make honorary member"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Erelid toegevoegd." : "Honorary member added."}
      submitDisabled={!selected}
      errorMessages={{
        INVALID_USER: nl
          ? "Kies eerst een account uit de lijst."
          : "Pick an account from the list first.",
        ALREADY_HONORARY: nl
          ? "Deze persoon is al erelid."
          : "This person is already an honorary member.",
      }}
      fallbackErrorMessage={
        nl ? "Erelid maken is mislukt." : "Adding the honorary member failed."
      }
      onSuccess={() => {
        setSelected(null);
        setResetKey((key) => key + 1);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      {selected ? <input type="hidden" name="userId" value={selected.id} /> : null}
      <UserSearchField
        key={resetKey}
        label={nl ? "Account zoeken" : "Find account"}
        selected={selected}
        onSelect={setSelected}
      />
    </SaveForm>
  );
}
