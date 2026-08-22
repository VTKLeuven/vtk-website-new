"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveVaultConfigAction } from "@/app/actions/it";
import type { VaultStatus } from "@/lib/vault/config";

// Superadmin-only tooling: copy stays in English (technical terms).
const errorMessages: Record<string, string> = {
  INVALID_INPUT: "Not saved: check the fields (the URL must be a valid address).",
  VAULT_CLIENT_ID: "Not saved: the client ID must look like user.<uuid>.",
  VAULT_SECRET_REQUIRED: "Not saved: an API key is required the first time.",
  VAULT_ORG_KEY_REQUIRED: "Not saved: the organisation key is required the first time.",
  VAULT_ORG_KEY: "Not saved: the organisation key must be base64 of exactly 64 bytes.",
};

/**
 * Koppeling met de wachtwoordkluis (Vaultwarden).
 *
 * De organisatiesleutel hier is het gevoeligste gegeven van de hele site: er kan
 * elk gedeeld wachtwoord mee ontsleuteld worden. Ze staat versleuteld in de
 * database en wordt nooit teruggetoond. Zie docs/wachtwoorden.md voor hoe je ze
 * ophaalt en wat je doet wanneer ze moet roteren.
 */
export function VaultConfigForm({ status }: { status: VaultStatus }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        {status.configured
          ? "Configured. Members of linked posts are synchronised every five minutes."
          : "Not configured yet; the password vault tab stays empty until this is filled in."}
      </p>

      <SaveForm
        action={saveVaultConfigAction}
        submitLabel="Save vault config"
        savingLabel="Saving..."
        savedMessage="Vault configuration saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the vault configuration."
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Vaultwarden URL</Label>
            <Input
              name="url"
              defaultValue={status.url ?? ""}
              placeholder="https://wachtwoorden.vtk.be"
              required
            />
          </div>
          <div>
            <Label>Organisation ID</Label>
            <Input name="orgId" defaultValue={status.orgId ?? ""} required />
          </div>
          <div>
            <Label>Bot client ID</Label>
            <Input
              name="clientId"
              defaultValue={status.clientId ?? ""}
              placeholder="user.<uuid>"
              required
            />
          </div>
          <div>
            <Label>Bot API key</Label>
            <Input
              name="clientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={status.hasSecret ? "Stored; leave empty to keep" : "Required"}
            />
          </div>
          <div>
            <Label>Organisation key (base64, 64 bytes)</Label>
            <Input
              name="orgKey"
              type="password"
              autoComplete="new-password"
              placeholder={status.hasOrgKey ? "Stored; leave empty to keep" : "Required"}
            />
          </div>
        </div>
      </SaveForm>
    </div>
  );
}
