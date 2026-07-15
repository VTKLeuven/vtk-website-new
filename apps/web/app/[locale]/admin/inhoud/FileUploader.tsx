"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { addPageAssetAction } from "@/app/actions/pages";

export function FileUploader({ pageId, locale }: { pageId: string; locale: Locale }) {
  const nl = locale === "nl";
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"EMBEDDED_PDF" | "DOWNLOAD">("DOWNLOAD");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Ref i.p.v. een vaste element-id: er kunnen meerdere uploaders op één scherm staan.
  const fileInput = useRef<HTMLInputElement>(null);
  const uid = useId();

  async function handleUpload(file: File) {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind === "EMBEDDED_PDF" ? "pdf" : "file");
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    if (!res.ok) {
      setError(nl ? "Upload mislukt" : "Upload failed");
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
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  return (
    <div className="mt-4 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
      <div>
        <Label htmlFor={`${uid}-label`}>Label</Label>
        <Input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={nl ? "bv. Reglement" : "e.g. Rules"}
        />
      </div>
      <div>
        <Label htmlFor={`${uid}-kind`}>Type</Label>
        <Select
          id={`${uid}-kind`}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="DOWNLOAD">Download</option>
          <option value="EMBEDDED_PDF">PDF embed</option>
        </Select>
      </div>
      <div>
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <Button type="button" onClick={() => fileInput.current?.click()} disabled={pending}>
          {pending
            ? nl
              ? "Bezig..."
              : "Uploading..."
            : nl
              ? "Bestand uploaden"
              : "Upload file"}
        </Button>
      </div>
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
