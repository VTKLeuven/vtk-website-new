"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageContentAction } from "@/app/actions/pages";
import { saveErrorMessages } from "@/lib/saveMessages";
import { AssetList } from "../../inhoud/AssetList";
import { FileUploader } from "../../inhoud/FileUploader";
import type { AssetNode } from "../../inhoud/ContentManager";

type EditorPage = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  category: { slug: string; label: string } | null;
  published: boolean;
  needsYearlyEdit: boolean;
  needsReview: boolean;
  assets: AssetNode[];
};

/**
 * Volledige inhoudseditor van één pagina: taaltabs (NL, EN), titel + markdown
 * per taal, en de bijlagen. Een lege EN-versie betekent "geen Engelse versie":
 * de site valt dan terug op NL.
 */
export function PageContentEditor({
  locale,
  page,
  initialNl,
  initialEn,
  convertedFromLegacy,
}: {
  locale: Locale;
  page: EditorPage;
  initialNl: string;
  initialEn: string;
  convertedFromLegacy: boolean;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const uid = useId();
  const base = nl ? "" : "/en";

  const [lang, setLang] = useState<"nl" | "en">("nl");
  const [contentNl, setContentNl] = useState(initialNl);
  const [contentEn, setContentEn] = useState(initialEn);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`${base}/admin/paginas`}
            className="text-sm font-medium text-[#5c667f] hover:text-vtk-ink"
          >
            &larr; {nl ? "Alle pagina's" : "All pages"}
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold">{page.titleNl}</h1>
          <p className="mt-1 text-sm text-[#5c667f]">
            <span className="font-mono text-[12px]">/{page.slug}</span>
            {page.category ? ` · ${page.category.label}` : ""} ·{" "}
            {page.published ? (nl ? "gepubliceerd" : "published") : nl ? "concept" : "draft"}
          </p>
        </div>
        {page.published && (
          <a
            href={`${base}/p/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-vtk-blue/20 px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {nl ? "Bekijk pagina" : "View page"}
          </a>
        )}
      </div>

      {page.needsReview && (
        <p className="rounded-xl border border-vtk-yellow-dark/30 bg-vtk-yellow/10 px-4 py-3 text-sm text-[#34405e]">
          {nl
            ? "Deze pagina bevat jaarlijkse info (namen, nummers, ...) en is dit werkingsjaar nog niet nagekeken. Kijk de inhoud na en sla op; daarmee is ze afgevinkt."
            : "This page holds yearly info (names, numbers, ...) and has not been reviewed this working year. Check the content and save; that ticks it off."}
        </p>
      )}

      {convertedFromLegacy && (
        <p className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 px-4 py-3 text-sm text-[#34405e]">
          {nl
            ? "Deze pagina is automatisch omgezet van de oude editor naar markdown. Kijk het resultaat na (ook het voorbeeld) en sla op om de omzetting definitief te maken."
            : "This page was automatically converted from the old editor to markdown. Review the result (preview included) and save to make the conversion final."}
        </p>
      )}

      <Card className="p-5">
        <SaveForm
          action={savePageContentAction}
          className="space-y-5"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          errorMessages={saveErrorMessages(locale)}
          fallbackErrorMessage={dict.common.saveError}
        >
          <input type="hidden" name="id" value={page.id} />
          <input type="hidden" name="contentMdNl" value={contentNl} />
          <input type="hidden" name="contentMdEn" value={contentEn} />

          <div className="flex rounded-lg border border-vtk-blue/15 p-0.5 w-fit" role="tablist">
            <LangTab active={lang === "nl"} onClick={() => setLang("nl")}>
              Nederlands
            </LangTab>
            <LangTab active={lang === "en"} onClick={() => setLang("en")}>
              English
              {contentEn.trim() === "" && (
                <span className="ml-1.5 text-[10px] font-normal opacity-70">
                  {nl ? "leeg" : "empty"}
                </span>
              )}
            </LangTab>
          </div>

          {/* Beide talen blijven gemount zodat er niets verloren gaat bij het
              wisselen; de inactieve taal is enkel verborgen. */}
          <div className={lang === "nl" ? "space-y-4" : "hidden"}>
            {/* Geen `required`: dit veld kan verborgen zijn (EN-tab actief) en een
                verborgen ongeldig veld blokkeert de submit geluidloos. De action
                valideert en antwoordt met een rode toast. */}
            <div className="max-w-xl">
              <Label htmlFor={`${uid}-titleNl`}>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
              <Input id={`${uid}-titleNl`} name="titleNl" defaultValue={page.titleNl} />
            </div>
            <MarkdownEditor value={contentNl} onChange={setContentNl} locale={locale} />
          </div>

          <div className={lang === "en" ? "space-y-4" : "hidden"}>
            <div className="max-w-xl">
              <Label htmlFor={`${uid}-titleEn`}>Title (EN)</Label>
              <Input id={`${uid}-titleEn`} name="titleEn" defaultValue={page.titleEn ?? ""} />
            </div>
            <MarkdownEditor value={contentEn} onChange={setContentEn} locale={locale} />
            <p className="text-xs text-[#5c667f]">
              {nl
                ? "Laat leeg om geen Engelse versie te tonen; de site valt dan terug op het Nederlands."
                : "Leave empty to publish no English version; the site falls back to Dutch."}
            </p>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-vtk-ink">
          {nl ? "Bijlagen & downloads" : "Attachments & downloads"}
        </h2>
        <p className="mb-3 text-xs text-[#5c667f]">
          {nl
            ? "PDF's horen hier thuis, niet in de inhoud zelf. Downloads verschijnen onderaan de pagina."
            : "PDFs belong here, not in the content itself. Downloads appear at the bottom of the page."}
        </p>
        <AssetList locale={locale} pageId={page.id} assets={page.assets} />
        <FileUploader pageId={page.id} locale={locale} />
      </Card>
    </div>
  );
}

function LangTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-vtk-ink text-white" : "text-[#5c667f] hover:text-vtk-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
