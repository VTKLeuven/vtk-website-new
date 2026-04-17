"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { WysiwygEditor } from "@/components/editor/WysiwygEditor";
import { savePageAction } from "@/app/actions/pages";

type Page = {
  id?: string | null;
  slug?: string;
  headerTabId?: string | null;
  visibleInHeader?: boolean;
  titleNl?: string;
  titleEn?: string | null;
  excerptNl?: string | null;
  excerptEn?: string | null;
  contentJsonNl?: unknown;
  contentJsonEn?: unknown;
  publishedAt?: Date | string | null;
  order?: number;
};

type HeaderTab = { id: string; slug: string; labelNl: string; labelEn: string };

export function PageEditor({
  page,
  headerTabs,
  locale,
}: {
  page: Page;
  headerTabs: HeaderTab[];
  locale: "nl" | "en";
}) {
  const [contentNl, setContentNl] = useState<unknown>(
    page.contentJsonNl ?? { type: "doc", content: [{ type: "paragraph" }] }
  );
  const [contentEn, setContentEn] = useState<unknown>(
    page.contentJsonEn ?? { type: "doc", content: [{ type: "paragraph" }] }
  );
  const [showEn, setShowEn] = useState(Boolean(page.contentJsonEn || page.titleEn));

  return (
    <form action={savePageAction} className="space-y-5">
      {page.id && <input type="hidden" name="id" value={page.id} />}
      <input type="hidden" name="contentJsonNl" value={JSON.stringify(contentNl)} />
      <input type="hidden" name="contentJsonEn" value={showEn ? JSON.stringify(contentEn) : ""} />

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="titleNl">Titel (NL)</Label>
            <Input id="titleNl" name="titleNl" defaultValue={page.titleNl ?? ""} required />
          </div>
          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={page.slug ?? ""}
              pattern="[a-z0-9]([a-z0-9\\-]*[a-z0-9])?"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="headerTabId">Header</Label>
            <Select id="headerTabId" name="headerTabId" defaultValue={page.headerTabId ?? ""}>
              <option value="">— {locale === "nl" ? "geen (unlisted)" : "none (unlisted)"} —</option>
              {headerTabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {locale === "nl" ? t.labelNl : t.labelEn} (/{t.slug})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="visibleInHeader" defaultChecked={page.visibleInHeader ?? true} />
              {locale === "nl" ? "Zichtbaar in overzicht" : "Visible in overview"}
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={Boolean(page.publishedAt)} />
              {locale === "nl" ? "Gepubliceerd" : "Published"}
            </label>
            <div>
              <Label htmlFor="order" className="mb-0 mr-2 inline">#</Label>
              <Input
                id="order"
                name="order"
                type="number"
                defaultValue={page.order ?? 0}
                className="w-20 inline-block"
              />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="excerptNl">{locale === "nl" ? "Korte beschrijving (NL)" : "Excerpt (NL)"}</Label>
          <Textarea id="excerptNl" name="excerptNl" defaultValue={page.excerptNl ?? ""} rows={2} />
        </div>
      </Card>

      <Card className="p-5">
        <Label>{locale === "nl" ? "Inhoud (NL)" : "Content (NL)"}</Label>
        <WysiwygEditor value={contentNl} onChange={setContentNl} />
      </Card>

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showEn}
            onChange={(e) => setShowEn(e.target.checked)}
          />
          {locale === "nl" ? "Engelstalige versie toevoegen" : "Add English version"}
        </label>
      </div>

      {showEn && (
        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="titleEn">Title (EN)</Label>
              <Input id="titleEn" name="titleEn" defaultValue={page.titleEn ?? ""} />
            </div>
            <div>
              <Label htmlFor="excerptEn">Excerpt (EN)</Label>
              <Input id="excerptEn" name="excerptEn" defaultValue={page.excerptEn ?? ""} />
            </div>
          </div>
          <div>
            <Label>Content (EN)</Label>
            <WysiwygEditor value={contentEn} onChange={setContentEn} />
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Button type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
      </div>
    </form>
  );
}
