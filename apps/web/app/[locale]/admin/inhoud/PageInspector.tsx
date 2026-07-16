"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, ConfirmDialog, Input, Label, Select, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { deletePageAction, savePageAction } from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";
import { contentErrorMessages } from "./messages";
import { InspectorHead } from "./TabInspector";
import { FileUploader } from "./FileUploader";
import { AssetList } from "./AssetList";
import type { PageNode, RoleOption, TabNode } from "./ContentManager";

/**
 * Instellingen van een pagina in de rechterkolom: slug, categorie, publicatie,
 * bewerkrollen en bijlagen. `page: null` is een nieuwe pagina. De inhoud zelf
 * bewerk je in /admin/paginas (knop bovenaan).
 */
export function PageInspector({
  locale,
  page,
  tabs,
  roles,
  defaultTabId = null,
  canDelete,
  onClose,
}: {
  locale: Locale;
  page: PageNode | null;
  tabs: TabNode[];
  roles: RoleOption[];
  defaultTabId?: string | null;
  canDelete: boolean;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const uid = useId();
  const base = nl ? "" : "/en";

  return (
    <Card className="p-5">
      <InspectorHead
        title={page ? page.titleNl : nl ? "Nieuwe pagina" : "New page"}
        subtitle={page ? `/${page.slug}` : undefined}
        onClose={onClose}
      />

      {page && (
        <div className="mb-5">
          <Link
            href={`${base}/admin/paginas/${page.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-vtk-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {nl ? "Inhoud bewerken" : "Edit content"}
          </Link>
        </div>
      )}

      <SaveForm
        action={savePageAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
        // Een nieuwe pagina bestaat na het opslaan; het formulier blijft anders in
        // "nieuw"-modus staan en zou bij een tweede klik dezelfde slug hergebruiken.
        onSuccess={page ? undefined : onClose}
      >
        {page && <input type="hidden" name="id" value={page.id} />}
        <input type="hidden" name="order" value={page?.order ?? 0} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-titleNl`}>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
            <Input
              id={`${uid}-titleNl`}
              name="titleNl"
              defaultValue={page?.titleNl ?? ""}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-titleEn`}>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
            <Input id={`${uid}-titleEn`} name="titleEn" defaultValue={page?.titleEn ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-slug`}>Slug</Label>
            <Input
              id={`${uid}-slug`}
              name="slug"
              defaultValue={page?.slug ?? ""}
              pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-headerTabId`}>{nl ? "Categorie" : "Category"}</Label>
            <Select
              id={`${uid}-headerTabId`}
              name="headerTabId"
              defaultValue={page?.headerTabId ?? defaultTabId ?? ""}
            >
              <option value="">— {nl ? "niet gekoppeld" : "unlinked"} —</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {nl ? t.labelNl : t.labelEn} (/{t.slug})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="visibleInHeader"
              defaultChecked={page?.visibleInHeader ?? true}
            />
            {nl ? "Tonen in overzicht" : "Show in overview"}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={page?.published ?? false} />
            {nl ? "Gepubliceerd" : "Published"}
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="needsYearlyEdit"
              defaultChecked={page?.needsYearlyEdit ?? false}
            />
            {nl ? "Jaarlijks nakijken" : "Yearly review"}
          </label>
        </div>
        <p className="-mt-3 text-xs text-[#5c667f]">
          {nl
            ? "Jaarlijks nakijken: de pagina bevat info die elk werkingsjaar verandert (namen, nummers, ...) en komt bovenaan het paginabeheer tot ze dat jaar bewerkt is."
            : "Yearly review: the page holds info that changes every working year (names, numbers, ...) and stays on top of the pages admin until it has been edited that year."}
        </p>

        <fieldset className="space-y-2 border-t border-vtk-blue/10 pt-5">
          <legend className="text-sm font-semibold text-vtk-ink">
            {nl ? "Wie mag de inhoud bewerken?" : "Who can edit the content?"}
          </legend>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Leden met een aangevinkte rol (en het recht \"Toegewezen pagina's bewerken\") kunnen deze pagina bewerken. Zonder rollen kan enkel \"Alle pagina's bewerken\" of een superadmin erbij."
              : "Members holding a checked role (plus the \"Edit assigned pages\" permission) can edit this page. With no roles, only \"Edit all pages\" or a super admin can."}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {roles.map((role) => (
              <label key={role.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="editorRoleIds"
                  value={role.id}
                  defaultChecked={page?.editorRoleIds.includes(role.id) ?? false}
                />
                {role.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 border-t border-vtk-blue/10 pt-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-excerptNl`}>
              {nl ? "Korte beschrijving (NL)" : "Excerpt (NL)"}
            </Label>
            <Textarea
              id={`${uid}-excerptNl`}
              name="excerptNl"
              rows={2}
              defaultValue={page?.excerptNl ?? ""}
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Verschijnt op de kaart op de categoriepagina."
                : "Shows on the card on the category page."}
            </p>
          </div>
          <div>
            <Label htmlFor={`${uid}-excerptEn`}>
              {nl ? "Korte beschrijving (EN)" : "Excerpt (EN)"}
            </Label>
            <Textarea
              id={`${uid}-excerptEn`}
              name="excerptEn"
              rows={2}
              defaultValue={page?.excerptEn ?? ""}
            />
          </div>
        </div>
      </SaveForm>

      <div className="mt-6 border-t border-vtk-blue/10 pt-5">
        <h3 className="mb-3 text-sm font-semibold text-vtk-ink">
          {nl ? "Bijlagen & downloads" : "Attachments & downloads"}
        </h3>
        {page ? (
          <>
            <AssetList locale={locale} pageId={page.id} assets={page.assets} />
            <FileUploader pageId={page.id} locale={locale} />
          </>
        ) : (
          <p className="text-sm text-[#5c667f]">
            {nl
              ? "Sla de pagina eerst op; daarna kan je bestanden toevoegen."
              : "Save the page first; you can add files afterwards."}
          </p>
        )}
      </div>

      {page && canDelete && (
        <div className="mt-6 border-t border-vtk-blue/10 pt-5">
          <DeletePageButton locale={locale} page={page} onDeleted={onClose} />
        </div>
      )}
    </Card>
  );
}

function DeletePageButton({
  locale,
  page,
  onDeleted,
}: {
  locale: Locale;
  page: PageNode;
  onDeleted: () => void;
}) {
  const nl = locale === "nl";
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", page.id);
    startTransition(async () => {
      await deletePageAction(SAVE_IDLE, form);
      setConfirming(false);
      onDeleted();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(true)}>
        {nl ? "Pagina verwijderen" : "Delete page"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={nl ? "Pagina verwijderen?" : "Delete page?"}
        description={
          nl
            ? `"${page.titleNl}" (/${page.slug}) wordt permanent verwijderd, samen met ${page.assets.length} bijlage(n). Dit kan niet ongedaan gemaakt worden.`
            : `"${page.titleNl}" (/${page.slug}) will be permanently deleted, along with ${page.assets.length} attachment(s). This cannot be undone.`
        }
        confirmLabel={nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
