"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { saveKulDebugAction } from "@/app/actions/it";

// Superadmin-only tooling: copy stays in English (technical terms).
export function KulDebugForm({ enabled }: { enabled: boolean }) {
  return (
    <SaveForm
      action={saveKulDebugAction}
      submitLabel="Save"
      savingLabel="Saving..."
      savedMessage="Claim logging setting saved."
      fallbackErrorMessage="Could not update the debug setting."
      className="space-y-4"
    >
      <label className="flex items-start gap-2 text-sm text-vtk-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="mt-0.5"
        />
        <span>
          Log the raw claims KU Leuven returns on each login.
          <span className="mt-0.5 block text-xs text-zinc-500">
            Off by default. Captured claims contain personal data (name, e-mail,
            r-number, faculty); only the most recent logins are kept.
          </span>
        </span>
      </label>
    </SaveForm>
  );
}
