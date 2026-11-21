"use client";

import { useId, useState } from "react";
import Link from "@/components/ui/Link";
import { QrCode } from "lucide-react";
import { Card } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import {
  BilingualGroup,
  BilingualInput,
  BilingualMarkdown,
} from "@/components/admin/BilingualField";
import { SaveForm } from "@/components/ui/SaveForm";
import { savePageContentAction } from "@/app/actions/pages";
import { hasFormMarker } from "@/lib/pageForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { AssetList } from "../../inhoud/AssetList";
import { FileUploader } from "../../inhoud/FileUploader";
import type { AssetNode } from "../../inhoud/ContentManager";
import { PageCategoryImageCard } from "./PageCategoryImageCard";
import { PageWerkingCard, type WerkingOption } from "./PageWerkingCard";
import { PageSettingsCard, type SettingsRole } from "./PageSettingsCard";
import {
  PageFormCard,
  type LinkedForm,
  type PageFormGroup,
  type PageFormOption,
} from "./PageFormCard";
import { PageQrModal } from "../PageQrModal";

type EditorPage = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  imageKey: string | null;
  imageCaptionNl: string | null;
  imageCaptionEn: string | null;
  imageFocusX: number;
  imageFocusY: number;
  /** De post achter deze pagina, of null wanneer ze bij geen enkele hoort. */
  groupId: string | null;
  category: { slug: string; label: string } | null;
  published: boolean;
  needsYearlyEdit: boolean;
  needsReview: boolean;
  editorRoleIds: string[];
  assets: AssetNode[];
  /** Het formulier dat op deze pagina staat, als er een gekoppeld is. */
  form: LinkedForm | null;
};

/**
 * Volledige inhoudseditor van één pagina: taaltabs (NL, EN), titel + markdown
 * per taal, en de bijlagen. Een lege EN-versie betekent "geen Engelse versie":
 * de site valt dan terug op NL.
 */
export function PageContentEditor({
  host,
  locale,
  page,
  initialNl,
  initialEn,
  convertedFromLegacy,
  roles,
  myRoleIds,
  canEditAll,
  canDelete,
  canPublish,
  linkableForms,
  formGroups,
  werkingGroups,
}: {
  host: string;
  locale: Locale;
  page: EditorPage;
  initialNl: string;
  initialEn: string;
  convertedFromLegacy: boolean;
  roles: SettingsRole[];
  myRoleIds: string[];
  canEditAll: boolean;
  canDelete: boolean;
  canPublish: boolean;
  /** Formulieren die deze gebruiker beheert en die nog nergens anders staan. */
  linkableForms: PageFormOption[];
  /** Posten waarvoor deze gebruiker een formulier mag aanmaken. */
  formGroups: PageFormGroup[];
  /** Alle actieve posten, om deze pagina aan een werking te hangen. */
  werkingGroups: WerkingOption[];
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const uid = useId();
  const base = nl ? "" : "/en";

  const [contentNl, setContentNl] = useState(initialNl);
  const [contentEn, setContentEn] = useState(initialEn);
  const [qrOpen, setQrOpen] = useState(false);

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/20 px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            <QrCode size={16} aria-hidden="true" />
            {nl ? "QR-code" : "QR code"}
          </button>
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

          <BilingualGroup
            locale={locale}
            enHint={
              nl
                ? "Laat leeg om geen Engelse versie te tonen; de site valt dan terug op het Nederlands."
                : "Leave empty to publish no English version; the site falls back to Dutch."
            }
          >
            <BilingualInput
              label={nl ? "Titel" : "Title"}
              nameNl="titleNl"
              nameEn="titleEn"
              defaultValueNl={page.titleNl}
              defaultValueEn={page.titleEn ?? ""}
              idPrefix={`${uid}-title`}
              className="max-w-xl"
            />
            <BilingualMarkdown
              nameNl="contentMdNl"
              nameEn="contentMdEn"
              valueNl={contentNl}
              valueEn={contentEn}
              onChangeNl={setContentNl}
              onChangeEn={setContentEn}
              locale={locale}
              idPrefix={`${uid}-md`}
            />
          </BilingualGroup>
        </SaveForm>
      </Card>

      <PageCategoryImageCard
        locale={locale}
        pageId={page.id}
        pageTitle={page.titleNl}
        imageKey={page.imageKey}
        captionNl={page.imageCaptionNl}
        captionEn={page.imageCaptionEn}
        focus={{ x: page.imageFocusX, y: page.imageFocusY }}
      />

      <PageWerkingCard
        locale={locale}
        pageId={page.id}
        groupId={page.groupId}
        groups={werkingGroups}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-vtk-ink">
          {nl ? "Bijlagen & downloads" : "Attachments & downloads"}
        </h2>
        <p className="mb-3 text-xs text-[#5c667f]">
          {nl
            ? "Downloads die automatisch onderaan de pagina verschijnen. Bestanden of PDF's kunnen ook rechtstreeks in de tekst gelinkt worden via de editor hierboven."
            : "Downloads that automatically appear at the bottom of the page. Files or PDFs can also be linked directly in the text via the editor above."}
        </p>
        <AssetList locale={locale} pageId={page.id} assets={page.assets} />
        <FileUploader pageId={page.id} locale={locale} />
      </Card>

      <PageFormCard
        locale={locale}
        pageId={page.id}
        pageTitle={page.titleNl}
        linked={page.form}
        forms={linkableForms}
        groups={formGroups}
        // De markering leest mee met wat er nu in de editor staat, niet met wat
        // er bij het laden opgeslagen was: anders zegt de kaart nog "onderaan"
        // terwijl je de markering net typte.
        hasMarker={hasFormMarker(contentNl) || hasFormMarker(contentEn)}
      />

      <PageSettingsCard
        locale={locale}
        pageId={page.id}
        roles={roles}
        myRoleIds={myRoleIds}
        canEditAll={canEditAll}
        canDelete={canDelete}
        canPublish={canPublish}
        pageTitle={page.titleNl}
        assetCount={page.assets.length}
        initialSlug={page.slug}
        initialPublished={page.published}
        initialNeedsYearlyEdit={page.needsYearlyEdit}
        initialRoleIds={page.editorRoleIds}
      />

      {qrOpen && (
        <PageQrModal
          host={host}
          nl={nl}
          page={{ slug: page.slug, title: page.titleNl, published: page.published }}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}
