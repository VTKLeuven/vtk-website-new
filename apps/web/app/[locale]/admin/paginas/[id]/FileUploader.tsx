"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@vtk/ui";
import { addPageAssetAction } from "@/app/actions/pages";

export function FileUploader({ pageId, locale }: { pageId: string; locale: "nl" | "en" }) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"EMBEDDED_PDF" | "DOWNLOAD">("DOWNLOAD");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind === "EMBEDDED_PDF" ? "pdf" : "file");
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    if (!res.ok) {
      setError("Upload failed");
      return;
    }
    const data = (await res.json()) as { key: string; size: number; mime: string; name: string };

    const submit = new FormData();
    submit.append("pageId", pageId);
    submit.append("storageKey", data.key);
    submit.append("kind", kind);
    submit.append("labelNl", label || file.name);
    submit.append("sizeBytes", String(data.size));
    submit.append("mimeType", data.mime);

    startTransition(async () => {
      await addPageAssetAction(submit);
      setLabel("");
    });
  }

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
      <div>
        <Label>{locale === "nl" ? "Label" : "Label"}</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={locale === "nl" ? "bv. Reglement" : "e.g. Rules"} />
      </div>
      <div>
        <Label>Type</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="DOWNLOAD">Download</option>
          <option value="EMBEDDED_PDF">PDF embed</option>
        </Select>
      </div>
      <div>
        <input
          id="file-upload"
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button type="button" onClick={() => document.getElementById("file-upload")?.click()} disabled={pending}>
          {pending ? (locale === "nl" ? "Bezig..." : "Uploading...") : (locale === "nl" ? "Bestand uploaden" : "Upload file")}
        </Button>
      </div>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
