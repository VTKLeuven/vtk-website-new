"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@vtk/ui";
import { saveMagazineAction } from "@/app/actions/media";

const ERRORS: Record<string, { nl: string; en: string }> = {
  missing_fields: { nl: "Vul soort, titel en editie in.", en: "Fill in kind, title, and issue." },
  missing_pdf: { nl: "Kies een PDF-bestand.", en: "Choose a PDF file." },
  pdf_too_large: { nl: "De PDF is groter dan 40 MB.", en: "The PDF is larger than 40 MB." },
  not_a_pdf: { nl: "Alleen PDF-bestanden zijn toegestaan.", en: "Only PDF files are allowed." },
  invalid_date: { nl: "De publicatiedatum is ongeldig.", en: "The publish date is invalid." },
};

export function MagazineUploadForm({ locale }: { locale: "nl" | "en" }) {
  const nl = locale === "nl";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"bakske" | "ir-reeel">("bakske");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await saveMagazineAction(new FormData(form));
      if (result.ok) {
        form.reset();
        setKind("bakske");
        setMessage(nl ? "Editie toegevoegd." : "Issue added.");
        startTransition(() => router.refresh());
      } else {
        const known = result.error ? ERRORS[result.error] : undefined;
        setError(known ? known[locale] : nl ? "Uploaden is mislukt." : "Upload failed.");
      }
    } catch {
      setError(nl ? "Uploaden is mislukt." : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label>{nl ? "Soort" : "Kind"}</Label>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value === "ir-reeel" ? "ir-reeel" : "bakske")}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="bakske">Het Bakske</option>
          <option value="ir-reeel">Ir.Reëel</option>
        </select>
      </div>
      <div>
        <Label>{nl ? "Publicatiedatum" : "Publish date"}</Label>
        <Input name="publishedAt" type="date" />
      </div>
      <div>
        <Label>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
        <Input
          name="titleNl"
          required
          defaultValue={kind === "bakske" ? "Het Bakske" : "Ir.Reëel"}
          key={`titleNl-${kind}`}
        />
      </div>
      <div>
        <Label>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
        <Input
          name="titleEn"
          defaultValue={kind === "bakske" ? "Het Bakske" : "Ir.Reëel"}
          key={`titleEn-${kind}`}
        />
      </div>
      <div>
        <Label>{nl ? "Editie (NL)" : "Issue (NL)"}</Label>
        <Input name="issueNl" required placeholder={nl ? "Week 8 / Semester 2, 2025-2026" : "Week 8 / Semester 2, 2025-2026"} />
      </div>
      <div>
        <Label>{nl ? "Editie (EN)" : "Issue (EN)"}</Label>
        <Input name="issueEn" placeholder="Week 8 / Semester 2, 2025-2026" />
      </div>
      <div className="md:col-span-2">
        <Label>PDF</Label>
        <input type="file" name="file" accept="application/pdf,.pdf" required className="block w-full text-sm" />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? (nl ? "Bezig met uploaden…" : "Uploading…") : nl ? "Editie toevoegen" : "Add issue"}
        </Button>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </form>
  );
}
