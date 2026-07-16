"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { getDictionary } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { savePartnerAction } from "@/app/actions/pocs-partners";

export function NewPartnerForm({ locale }: { locale: "nl" | "en" }) {
  const [logoKey, setLogoKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const dict = getDictionary(locale);

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
    <SaveForm
      action={savePartnerAction}
      className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end [&>button]:justify-self-start"
      submitLabel={locale === "nl" ? "Toevoegen" : "Add"}
      savingLabel={dict.common.saving}
      savedMessage={locale === "nl" ? "Partner toegevoegd" : "Partner added"}
      errorMessages={saveErrorMessages(locale)}
      fallbackErrorMessage={dict.common.saveError}
      submitDisabled={!logoKey}
      onSuccess={() => setLogoKey("")}
    >
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
      <label className="inline-flex items-center gap-1 self-end text-sm">
        <input type="checkbox" name="active" defaultChecked />
        {locale === "nl" ? "Actief" : "Active"}
      </label>
    </SaveForm>
  );
}
