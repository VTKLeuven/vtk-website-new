"use client";

import { useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveDoorConfigAction } from "@/app/actions/it";
import type { DoorStatus } from "@/lib/door-config";

const errorMessages: Record<string, string> = {
  INVALID_URL: "Not saved: the Pi address must be a valid http(s) URL.",
  INVALID_SECONDS: "Not saved: unlock seconds must be a number between 1 and 60.",
};

/**
 * Superadmin-config voor de deurscanner. Het device-secret authenticeert beide
 * richtingen (Pi -> site en site -> Pi); "Generate" vult een willekeurig secret in
 * dat je zichtbaar kan kopiëren naar de Pi (`DOOR_DEVICE_SECRET`). Na opslaan staat
 * het versleuteld en wordt het niet meer getoond.
 */
export function DoorConfigForm({ status }: { status: DoorStatus }) {
  const [secret, setSecret] = useState("");

  const source =
    status.source === "database" ? "stored in the database (managed here)" : "coming from the environment variables";

  function generate() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setSecret([...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Current configuration is {source}.{" "}
        {status.hasSecret
          ? "A device secret is set."
          : "No device secret set yet — the door API and remote open stay disabled until you set one."}
      </p>

      <SaveForm
        action={saveDoorConfigAction}
        submitLabel="Save door config"
        savingLabel="Saving..."
        savedMessage="Door config saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the door config."
        className="space-y-3"
      >
        <div>
          <Label>Pi address (Tailscale)</Label>
          <Input name="piUrl" defaultValue={status.piUrl ?? ""} placeholder="http://door-pi:8080" autoComplete="off" />
          <p className="mt-1 text-xs text-zinc-500">
            Base URL of the Pi&apos;s listener on the tailnet. The server calls &lt;address&gt;/open to open the door.
          </p>
        </div>

        <div>
          <Label>Unlock seconds</Label>
          <Input name="unlockSeconds" type="number" min={1} max={60} defaultValue={String(status.unlockSeconds)} />
          <p className="mt-1 text-xs text-zinc-500">How long the lock stays open per trigger.</p>
        </div>

        <div>
          <Label>Device secret</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              name="deviceSecret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={status.hasSecret ? "•••••••• (leave blank to keep)" : "shared secret for the Pi"}
              autoComplete="off"
              className="min-w-[240px] flex-1"
            />
            <Button type="button" variant="secondary" onClick={generate}>
              Generate
            </Button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Shared Bearer secret used both ways (Pi -&gt; site and site -&gt; Pi). Put the same value in the Pi&apos;s
            DOOR_DEVICE_SECRET. Copy it now; it is stored encrypted and not shown again.
          </p>
        </div>
      </SaveForm>
    </div>
  );
}
