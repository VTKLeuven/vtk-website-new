"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { grantMembershipAction } from "@/app/actions/membership";
import { UserSearchField, type SearchUser } from "./UserSearchField";

/** Iemand handmatig lid maken, zonder betaling. */
export function GrantMembershipForm({ nl, year }: { nl: boolean; year: number }) {
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const t = nl
    ? {
        search: "Lid zoeken",
        note: "Notitie (optioneel)",
        notePlaceholder: "Bv. cash betaald aan de toog",
        submit: "Lid maken",
        saving: "Bezig...",
        saved: "Lidmaatschap toegekend.",
      }
    : {
        search: "Find member",
        note: "Note (optional)",
        notePlaceholder: "E.g. paid cash at the bar",
        submit: "Make member",
        saving: "Saving...",
        saved: "Membership granted.",
      };

  return (
    <SaveForm
      action={grantMembershipAction}
      submitLabel={t.submit}
      savingLabel={t.saving}
      savedMessage={t.saved}
      submitDisabled={!selected}
      errorMessages={{
        INVALID_USER: nl ? "Kies eerst een lid uit de lijst." : "Pick a member from the list first.",
        ALREADY_MEMBER: nl
          ? "Dit lid heeft dit academiejaar al een lidmaatschap."
          : "This member already has a membership this academic year.",
      }}
      fallbackErrorMessage={nl ? "Lid maken is mislukt." : "Granting the membership failed."}
      onSuccess={() => {
        setSelected(null);
        setResetKey((key) => key + 1);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="year" value={year} />
      {selected ? <input type="hidden" name="userId" value={selected.id} /> : null}

      <UserSearchField
        key={resetKey}
        label={t.search}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="w-72">
        <Label>{t.note}</Label>
        <Input name="note" placeholder={t.notePlaceholder} maxLength={500} />
      </div>
    </SaveForm>
  );
}
