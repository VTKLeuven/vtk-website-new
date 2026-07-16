"use client";

import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveS3ConfigAction } from "@/app/actions/it";
import type { S3Status } from "@/lib/runtimeConfig";
import { S3TestButton } from "./S3TestButton";

// Superadmin-only tooling: copy stays in English (technical terms).
const errorMessages: Record<string, string> = {
  INVALID_INPUT: "Not saved: check the fields (the endpoint must be a valid URL).",
  S3_SECRET_REQUIRED: "Not saved: a secret key is required the first time.",
};

export function S3ConfigForm({ status }: { status: S3Status }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        {status.source === "database"
          ? "Loaded from the database (managed here)."
          : "No stored config yet; currently falling back to environment variables."}
      </p>

      <SaveForm
        action={saveS3ConfigAction}
        submitLabel="Save S3 config"
        savingLabel="Saving..."
        savedMessage="S3 configuration saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the S3 configuration."
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Endpoint</Label>
            <Input
              name="endpoint"
              defaultValue={status.endpoint ?? ""}
              placeholder="https://fsn1.your-objectstorage.com"
              required
            />
          </div>
          <div>
            <Label>Bucket</Label>
            <Input name="bucket" defaultValue={status.bucket ?? ""} required />
          </div>
          <div>
            <Label>Region</Label>
            <Input name="region" defaultValue={status.region ?? ""} placeholder="fsn1" required />
          </div>
          <div>
            <Label>Access key ID</Label>
            <Input name="accessKeyId" defaultValue={status.accessKeyId ?? ""} required />
          </div>
          <div>
            <Label>Secret access key</Label>
            <Input
              name="secretAccessKey"
              type="password"
              autoComplete="new-password"
              placeholder={status.hasSecret ? "•••••••• (leave blank to keep)" : "required"}
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-vtk-ink">
          <input type="checkbox" name="forcePathStyle" defaultChecked={status.forcePathStyle} />
          Force path-style URLs (recommended for Hetzner Object Storage)
        </label>
      </SaveForm>

      <div className="border-t border-vtk-blue/10 pt-4">
        <S3TestButton />
      </div>
    </div>
  );
}
