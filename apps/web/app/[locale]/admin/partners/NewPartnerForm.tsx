"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { savePartnerAction } from "@/app/actions/pocs-partners";

export function NewPartnerForm({ locale }: { locale: "nl" | "en" }) {
  const [logoKey, setLogoKey] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "logo");
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    if (!res.ok) {
      setErr("Upload failed");
      return;
    }
    const data = (await res.json()) as { key: string };
    setLogoKey(data.key);
  }

  return (
    <form action={savePartnerAction} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <input type="hidden" name="logoKey" value={logoKey} />
      <div>
        <Label>{locale === "nl" ? "Logo" : "Logo"}</Label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="text-sm"
        />
        {logoKey && <p className="text-xs text-green-600 mt-1">✓ uploaded</p>}
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
      <div><Label>Name</Label><Input name="name" required /></div>
      <div><Label>URL</Label><Input name="url" placeholder="https://..." /></div>
      <div className="flex items-end gap-2">
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked />
          {locale === "nl" ? "Actief" : "Active"}
        </label>
        <Button type="submit" disabled={!logoKey || pending}>
          {locale === "nl" ? "Toevoegen" : "Add"}
        </Button>
      </div>
    </form>
  );
}
