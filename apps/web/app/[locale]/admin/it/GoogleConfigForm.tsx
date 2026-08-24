"use client";

import { Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveGoogleConfigAction } from "@/app/actions/it";
import type { GoogleStatus } from "@/lib/google/config";

// Superadmin-only tooling: copy stays in English (technical terms).
const errorMessages: Record<string, string> = {
  INVALID_INPUT: "Not saved: check the fields.",
  GOOGLE_KEY_REQUIRED: "Not saved: the private key is required the first time.",
  GOOGLE_KEY_INVALID: "Not saved: that does not look like a PEM private key.",
};

/**
 * Google Workspace link (group addresses).
 *
 * This is a service account with domain-wide delegation: within the granted
 * scopes it can act on the whole domain, so the key is stored encrypted and
 * never shown again. Grant only the scopes listed in lib/google/client.ts.
 */
export function GoogleConfigForm({ status }: { status: GoogleStatus }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        {status.configured
          ? `Configured. Group addresses are synchronised every five minutes. Link gate is ${status.linkGateEnabled ? "on" : "off"}.`
          : "Not configured yet. Everything stays dormant: no synchronisation, no link gate, and the admin screens only let you prepare lists."}
      </p>

      <SaveForm
        action={saveGoogleConfigAction}
        submitLabel="Save Google config"
        savingLabel="Saving..."
        savedMessage="Google configuration saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the Google configuration."
        resetOnSuccess={false}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Domain</Label>
            <Input name="domain" defaultValue={status.domain ?? ""} placeholder="vtk.be" required />
          </div>
          <div>
            <Label>Admin to impersonate</Label>
            <Input
              name="subject"
              type="email"
              defaultValue={status.subject ?? ""}
              placeholder="it@vtk.be"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Service account (client_email)</Label>
            <Input
              name="clientEmail"
              type="email"
              defaultValue={status.clientEmail ?? ""}
              placeholder="vtk-site@project.iam.gserviceaccount.com"
              required
            />
          </div>
          <div>
            <Label>Full org unit</Label>
            <Input name="fullOrgUnit" defaultValue={status.fullOrgUnit ?? ""} placeholder="/" />
          </div>
          <div>
            <Label>Restricted org unit (kiesploeg)</Label>
            <Input
              name="restrictedOrgUnit"
              defaultValue={status.restrictedOrgUnit ?? ""}
              placeholder="/Kiesploeg/Beperkt"
            />
            <p className="mt-1 text-xs text-zinc-500">
              The OU that carries the routing rule refusing outbound mail from the primary
              address. That rule is Admin console work; there is no API for it. Leave empty and
              nobody is moved, which also means nothing stops them from sending.
            </p>
          </div>
          <div>
            <Label>OAuth client ID (self-service linking)</Label>
            <Input
              name="oauthClientId"
              defaultValue={status.oauthClientId ?? ""}
              placeholder="....apps.googleusercontent.com"
            />
          </div>
          <div>
            <Label>OAuth client secret</Label>
            <Input
              name="oauthClientSecret"
              type="password"
              autoComplete="new-password"
              placeholder={status.hasOauthSecret ? "Stored; leave empty to keep" : "Optional"}
            />
            <p className="mt-1 text-xs text-zinc-500">
              A separate web client, not the service account. Redirect URI:{" "}
              <code>&lt;site&gt;/api/google/link/callback</code>. Without it members cannot link
              their own account and the link gate only shows an explanation.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Private key (PEM from the JSON key file)</Label>
            <Textarea
              name="privateKey"
              rows={4}
              autoComplete="off"
              placeholder={
                status.hasKey
                  ? "Stored; leave empty to keep"
                  : "-----BEGIN PRIVATE KEY-----\\n..."
              }
            />
            <p className="mt-1 text-xs text-zinc-500">
              Paste the <code>private_key</code> value; literal <code>\n</code> sequences are
              converted. Domain-wide delegation must be granted for this client ID with the
              scopes in <code>lib/google/client.ts</code>, otherwise every call returns
              <code> unauthorized_client</code>.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="linkGateEnabled"
            defaultChecked={status.linkGateEnabled}
            className="mt-1"
          />
          <span>
            Require members with a post to link their VTK account
            <span className="block text-xs text-zinc-500">
              Off by default. With this on, every member holding a post or work group this
              working year is redirected to /koppel-vtk-account until they link. Only turn it
              on once the OAuth client works and the accounts exist, otherwise everybody just
              clicks &quot;I do not have an account yet&quot;. Takes up to a minute to take
              effect (the setting is cached).
            </span>
          </span>
        </label>
      </SaveForm>
    </div>
  );
}
