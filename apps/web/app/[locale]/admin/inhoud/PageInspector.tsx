"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, ConfirmDialog, Input, Label, Select, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { SlugField } from "@/components/ui/SlugField";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import {
  deletePageAction,
  savePageAction,
  unlinkPageFromTabAction,
} from "@/app/actions/pages";
import { contentErrorMessages } from "./messages";
import { InspectorHead } from "./TabInspector";
import type { PageNode, RoleOption, TabNode } from "./ContentManager";

/**
 * Instellingen van een pagina in de rechterkolom: titels, slug, categorie,
 * publicatie, bewerkrollen, excerpts en de knop naast de titel, plus
 * verwijderen onderaan.
 *
 * De INHOUD en de bijlagen horen hier niet: die zitten in de editor
 * (`/admin/paginas/[id]`, knop bovenaan). Dit scherm gaat over waar een pagina
 * hangt, hoe ze heet, en of ze nog moet bestaan.
 */
export function PageInspector({
  locale,
  page,
  tabs,
  roles,
  canDelete,
  onClose,
}: {
  locale: Locale;
  page: PageNode;
  tabs: TabNode[];
  roles: RoleOption[];
  /** `pages.delete`; zonder dat recht is er geen verwijderknop. */
  canDelete: boolean;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const uid = useId();
  const base = nl ? "" : "/en";
  const [slug, setSlug] = useState(page.slug);

  return (
    <Card className="p-5">
      <InspectorHead title={page.titleNl} subtitle={`/${page.slug}`} onClose={onClose} />

      <div className="mb-5">
        <Link
          href={`${base}/admin/paginas/${page.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-vtk-ink px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {nl ? "Inhoud bewerken" : "Edit content"}
        </Link>
      </div>

      <SaveForm
        action={savePageAction}
        className="space-y-5"
        submitLabel={dict.admin.save}
        savingLabel={dict.common.saving}
        savedMessage={dict.common.saved}
        errorMessages={contentErrorMessages(locale)}
        fallbackErrorMessage={dict.common.saveError}
      >
        <input type="hidden" name="id" value={page.id} />
        <input type="hidden" name="order" value={page.order} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-titleNl`}>{nl ? "Titel (NL)" : "Title (NL)"}</Label>
            <Input id={`${uid}-titleNl`} name="titleNl" defaultValue={page.titleNl} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-titleEn`}>{nl ? "Titel (EN)" : "Title (EN)"}</Label>
            <Input id={`${uid}-titleEn`} name="titleEn" defaultValue={page.titleEn ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SlugField
            locale={locale}
            id={`${uid}-slug`}
            name="slug"
            value={slug}
            onChange={setSlug}
          />
          <div>
            <Label htmlFor={`${uid}-headerTabId`}>{nl ? "Categorie" : "Category"}</Label>
            <Select id={`${uid}-headerTabId`} name="headerTabId" defaultValue={page.headerTabId ?? ""}>
              <option value="">— {nl ? "niet gekoppeld" : "unlinked"} —</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {nl ? t.labelNl : t.labelEn} (/{t.slug})
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? '"Niet gekoppeld" haalt de pagina uit de navigatie; ze blijft bestaan en bereikbaar op /p/<slug>.'
                : '"Unlinked" takes the page out of the navigation; it keeps existing and stays reachable at /p/<slug>.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="visibleOnCategoryPage"
              defaultChecked={page.visibleOnCategoryPage}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-vtk-ink">
                {nl ? "Tonen op categoriepagina" : "Show on category page"}
              </span>
              <span className="block text-xs text-[#5c667f]">
                {nl ? "Als kaart op de overzichtspagina." : "As a card on the category overview."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="visibleInHeader"
              defaultChecked={page.visibleInHeader}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-vtk-ink">
                {nl ? "Tonen in dropdown" : "Show in dropdown"}
              </span>
              <span className="block text-xs text-[#5c667f]">
                {nl ? "In het menu bij hover over de categorie." : "In the menu when hovering over the category."}
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={page.published} />
            {nl ? "Gepubliceerd" : "Published"}
          </label>
        </div>

        <PageRightsFields locale={locale} page={page} roles={roles} uid={uid} />

        <div className="grid grid-cols-1 gap-4 border-t border-vtk-blue/10 pt-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-excerptNl`}>
              {nl ? "Korte beschrijving (NL)" : "Excerpt (NL)"}
            </Label>
            <Textarea id={`${uid}-excerptNl`} name="excerptNl" rows={2} defaultValue={page.excerptNl ?? ""} />
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
            <Textarea id={`${uid}-excerptEn`} name="excerptEn" rows={2} defaultValue={page.excerptEn ?? ""} />
          </div>
        </div>

        <div className="border-t border-vtk-blue/10 pt-5">
          <StorageImageField
            defaultKey={page.imageKey}
            locale={locale}
            label={nl ? "Foto van de pagina" : "Page photo"}
            fallbackUrl="/technisch-pattern-light.png"
            fallbackPosition="left"
            emptyHint={nl ? "Technisch patroon" : "Technical pattern"}
            helpText={
              nl
                ? "Deze foto draagt de kop bovenaan de pagina en staat op haar kaart op de categoriepagina. Zonder foto blijft het technische patroon uit de huisstijl."
                : "This photo carries the header at the top of the page and appears on its card on the category page. Without one, the technical brand pattern stays."
            }
            srContext={page.titleNl}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-vtk-blue/10 pt-5 sm:grid-cols-3">
          <div>
            <Label htmlFor={`${uid}-ctaLabelNl`}>{nl ? "Knoptekst (NL)" : "Button label (NL)"}</Label>
            <Input id={`${uid}-ctaLabelNl`} name="ctaLabelNl" defaultValue={page.ctaLabelNl ?? ""} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Knop naast de titel, voor de app of het formulier waar deze pagina over gaat. Leeg laten geeft geen knop."
                : "Button next to the title, for the app or form this page is about. Leave empty for no button."}
            </p>
          </div>
          <div>
            <Label htmlFor={`${uid}-ctaLabelEn`}>{nl ? "Knoptekst (EN)" : "Button label (EN)"}</Label>
            <Input id={`${uid}-ctaLabelEn`} name="ctaLabelEn" defaultValue={page.ctaLabelEn ?? ""} />
          </div>
          <div>
            <Label htmlFor={`${uid}-ctaUrl`}>{nl ? "Knopadres" : "Button URL"}</Label>
            <Input id={`${uid}-ctaUrl`} name="ctaUrl" defaultValue={page.ctaUrl ?? ""} />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Een pad op deze site (/shift) of een volledig adres (https://...)."
                : "A path on this site (/shift) or a full address (https://...)."}
            </p>
          </div>
        </div>
      </SaveForm>

      <div className="mt-5 border-t border-vtk-blue/10 pt-5">
        <UnlinkPageButton locale={locale} page={page} onUnlinked={onClose} />
      </div>

      {canDelete && (
        <div className="mt-5 border-t border-vtk-blue/10 pt-5">
          <DeletePageButton locale={locale} page={page} onDeleted={onClose} />
        </div>
      )}
    </Card>
  );
}

/** Verwijdert alleen de categorie-koppeling; de pagina zelf blijft bestaan. */
function UnlinkPageButton({
  locale,
  page,
  onUnlinked,
}: {
  locale: Locale;
  page: PageNode;
  onUnlinked: () => void;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  function unlink() {
    const form = new FormData();
    form.append("id", page.id);
    startTransition(async () => {
      const result = await unlinkPageFromTabAction(SAVE_IDLE, form);
      if (result.status === "error") {
        showToast({
          message: contentErrorMessages(locale)[result.code] ?? dict.common.saveError,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? "Pagina uit categorie verwijderd" : "Page removed from category",
        variant: "success",
      });
      onUnlinked();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs text-[#5c667f]">
        {nl
          ? "Haal de pagina uit deze categorie zonder de pagina of inhoud te verwijderen. Ze blijft bereikbaar op /p/<slug> en kan later opnieuw aan een categorie worden toegevoegd."
          : "Remove the page from this category without deleting the page or its content. It remains available at /p/<slug> and can be added to a category again later."}
      </p>
      <Button variant="secondary" size="sm" type="button" disabled={pending} onClick={unlink}>
        {pending
          ? nl
            ? "Losmaken…"
            : "Unlinking…"
          : nl
            ? "Uit categorie verwijderen"
            : "Remove from category"}
      </Button>
    </div>
  );
}

/**
 * Pagina verwijderen vanuit de boom. De inspector sluit daarna, want het
 * geselecteerde item bestaat niet meer.
 */
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
  const dict = getDictionary(locale);
  const showToast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const form = new FormData();
    form.append("id", page.id);
    startTransition(async () => {
      const result = await deletePageAction(SAVE_IDLE, form);
      setConfirming(false);
      if (result.status === "error") {
        // Bv. een pagina die iemand anders intussen verwijderde: melden, niet
        // stilzwijgend sluiten alsof het gelukt is.
        showToast({
          message: contentErrorMessages(locale)[result.code] ?? dict.common.saveError,
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: nl ? "Pagina verwijderd" : "Page deleted", variant: "success" });
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
            ? `"${page.titleNl}" (/${page.slug}) wordt permanent verwijderd, samen met de inhoud en de bijlagen. Wie de link nog heeft, krijgt een 404. Dit kan niet ongedaan gemaakt worden.`
            : `"${page.titleNl}" (/${page.slug}) will be permanently deleted, along with its content and attachments. Anyone with the link will get a 404. This cannot be undone.`
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

/**
 * Compacte weergave van de rechten: jaarlijks nakijken en wie mag bewerken. Dit
 * wijzigt zelden, dus standaard staat er enkel een samenvatting; "Bewerken"
 * klapt de volledige rollenlijst open.
 *
 * De checkboxes blijven ALTIJD gemonteerd (enkel visueel verborgen). Zouden ze
 * uit de DOM verdwijnen, dan stuurt het formulier geen `editorRoleIds` mee en
 * zou opslaan alle bewerkrollen wissen.
 */
function PageRightsFields({
  locale,
  page,
  roles,
  uid,
}: {
  locale: Locale;
  page: PageNode;
  roles: RoleOption[];
  uid: string;
}) {
  const nl = locale === "nl";
  const [editing, setEditing] = useState(false);
  const [yearly, setYearly] = useState(page.needsYearlyEdit);
  const [roleIds, setRoleIds] = useState<string[]>(page.editorRoleIds);

  const assigned = roles.filter((r) => roleIds.includes(r.id));

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <fieldset className="border-t border-vtk-blue/10 pt-5">
      <div className="flex items-start justify-between gap-3">
        <legend className="text-sm font-semibold text-vtk-ink">
          {nl ? "Rechten" : "Rights"}
        </legend>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 rounded-full border border-vtk-blue/20 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
        >
          {editing ? (nl ? "Klaar" : "Done") : nl ? "Bewerken" : "Edit"}
        </button>
      </div>

      <label className="mt-2 inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="needsYearlyEdit"
          checked={yearly}
          onChange={(e) => setYearly(e.target.checked)}
        />
        {nl ? "Jaarlijks nakijken" : "Yearly review"}
      </label>

      {/* Samenvatting: enkel de rollen die deze pagina mogen bewerken. */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#5c667f]">{nl ? "Mag bewerken:" : "Can edit:"}</span>
          {assigned.length === 0 ? (
            <span className="text-xs text-[#34405e]">
              {nl
                ? "niemand (enkel Alle pagina's bewerken / superadmin)"
                : "nobody (only Edit all pages / super admin)"}
            </span>
          ) : (
            assigned.map((r) => (
              <span
                key={r.id}
                className="rounded-full bg-vtk-blue-soft/70 px-2 py-0.5 text-[11px] font-medium text-[#34405e]"
              >
                {r.name}
              </span>
            ))
          )}
        </div>
      )}

      <div className={editing ? "mt-3" : "hidden"}>
        <p className="mb-2 text-xs text-[#5c667f]">
          {nl
            ? 'Leden met een aangevinkte rol (en het recht "Toegewezen pagina\'s bewerken") kunnen de inhoud van deze pagina bewerken.'
            : 'Members holding a checked role (plus the "Edit assigned pages" permission) can edit this page\'s content.'}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {roles.map((role) => (
            <label key={role.id} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="editorRoleIds"
                value={role.id}
                checked={roleIds.includes(role.id)}
                onChange={() => toggleRole(role.id)}
                id={`${uid}-role-${role.id}`}
              />
              {role.name}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
