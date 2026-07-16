"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveSentryConfigAction } from "@/app/actions/it";
import type { SentryStatus } from "@/lib/runtimeConfig";

const errorMessages: Record<string, string> = {
  INVALID_INPUT: "Not saved: the DSN must be a valid URL.",
  SENTRY_DSN_REQUIRED: "Not saved: enter a DSN the first time.",
};

export function SentryConfigForm({ status }: { status: SentryStatus }) {
  const label =
    status.source === "database"
      ? "A DSN is stored in the database (managed here)."
      : status.source === "environment"
        ? "No stored DSN yet; currently using the environment variable."
        : "No DSN configured anywhere; Sentry is inert.";

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{label}</p>

      <SaveForm
        action={saveSentryConfigAction}
        submitLabel="Save Sentry DSN"
        savingLabel="Saving..."
        savedMessage="Sentry DSN saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the Sentry DSN."
        className="space-y-2"
      >
        <div>
          <Label>Sentry DSN</Label>
          <Input
            name="dsn"
            type="password"
            autoComplete="new-password"
            placeholder={
              status.hasDsn
                ? "•••••••• (leave blank to keep)"
                : "https://<key>@<org>.ingest.sentry.io/<project>"
            }
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Used for both server and client. The client DSN applies on the next page load; the
            server DSN takes effect after the next container restart (Sentry initializes at
            startup). The build-time source-map keys (SENTRY_ORG / SENTRY_PROJECT /
            SENTRY_AUTH_TOKEN) stay in .env.
          </p>
        </div>
      </SaveForm>
    </div>
  );
}
