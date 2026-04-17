"use client";

import { useState, useTransition } from "react";
import { Button } from "@vtk/ui";
import { uploadPhotoAction } from "@/app/actions/albums";
import { useRouter } from "next/navigation";

export function PhotoUploader({ albumId, locale }: { albumId: string; locale: "nl" | "en" }) {
  const [busy, setBusy] = useState<{ total: number; done: number; errors: number } | null>(null);
  const [_, startTransition] = useTransition();
  const router = useRouter();

  async function handleFiles(files: FileList) {
    const arr = Array.from(files);
    setBusy({ total: arr.length, done: 0, errors: 0 });
    let done = 0;
    let errors = 0;
    for (const file of arr) {
      const form = new FormData();
      form.append("albumId", albumId);
      form.append("file", file);
      try {
        const result = await uploadPhotoAction(form);
        if (!result.ok) errors += 1;
      } catch {
        errors += 1;
      }
      done += 1;
      setBusy({ total: arr.length, done, errors });
    }
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <input
        id="album-upload"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        onClick={() => document.getElementById("album-upload")?.click()}
        disabled={Boolean(busy)}
      >
        {busy
          ? `${busy.done}/${busy.total}${busy.errors ? ` (${busy.errors} err)` : ""}`
          : locale === "nl"
          ? "Foto's uploaden"
          : "Upload photos"}
      </Button>
    </div>
  );
}
