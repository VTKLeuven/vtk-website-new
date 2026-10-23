"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveLightroomConfigAction } from "@/app/actions/it";
import type { LightroomConfigStatus } from "@/lib/lightroom";

const errorMessages: Record<string, string> = {
  INVALID_URL: "Not saved: the API address must be a valid http(s) URL.",
  TOKEN_TOO_SHORT: "Not saved: the token is shorter than kenny accepts (24 characters).",
  ACCOUNT_TOO_LONG: "Not saved: the Parsec account is at most 80 characters.",
};

/**
 * Superadmin-config voor de Lightroom-pc: waar kenny's lightroom-api luistert en
 * met welk token. Het token maakt kenny (`/etc/lightroom-vm/api-token`); de site
 * genereert het dus niet, ze bewaart het enkel, versleuteld.
 */
export function LightroomConfigForm({ status }: { status: LightroomConfigStatus }) {
  const source =
    status.source === "database" ? "stored in the database (managed here)" : "coming from the environment variables";

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Current configuration is {source}.{" "}
        {status.hasToken
          ? "A token is set."
          : "No token set yet: /admin/lightroom says the link is not set up until you set one."}
      </p>

      <SaveForm
        action={saveLightroomConfigAction}
        submitLabel="Save Lightroom config"
        savingLabel="Saving..."
        savedMessage="Lightroom config saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the Lightroom config."
        className="space-y-3"
      >
        <div>
          <Label>API address (Tailscale)</Label>
          <Input
            name="apiUrl"
            defaultValue={status.apiUrl ?? ""}
            placeholder="http://100.114.7.25:8765"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Where lightroom-api listens on kenny: its Tailscale address (lightroom-api.service). The site calls
            &lt;address&gt;/lightroom/status, /start and /stop.
          </p>
        </div>

        <div>
          <Label>API token</Label>
          <Input
            name="token"
            placeholder={status.hasToken ? "•••••••• (leave blank to keep)" : "token from kenny"}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            The Bearer token kenny checks: <span className="font-mono">sudo cat /etc/lightroom-vm/api-token</span> on
            kenny. Stored encrypted and not shown again.
          </p>
        </div>

        <div>
          <Label>Parsec account of the PC</Label>
          <Input
            name="parsecAccount"
            defaultValue={status.parsecAccount ?? ""}
            placeholder="vtk_it#20609838"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            The account the VM hosts on. /admin/lightroom tells people to ask IT to add them as a friend of it.
          </p>
        </div>
      </SaveForm>
    </div>
  );
}
